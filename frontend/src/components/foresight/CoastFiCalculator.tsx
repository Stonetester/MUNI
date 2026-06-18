'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Check, CircleDollarSign, Flag, Info, RotateCcw, Sparkles, Sun, Target, TrendingUp } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ForecastResponse, InvestmentHolding } from '@/lib/types'
import { getFinancialProfile, updateFinancialProfile } from '@/lib/api'
import { formatCurrency, cn } from '@/lib/utils'

// Defaults taken directly from the "Coast FI" methodology in the source video
// (Traditional and Coast FI/RE Journey Summary spreadsheet).
const DEFAULTS = {
  investmentReturn: 10, // % nominal annual
  inflationRate: 3, // %
  effectiveTaxRate: 30, // % (informational — retirement spend is entered after-tax)
  safeWithdrawalRate: 4, // %
  salaryGrowthRate: 3, // %
  retirementAge: 65,
}

// Account types that compound toward retirement (the "invested" pile).
const GROWTH_TYPES = /401k|ira|hsa|brokerage|investment|hysa|retirement|roth/i

interface CoastFiDetail {
  title: string
  value: string
  formula: string
  notes: string[]
  inputs: Array<{ label: string; value: string; note?: string }>
}

interface Props {
  forecast: ForecastResponse
  holdings: InvestmentHolding[]
  currentAge: number
  monthlySpend: number
  monthlyContribution: number
  onDetail: (detail: CoastFiDetail) => void
}

interface Inputs {
  currentAge: number
  retirementAge: number
  currentInvested: number
  monthlyContribution: number
  monthlyRetirementSpend: number
  investmentReturn: number
  inflationRate: number
  safeWithdrawalRate: number
}

// Lump sum needed TODAY so that, with growth alone (no new contributions),
// it reaches `futureTarget` after `years` at the given real return.
function coastNumber(futureTarget: number, discountRate: number, years: number) {
  return futureTarget / Math.pow(1 + discountRate, Math.max(years, 0))
}

