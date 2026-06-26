'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Area, AreaChart, CartesianGrid, Line, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { Calculator, Check, CircleDollarSign, Flag, Info, RotateCcw, Sparkles, Sun, Target, TrendingUp, Wallet } from 'lucide-react'
import Card from '@/components/ui/Card'
import { ForecastResponse, InvestmentHolding } from '@/lib/types'
import { getFinancialProfile, getReturns, updateFinancialProfile } from '@/lib/api'
import { formatCurrency, cn } from '@/lib/utils'
import { useViewMode } from '@/lib/viewMode'
import { solveFor, type SolveTarget, type SolverInputs } from '@/lib/coastFiSolver'

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
// Account types where a measured XIRR is meaningful (exclude HYSA which is just APY).
const XIRR_TYPES = /401k|ira|hsa|brokerage|roth/i

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
  const { mode } = useViewMode()
  const isJoint = mode === 'joint'

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

  // Whether profile settings have finished loading (gate for auto-save)
  const [profileLoaded, setProfileLoaded] = useState(false)
  // Measured blended XIRR from real accounts — used as the smart default return rate
  const [xirrReturn, setXirrReturn] = useState<number | null>(null)
  // Auto-save indicator
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Tracks whether the age prop has already been synced into inputs
  const ageSynced = useRef(false)

  // Sync age prop when it arrives from the async /auth/me call (prop starts at 30,
  // then updates once the API responds). Only apply while profile hasn't loaded yet
  // (after that the user may have edited the field manually).
  useEffect(() => {
    if (currentAge != null && !ageSynced.current && !profileLoaded) {
      ageSynced.current = true
      setInputs((prev) => ({ ...prev, currentAge }))
    }
  }, [currentAge, profileLoaded])

  // On mount (and when joint mode changes): fetch XIRR rates + load saved settings
  useEffect(() => {
    Promise.all([
      getFinancialProfile().catch(() => null),
      getReturns(isJoint).catch(() => []),
    ]).then(([profile, returns]) => {
      // Compute a balance-weighted blended XIRR from non-estimated growth accounts
      const eligible = returns.filter(
        (r) => r.annualized_pct != null && !r.low_confidence && XIRR_TYPES.test(r.account_type ?? '')
      )
      const totalBal = eligible.reduce((s, r) => s + (r.start_balance ?? 1), 0)
      const blended = eligible.length === 0
        ? null
        : totalBal > 0
          ? eligible.reduce((s, r) => s + r.annualized_pct! * (r.start_balance ?? 1), 0) / totalBal
          : eligible.reduce((s, r) => s + r.annualized_pct!, 0) / eligible.length
      const roundedXirr = blended != null ? Math.round(blended * 10) / 10 : null
      setXirrReturn(roundedXirr)

      // Apply saved profile settings; fall back to XIRR rate then DEFAULTS
      setInputs((prev) => ({
        ...prev,
        currentAge: currentAge || prev.currentAge,
        investmentReturn: profile?.coast_fi_investment_return
          ?? roundedXirr
          ?? DEFAULTS.investmentReturn,
        inflationRate: profile?.coast_fi_inflation_rate ?? DEFAULTS.inflationRate,
        safeWithdrawalRate: profile?.coast_fi_swr ?? DEFAULTS.safeWithdrawalRate,
        retirementAge: profile?.coast_fi_retirement_age ?? DEFAULTS.retirementAge,
        monthlyRetirementSpend: profile?.monthly_retirement_spend ?? prev.monthlyRetirementSpend,
      }))

      ageSynced.current = true
      setProfileLoaded(true)
    })
  }, [isJoint]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-save all Coast FI assumptions 1.5 s after any change (debounced)
  useEffect(() => {
    if (!profileLoaded) return
    if (saveTimer.current) clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
      setSaveState('saving')
      try {
        await updateFinancialProfile({
          coast_fi_investment_return: inputs.investmentReturn,
          coast_fi_inflation_rate: inputs.inflationRate,
          coast_fi_swr: inputs.safeWithdrawalRate,
          coast_fi_retirement_age: inputs.retirementAge,
          monthly_retirement_spend: inputs.monthlyRetirementSpend,
        })
        setSaveState('saved')
        setTimeout(() => setSaveState('idle'), 2000)
      } catch {
        setSaveState('idle')
      }
    }, 1500)
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current) }
  }, [
    inputs.investmentReturn, inputs.inflationRate, inputs.safeWithdrawalRate,
    inputs.retirementAge, inputs.monthlyRetirementSpend, profileLoaded,
  ])

  const reset = () => setInputs({
    currentAge: currentAge || 30,
    retirementAge: DEFAULTS.retirementAge,
    currentInvested: Math.round(derivedInvested),
    monthlyContribution: Math.round(monthlyContribution),
    monthlyRetirementSpend: Math.round(monthlySpend) || 6000,
    investmentReturn: xirrReturn ?? DEFAULTS.investmentReturn,
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

    // "Retirement salary" (today's $): target = the income the fully-funded portfolio pays
    // (= your retirement spend); funded-so-far = what today's invested balance pays at the SWR.
    const targetAnnualSalary = annualRetirementSpendToday
    const fundedAnnualSalary = inputs.currentInvested * swr
    const salaryPctFunded = targetAnnualSalary > 0 ? (fundedAnnualSalary / targetAnnualSalary) * 100 : 0

    return {
      years, nominal, inflation, fireNumber, coastFiNumber, alreadyCoastFi,
      coastFiYear, yearsToCoast, fireYear: thisYear + years,
      projection,
      annualRetirementSpendToday, annualRetirementSpendFuture, thisYear,
      targetAnnualSalary, fundedAnnualSalary, salaryPctFunded,
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
      `Coast FI does not mean you can stop working — it means your retirement is already funded by compounding, so future income only needs to cover today's living costs.`,
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
      { label: "Monthly retirement spend (today's $)", value: formatCurrency(inputs.monthlyRetirementSpend) },
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
            {isJoint && (
              <p className="mt-2 text-xs text-amber-200/80">
                Joint mode: this funds <em>both</em> of you — your combined retirement spend, your combined invested pile, and
                the <strong>older partner&apos;s</strong> age (age {inputs.currentAge}) so the target is met by the time the first of you retires (worst case).
              </p>
            )}
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

      {/* Retirement salary */}
      <Card title="Your retirement salary">
        <p className="mb-3 text-xs text-muted">
          What your retirement actually pays you, in today&apos;s dollars — the income side of the numbers above.
        </p>
        <div className="grid grid-cols-2 gap-4">
          <Metric icon={Wallet} tone="green" label="Target salary (when fully funded)"
            value={`${formatCurrency(result.targetAnnualSalary)}/yr`}
            onClick={() => onDetail({
              title: 'Target retirement salary',
              value: `${formatCurrency(result.targetAnnualSalary)}/yr`,
              formula: `Your retirement spend is the income your fully-funded portfolio pays: ${formatCurrency(inputs.monthlyRetirementSpend)}/mo × 12 = ${formatCurrency(result.targetAnnualSalary)}/yr (${formatCurrency(result.targetAnnualSalary / 12)}/mo). At the ${inputs.safeWithdrawalRate}% safe withdrawal rate, the ${formatCurrency(result.fireNumber)} FIRE number is sized to pay exactly this, inflation-adjusted, for life.`,
              notes: [
                `This is in today's dollars — the FIRE number is the inflated lump sum that funds it.`,
                'Change "Monthly retirement spend" above to change this salary.',
              ],
              inputs: [
                { label: 'Monthly retirement spend', value: formatCurrency(inputs.monthlyRetirementSpend) },
                { label: 'Target annual salary', value: `${formatCurrency(result.targetAnnualSalary)}/yr` },
                { label: 'Target monthly salary', value: `${formatCurrency(result.targetAnnualSalary / 12)}/mo` },
              ],
            })} />
          <Metric icon={CircleDollarSign} tone="blue" label="Funded so far (current pile × 4%)"
            value={`${formatCurrency(result.fundedAnnualSalary)}/yr`}
            onClick={() => onDetail({
              title: 'Retirement salary funded so far',
              value: `${formatCurrency(result.fundedAnnualSalary)}/yr`,
              formula: `Your invested ${formatCurrency(inputs.currentInvested)} × ${inputs.safeWithdrawalRate}% safe withdrawal rate = ${formatCurrency(result.fundedAnnualSalary)}/yr (${formatCurrency(result.fundedAnnualSalary / 12)}/mo) — what your current portfolio could safely pay if you retired today. That's ${result.salaryPctFunded.toFixed(0)}% of your ${formatCurrency(result.targetAnnualSalary)}/yr target.`,
              notes: [
                'This grows toward the target salary as your investments compound and you keep contributing.',
                `It is NOT today's income — it is the retirement paycheck your current balance would support.`,
              ],
              inputs: [
                { label: 'Invested today', value: formatCurrency(inputs.currentInvested) },
                { label: 'Safe withdrawal rate', value: `${inputs.safeWithdrawalRate}%` },
                { label: 'Funded annual salary', value: `${formatCurrency(result.fundedAnnualSalary)}/yr` },
              ],
            })} />
        </div>
        <div className="mt-3">
          <div className="mb-1 flex items-center justify-between text-xs text-text-secondary">
            <span>Retirement salary funded</span>
            <span className="font-semibold text-primary">{result.salaryPctFunded.toFixed(0)}%</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-info" style={{ width: `${Math.min(100, result.salaryPctFunded)}%` }} />
          </div>
          <p className="mt-2 text-xs text-muted">
            Your investments could pay <span className="text-info font-medium">{formatCurrency(result.fundedAnnualSalary / 12)}/mo</span> today
            vs your <span className="text-primary font-medium">{formatCurrency(result.targetAnnualSalary / 12)}/mo</span> target —
            keep contributing and compounding closes the gap by {result.fireYear}.
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
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted">Pre-filled from your real accounts and spending. Changes save automatically.</p>
            {saveState === 'saving' && (
              <span className="text-xs text-text-secondary animate-pulse">Saving…</span>
            )}
            {saveState === 'saved' && (
              <span className="flex items-center gap-1 text-xs text-primary"><Check size={12} /> Saved</span>
            )}
          </div>
          <button onClick={reset} className="flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-primary">
            <RotateCcw size={12} /> Reset
          </button>
        </div>

        {xirrReturn != null && (
          <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 px-3 py-2 text-xs text-text-secondary">
            <span className="font-medium text-primary">Measured return:</span>{' '}
            {isJoint ? 'Joint' : 'Your'} accounts averaged <span className="font-medium text-primary">{xirrReturn}%/yr</span> (XIRR).
            {inputs.investmentReturn !== xirrReturn && (
              <button
                onClick={() => set('investmentReturn', xirrReturn)}
                className="ml-2 text-primary underline hover:no-underline"
              >
                Use this
              </button>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label={isJoint ? 'Current age (oldest)' : 'Current age'} value={inputs.currentAge} onChange={(v) => set('currentAge', v)} />
          <Field label="Retirement age" value={inputs.retirementAge} onChange={(v) => set('retirementAge', v)} />
          <Field label="Invested today" value={inputs.currentInvested} prefix="$" step={1000} onChange={(v) => set('currentInvested', v)} />
          <Field label="Monthly contribution" value={inputs.monthlyContribution} prefix="$" step={50} onChange={(v) => set('monthlyContribution', v)} />
          <Field label="Monthly retirement spend" value={inputs.monthlyRetirementSpend} prefix="$" step={100} onChange={(v) => set('monthlyRetirementSpend', v)} />
          <Field label="Investment return" value={inputs.investmentReturn} suffix="%" step={0.5} onChange={(v) => set('investmentReturn', v)} />
          <Field label="Inflation rate" value={inputs.inflationRate} suffix="%" step={0.5} onChange={(v) => set('inflationRate', v)} />
          <Field label="Safe withdrawal rate" value={inputs.safeWithdrawalRate} suffix="%" step={0.25} onChange={(v) => set('safeWithdrawalRate', v)} />
        </div>
      </Card>

      {/* Goal solver — set one target, back-solve the input that makes it work */}
      <GoalSolver
        inputs={inputs}
        isJoint={isJoint}
        onApply={(key, value) => set(key, value)}
      />

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

// ── Goal solver ─────────────────────────────────────────────────────────────
// Pick ONE thing to solve for; set the rest as targets; it back-solves the model
// so the invested pile hits the FIRE number exactly at retirement. Kept visually
// distinct (indigo) from the regular Coast FI cards so the two don't blur together.

const SOLVE_OPTIONS: Array<{ key: SolveTarget; label: string; blurb: string; applyKey: keyof SolverInputs }> = [
  { key: 'monthlyContribution', label: 'Required monthly contribution', blurb: 'How much must I save each month to retire on time?', applyKey: 'monthlyContribution' },
  { key: 'retirementAge', label: 'Earliest retirement age', blurb: 'Given my contribution, when can I retire?', applyKey: 'retirementAge' },
  { key: 'monthlyRetirementSpend', label: 'Max sustainable spend', blurb: 'How much can I live on in retirement?', applyKey: 'monthlyRetirementSpend' },
  { key: 'investmentReturn', label: 'Required return rate', blurb: 'What return would my plan actually need?', applyKey: 'investmentReturn' },
]

function GoalSolver({ inputs, isJoint, onApply }: {
  inputs: SolverInputs
  isJoint: boolean
  onApply: (key: keyof SolverInputs, value: number) => void
}) {
  const [target, setTarget] = useState<SolveTarget>('retirementAge')
  const active = SOLVE_OPTIONS.find((o) => o.key === target)!

  // Which input fields to SHOW as the held-fixed targets (everything except the
  // one being solved for; we also always hide inflation/SWR to keep it focused —
  // those live in the assumptions card above).
  const fieldDefs: Array<{ key: keyof SolverInputs; label: string; prefix?: string; suffix?: string; step?: number }> = [
    { key: 'retirementAge', label: isJoint ? 'Retirement age (both)' : 'Retirement age', step: 1 },
    { key: 'monthlyContribution', label: 'Monthly contribution', prefix: '$', step: 50 },
    { key: 'monthlyRetirementSpend', label: 'Retirement spend', prefix: '$', step: 100 },
    { key: 'investmentReturn', label: 'Investment return', suffix: '%', step: 0.5 },
  ]
  const shownFields = fieldDefs.filter((f) => f.key !== active.applyKey)

  // Local editable copy of the targets so the solver is "what-if" — editing here
  // does NOT mutate the main calculator until the user taps Apply on the result.
  const [draft, setDraft] = useState<SolverInputs>(inputs)
  // Keep the draft in sync if the parent inputs change (e.g. profile loads, Reset).
  useEffect(() => { setDraft(inputs) }, [inputs])
  const setDraftField = (key: keyof SolverInputs, value: number) =>
    setDraft((prev) => ({ ...prev, [key]: Number.isFinite(value) ? value : 0 }))

  const solved = useMemo(() => solveFor(target, draft), [target, draft])

  // Format the solved value in the unit of the target.
  const formattedValue = (() => {
    if (solved.value == null) return '—'
    switch (target) {
      case 'monthlyContribution':
      case 'monthlyRetirementSpend':
        return `${formatCurrency(Math.round(solved.value))}/mo`
      case 'retirementAge':
        return `age ${Math.ceil(solved.value)}`
      case 'investmentReturn':
        return `${solved.value.toFixed(1)}%/yr`
    }
  })()

  // For the "required return" solve, compare against the user's current return
  // assumption so they get an instant realism flag.
  const returnRealism = target === 'investmentReturn' && solved.value != null
    ? solved.value > draft.investmentReturn + 0.05
      ? { tone: 'warn' as const, text: `Higher than your ${draft.investmentReturn}% assumption — this plan is optimistic.` }
      : { tone: 'ok' as const, text: `At or below your ${draft.investmentReturn}% assumption — realistic.` }
    : null

  return (
    <Card className="border-indigo-400/30 bg-indigo-400/5">
      <div className="mb-3 flex items-start gap-3">
        <Calculator className="mt-0.5 shrink-0 text-indigo-300" size={20} />
        <div>
          <p className="font-semibold text-indigo-300">Solve for your goal</p>
          <p className="mt-0.5 text-xs text-text-secondary">
            Pick one thing to solve for and set the rest. This is a what-if — nothing changes above until you tap Apply.
          </p>
        </div>
      </div>

      {/* Solve-for selector */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {SOLVE_OPTIONS.map((o) => (
          <button
            key={o.key}
            onClick={() => setTarget(o.key)}
            className={cn(
              'rounded-xl border px-2.5 py-2 text-left text-xs transition-colors',
              target === o.key
                ? 'border-indigo-400/60 bg-indigo-400/15 text-indigo-200'
                : 'border-white/10 bg-surface text-text-secondary hover:border-white/20',
            )}
          >
            <span className="font-medium leading-tight">{o.label}</span>
          </button>
        ))}
      </div>

      <p className="mt-2 text-xs text-muted">{active.blurb}</p>

      {/* Held-fixed target inputs (everything except the solved variable) */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shownFields.map((f) => (
          <Field
            key={f.key}
            label={f.label}
            value={draft[f.key]}
            prefix={f.prefix}
            suffix={f.suffix}
            step={f.step}
            onChange={(v) => setDraftField(f.key, v)}
          />
        ))}
      </div>

      {/* Result */}
      <div className="mt-4 rounded-xl border border-indigo-400/20 bg-background/40 p-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs font-medium uppercase tracking-wider text-indigo-300/80">{active.label}</p>
            <p className={cn('mt-0.5 text-2xl font-bold', solved.unsolvable ? 'text-danger' : 'text-indigo-200')}>
              {formattedValue}
            </p>
          </div>
          {!solved.unsolvable && solved.value != null && (
            <button
              onClick={() => onApply(active.applyKey, Math.round(solved.value! * 100) / 100)}
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-indigo-400/40 bg-indigo-400/10 px-3 py-2 text-xs font-medium text-indigo-200 hover:bg-indigo-400/20"
            >
              <Check size={13} /> Apply to inputs
            </button>
          )}
        </div>
        <p className="mt-2 text-xs leading-5 text-text-secondary">{solved.note}</p>
        {returnRealism && (
          <p className={cn('mt-2 rounded-lg px-2.5 py-1.5 text-xs',
            returnRealism.tone === 'warn' ? 'bg-warning/10 text-warning' : 'bg-primary/10 text-primary')}>
            {returnRealism.text}
          </p>
        )}
      </div>
    </Card>
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