export default function CoastFiCalculator({
  forecast, holdings, currentAge, monthlySpend, monthlyContribution, onDetail,
}: Props) {
  // ---- Auto-derived starting values (all editable below) ----
  const derivedInvested = useMemo(() => {
    const fromForecast = forecast.account_forecasts
      .filter((a) => GROWTH_TYPES.test(a.account_type) || a.annual_return_pct > 0)
      .reduce((sum, a) => sum + a.starting_balance, 0)
    if (fromForecast > 0) return fromForecast
    return holdings.reduce((sum, h) => sum + (h.current_value ?? 0), 0)
  }, [forecast, holdings])

  const investedSources = useMemo(() =>
    forecast.account_forecasts
      .filter((a) => GROWTH_TYPES.test(a.account_type) || a.annual_return_pct > 0)
      .map((a) => ({ name: a.account_name, balance: a.starting_balance, type: a.account_type })),
  [forecast])

  const [inputs, setInputs] = useState<Inputs>({
    currentAge: currentAge || 30,
    retirementAge: DEFAULTS.retirementAge,
    currentInvested: Math.round(derivedInvested),
    monthlyContribution: Math.round(monthlyContribution),
    monthlyRetirementSpend: Math.round(monthlySpend) || 6000,
    investmentReturn: DEFAULTS.investmentReturn,
    inflationRate: DEFAULTS.inflationRate,
    safeWithdrawalRate: DEFAULTS.safeWithdrawalRate,
  })

  const set = (key: keyof Inputs, value: number) =>
    setInputs((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }))

  // Load a saved "expected retirement spend" override from the Financial Profile.
  const [savedSpend, setSavedSpend] = useState<number | null>(null)
  const [spendSaveState, setSpendSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  useEffect(() => {
    getFinancialProfile()
      .then((p) => {
        if (p?.monthly_retirement_spend != null) {
          setSavedSpend(p.monthly_retirement_spend)
          setInputs((prev) => ({ ...prev, monthlyRetirementSpend: Math.round(p.monthly_retirement_spend!) }))
        }
      })
      .catch(() => { /* non-fatal */ })
  }, [])

  const saveRetirementSpend = async () => {
    setSpendSaveState('saving')
    try {
      await updateFinancialProfile({ monthly_retirement_spend: inputs.monthlyRetirementSpend })
      setSavedSpend(inputs.monthlyRetirementSpend)
      setSpendSaveState('saved')
      setTimeout(() => setSpendSaveState('idle'), 2000)
    } catch {
      setSpendSaveState('idle')
    }
  }

  const reset = () => setInputs({
    currentAge: currentAge || 30,
    retirementAge: DEFAULTS.retirementAge,
    currentInvested: Math.round(derivedInvested),
    monthlyContribution: Math.round(monthlyContribution),
    monthlyRetirementSpend: Math.round(monthlySpend) || 6000,
    investmentReturn: DEFAULTS.investmentReturn,
    inflationRate: DEFAULTS.inflationRate,
    safeWithdrawalRate: DEFAULTS.safeWithdrawalRate,
  })

  const result = useMemo(() => {
    const years = inputs.retirementAge - inputs.currentAge
    const nominal = inputs.investmentReturn / 100
    const inflation = inputs.inflationRate / 100
    const swr = inputs.safeWithdrawalRate / 100

    // Spend grows with inflation between now and retirement. The FIRE number is in
    // FUTURE dollars; the Coast FI number discounts it back at the nominal return.
    // This reproduces the source methodology exactly (e.g. $14k/mo → $4.2M FIRE,
    // discounted at 10% over 35 yrs → $149,453 Coast FI).
    const annualRetirementSpendToday = inputs.monthlyRetirementSpend * 12
    const annualRetirementSpendFuture = annualRetirementSpendToday * Math.pow(1 + inflation, years)

    // Traditional FIRE number (future dollars): inflated annual spend / SWR.
    const fireNumber = swr > 0 ? annualRetirementSpendFuture / swr : 0
    // Coast FI number (today's dollars): lump sum that, growing at the nominal
    // return with NO new contributions, reaches the FIRE number by retirement.
    const coastFiNumber = coastNumber(fireNumber, nominal, years)

    const alreadyCoastFi = inputs.currentInvested >= coastFiNumber
    const thisYear = new Date().getFullYear()

    // Year-by-year projection (nominal dollars). Each future year the Coast FI
    // target shrinks (fewer compounding years left). Crossover = the year the
    // invested balance first meets/exceeds that year's Coast FI target.
    const annualContrib = inputs.monthlyContribution * 12
    let balance = inputs.currentInvested
    let coastFiYear: number | null = alreadyCoastFi ? thisYear : null
    const projection: Array<{
      year: number; age: number; balance: number; coastTarget: number
      contributionsToDate: number; growthToDate: number; coastOnly: number
    }> = []
    let contributionsToDate = inputs.currentInvested

    for (let y = 0; y <= years; y++) {
      const yearsLeft = years - y
      const coastTargetThisYear = coastNumber(fireNumber, nominal, yearsLeft)
      projection.push({
        year: thisYear + y,
        age: inputs.currentAge + y,
        balance: Math.round(balance),
        coastTarget: Math.round(coastTargetThisYear),
        contributionsToDate: Math.round(contributionsToDate),
        growthToDate: Math.round(balance - contributionsToDate),
        // Pure-coast curve from today (no new contributions) — illustrates the idea.
        coastOnly: Math.round(inputs.currentInvested * Math.pow(1 + nominal, y)),
      })
      if (coastFiYear === null && balance >= coastTargetThisYear) coastFiYear = thisYear + y
      // advance one year: grow then contribute
      balance = balance * (1 + nominal) + annualContrib
      contributionsToDate += annualContrib
    }

    const yearsToCoast = coastFiYear !== null ? coastFiYear - thisYear : null

    return {
      years, nominal, inflation, fireNumber, coastFiNumber, alreadyCoastFi,
      coastFiYear, yearsToCoast, fireYear: thisYear + years,
      projection,
      annualRetirementSpendToday, annualRetirementSpendFuture, thisYear,
    }
  }, [inputs])

  const pct = result.coastFiNumber > 0
    ? Math.min(100, (inputs.currentInvested / result.coastFiNumber) * 100)
    : 0

  const coastFiDetail: CoastFiDetail = {
    title: 'Coast FI number',
    value: formatCurrency(result.coastFiNumber),
    formula: `FIRE number / (1 + return)^years = ${formatCurrency(result.fireNumber)} / (1 + ${inputs.investmentReturn}%)^${result.years} = ${formatCurrency(result.coastFiNumber)}. This is the amount you'd need invested TODAY so compound growth alone carries you to your full FIRE number by age ${inputs.retirementAge} — even if you never contribute another dollar again.`,
    notes: [
      `FIRE number = inflated annual retirement spend / safe withdrawal rate = ${formatCurrency(result.annualRetirementSpendFuture)} / ${inputs.safeWithdrawalRate}% = ${formatCurrency(result.fireNumber)}.`,
      `Future spend = ${formatCurrency(result.annualRetirementSpendToday)}/yr today grown at ${inputs.inflationRate}% inflation for ${result.years} years = ${formatCurrency(result.annualRetirementSpendFuture)}/yr.`,
      'Coast FI does not mean you can stop working — it means your retirement is already funded by compounding, so future income only needs to cover today’s living costs.',
    ],
    inputs: [
      { label: 'Current invested balance', value: formatCurrency(inputs.currentInvested), note: 'Growth accounts (401k, IRA, brokerage, HSA, HYSA)' },
      { label: 'FIRE number (future $)', value: formatCurrency(result.fireNumber) },
      { label: 'Investment return', value: `${inputs.investmentReturn}%`, note: 'Nominal annual; the discount rate' },
      { label: 'Years until retirement', value: `${result.years}`, note: `age ${inputs.currentAge} → ${inputs.retirementAge}` },
    ],
  }

  const fireDetail: CoastFiDetail = {
    title: 'Traditional FIRE number',
    value: formatCurrency(result.fireNumber),
    formula: `Inflated annual retirement spend / safe withdrawal rate = ${formatCurrency(result.annualRetirementSpendFuture)} / ${inputs.safeWithdrawalRate}% = ${formatCurrency(result.fireNumber)}. At a ${inputs.safeWithdrawalRate}% withdrawal rate this portfolio funds your retirement spending indefinitely (the 4% rule).`,
    notes: [
      `In future dollars at age ${inputs.retirementAge}: today's ${formatCurrency(inputs.monthlyRetirementSpend)}/mo grown at ${inputs.inflationRate}% inflation for ${result.years} years.`,
      `Reaching this by contributing ${formatCurrency(inputs.monthlyContribution)}/mo is projected for ${result.fireYear} (age ${inputs.retirementAge}).`,
    ],
    inputs: [
      { label: 'Monthly retirement spend (today’s $)', value: formatCurrency(inputs.monthlyRetirementSpend) },
      { label: 'Annual retirement spend (future $)', value: formatCurrency(result.annualRetirementSpendFuture), note: `${formatCurrency(result.annualRetirementSpendToday)}/yr × (1 + ${inputs.inflationRate}%)^${result.years}` },
      { label: 'Safe withdrawal rate', value: `${inputs.safeWithdrawalRate}%` },
    ],
  }

  const sourceDetail: CoastFiDetail = {
    title: 'Current invested balance',
    value: formatCurrency(inputs.currentInvested),
    formula: 'Sum of the starting balances of every growth account in your forecast (401k, IRA, HSA, brokerage, HYSA). Edit the field above to model a different starting pile.',
    notes: ['Cash-only checking/savings and liabilities are excluded — only assets that compound toward retirement count.'],
    inputs: investedSources.length
      ? investedSources.map((s) => ({ label: s.name, value: formatCurrency(s.balance), note: s.type }))
      : [{ label: 'No growth accounts detected', value: formatCurrency(0), note: 'Add 401k / IRA / brokerage accounts or holdings' }],
  }

  return (
    <>
      <Card className="border-amber-400/30 bg-amber-400/5">
        <div className="flex gap-3">
          <Sun className="shrink-0 text-amber-300" />
          <div>
            <p className="font-semibold text-amber-300">Coast FI — the milestone before $100K</p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              Coast FI is the point where you&apos;ve invested <em>enough</em> that, even if you stopped contributing today,
              compound growth alone carries you to a comfortable retirement at your target age. Hit it early and every future
              paycheck only has to cover today&apos;s life — not tomorrow&apos;s retirement.
            </p>
          </div>
        </div>
      </Card>

      {/* Headline numbers */}
      <Card className={cn('border-primary/40', result.alreadyCoastFi ? 'bg-primary/10' : 'bg-primary/5')}>
        <div className="grid grid-cols-2 gap-4">
          <Metric icon={Target} tone="green" label="Coast FI number" value={formatCurrency(result.coastFiNumber)}
            onClick={() => onDetail(coastFiDetail)} />
          <Metric icon={Flag} tone="purple" label="Traditional FIRE number" value={formatCurrency(result.fireNumber)}
            onClick={() => onDetail(fireDetail)} />
          <Metric icon={CircleDollarSign} tone="blue" label="Invested today" value={formatCurrency(inputs.currentInvested)}
            onClick={() => onDetail(sourceDetail)} />
          <Metric icon={TrendingUp} tone="green"
            label={result.alreadyCoastFi ? 'Coast FI status' : 'Coast FI reached'}
            value={result.alreadyCoastFi
              ? 'Reached 🎉'
              : result.coastFiYear !== null
                ? `${result.coastFiYear} · age ${inputs.currentAge + (result.yearsToCoast ?? 0)}`
                : 'After retirement'} />
        </div>

        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
            <span>Progress to Coast FI</span>
            <span className="font-semibold text-primary">{pct.toFixed(0)}%</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-white/10">
            <div className={cn('h-full rounded-full', result.alreadyCoastFi ? 'bg-primary' : 'bg-amber-400')}
              style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            {result.alreadyCoastFi
              ? `You're already Coast FI. Investing nothing more, your pile is projected to reach the FIRE number by ${result.fireYear}.`
              : `Contributing ${formatCurrency(inputs.monthlyContribution)}/mo, you reach Coast FI in ${result.yearsToCoast ?? '—'} ${result.yearsToCoast === 1 ? 'year' : 'years'}${result.coastFiYear ? ` (${result.coastFiYear})` : ''}.`}
          </p>
        </div>
      </Card>

      {/* Projection chart */}
      <Card title="Contributions vs. growth">
        <p className="mb-3 text-xs text-muted">
          Your projected invested balance (real dollars) vs. the shrinking Coast FI target. Where they cross, you&apos;re Coast FI.
          The dashed line is the pure-coast path — today&apos;s pile growing with zero new contributions.
        </p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={result.projection}>
              <defs>
                <linearGradient id="coastBalance" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22c55e" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#2d3748" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="year" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} width={52}
                tickFormatter={(v) => `$${Math.round(v / 1000)}k`} />
              <Tooltip
                formatter={(value: number, name: string) => [formatCurrency(value),
                  name === 'balance' ? 'Projected balance' : name === 'coastTarget' ? 'Coast FI target' : 'Coast-only (no contrib.)']}
                labelFormatter={(label) => `Year ${label}`}
                contentStyle={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 12 }} />
              <Area type="monotone" dataKey="balance" stroke="#22c55e" strokeWidth={3} fill="url(#coastBalance)" />
              <Line type="monotone" dataKey="coastTarget" stroke="#fbbf24" strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="coastOnly" stroke="#a78bfa" strokeWidth={2} strokeDasharray="5 5" dot={false} />
              {result.coastFiYear !== null && !result.alreadyCoastFi && (
                <ReferenceLine x={result.coastFiYear} stroke="#22c55e" strokeDasharray="4 4"
                  label={{ value: 'Coast FI', fill: '#22c55e', fontSize: 10, position: 'top' }} />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Editable assumptions */}
      <Card title="Your inputs & assumptions">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-xs text-muted">Pre-filled from your real accounts and spending. Adjust anything to model a scenario.</p>
          <button onClick={reset} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-primary">
            <RotateCcw size={12} /> Reset
          </button>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Current age" value={inputs.currentAge} onChange={(v) => set('currentAge', v)} />
          <Field label="Retirement age" value={inputs.retirementAge} onChange={(v) => set('retirementAge', v)} />
          <Field label="Invested today" value={inputs.currentInvested} prefix="$" step={1000} onChange={(v) => set('currentInvested', v)} />
          <Field label="Monthly contribution" value={inputs.monthlyContribution} prefix="$" step={50} onChange={(v) => set('monthlyContribution', v)} />
          <Field label="Monthly retirement spend" value={inputs.monthlyRetirementSpend} prefix="$" step={100} onChange={(v) => set('monthlyRetirementSpend', v)} />
          <Field label="Investment return" value={inputs.investmentReturn} suffix="%" step={0.5} onChange={(v) => set('investmentReturn', v)} />
          <Field label="Inflation rate" value={inputs.inflationRate} suffix="%" step={0.5} onChange={(v) => set('inflationRate', v)} />
          <Field label="Safe withdrawal rate" value={inputs.safeWithdrawalRate} suffix="%" step={0.25} onChange={(v) => set('safeWithdrawalRate', v)} />
        </div>

        {/* Persist the retirement-spend assumption so the AI chat uses the same number */}
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-amber-400/20 bg-amber-400/5 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-text-secondary">
            <span className="font-medium text-amber-300">Monthly retirement spend</span> drives your whole Coast FI number.
            {savedSpend != null
              ? ` Saved: ${formatCurrency(savedSpend)}/mo — the AI chat uses this too.`
              : ' By default it’s estimated from your recurring spending (excludes wedding, student loans, and smooths one-offs). Set your own to be precise.'}
          </p>
          <button
            onClick={saveRetirementSpend}
            disabled={spendSaveState === 'saving' || inputs.monthlyRetirementSpend === savedSpend}
            className="flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-xs font-medium text-amber-300 hover:bg-amber-400/20 disabled:opacity-50"
          >
            {spendSaveState === 'saved' ? <><Check size={13} /> Saved</> : spendSaveState === 'saving' ? 'Saving…' : `Save ${formatCurrency(inputs.monthlyRetirementSpend)}/mo`}
          </button>
        </div>
      </Card>

      <Card className="border-purple-400/30 bg-purple-400/5">
        <div className="flex gap-3">
          <Sparkles className="shrink-0 text-purple-300" />
          <div>
            <p className="font-semibold text-purple-300">What this means for you</p>
            <p className="mt-1 text-sm leading-6 text-text-secondary">
              {result.alreadyCoastFi ? (
                <>You&apos;ve already crossed Coast FI. At {inputs.investmentReturn}% nominal return, your {formatCurrency(inputs.currentInvested)} is on track
                to reach the {formatCurrency(result.fireNumber)} FIRE number by {result.fireYear} with no further investing required — so you could
                redirect future savings toward shorter-term goals.</>
              ) : (
                <>You need {formatCurrency(result.coastFiNumber)} invested to be Coast FI. You&apos;re {pct.toFixed(0)}% of the way there
                ({formatCurrency(Math.max(0, result.coastFiNumber - inputs.currentInvested))} to go). At {formatCurrency(inputs.monthlyContribution)}/mo
                you cross that line {result.yearsToCoast !== null ? `in about ${result.yearsToCoast} ${result.yearsToCoast === 1 ? 'year' : 'years'}` : 'just before retirement'} —
                after which compounding alone finishes the job by {result.fireYear}.</>
              )}
            </p>
          </div>
        </div>
      </Card>
    </>
  )
}

function Field({ label, value, onChange, prefix, suffix, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void; prefix?: string; suffix?: string; step?: number
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-text-secondary">{label}</span>
      <div className="flex items-center rounded-lg border border-white/10 bg-background px-2 focus-within:border-primary/50">
        {prefix && <span className="text-xs text-muted">{prefix}</span>}
        <input
          type="number" inputMode="decimal" step={step} value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="w-full bg-transparent py-2 text-sm text-text-primary outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
        />
        {suffix && <span className="text-xs text-muted">{suffix}</span>}
      </div>
    </label>
  )
}

function Metric({ icon: Icon, label, value, tone, onClick }: {
  icon: React.ElementType; label: string; value: string; tone: 'green' | 'blue' | 'purple'; onClick?: () => void
}) {
  const colors = { green: 'text-primary', blue: 'text-info', purple: 'text-purple-300' }
  const content = (
    <>
      <div className="flex items-start justify-between"><Icon size={17} className={colors[tone]} />{onClick && <Info size={14} className="text-muted" />}</div>
      <p className="mt-2 text-xs text-text-secondary">{label}</p>
      <p className={cn('mt-0.5 break-words text-lg font-bold', colors[tone])}>{value}</p>
    </>
  )
  return onClick
    ? <button onClick={onClick} className="rounded-xl border border-white/10 bg-surface p-3 text-left hover:border-white/20 hover:bg-surface-2">{content}</button>
    : <div className="rounded-xl border border-white/10 bg-surface p-3">{content}</div>
}
