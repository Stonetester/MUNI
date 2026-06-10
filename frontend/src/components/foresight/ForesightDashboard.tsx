'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign,
  LineChart as LineChartIcon, PiggyBank, ReceiptText, RotateCcw, Sparkles, Target,
  TrendingDown, TrendingUp, Utensils, WalletCards,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Card from '@/components/ui/Card'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
import { ForecastPoint, ForecastResponse, InvestmentHolding, Transaction } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'trends' | 'plan' | 'review'
type Intensity = 'comfortable' | 'steady' | 'push'

interface BudgetEstimate {
  category_name: string
  avg_monthly: number
  months_sampled: number
}

interface Props {
  forecast: ForecastResponse
  transactions: Transaction[]
  holdings: InvestmentHolding[]
  budgetEstimates: BudgetEstimate[]
}

const tabItems: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Foresight', icon: LineChartIcon },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'plan', label: 'Plan', icon: Target },
  { id: 'review', label: 'Review', icon: ReceiptText },
]

const intensityFactors: Record<Intensity, number> = {
  comfortable: 0.97,
  steady: 0.92,
  push: 0.85,
}

function categoryIcon(name: string) {
  return name.toLowerCase().includes('dining') || name.toLowerCase().includes('restaurant')
    ? Utensils
    : WalletCards
}

function monthKey(date: string) {
  return date.slice(0, 7)
}

function transactionSpend(transaction: Transaction) {
  return Math.abs(transaction.amount)
}

export default function ForesightDashboard({ forecast, transactions, holdings, budgetEstimates }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [intensity, setIntensity] = useState<Intensity>('steady')
  const [detailCategory, setDetailCategory] = useState<string | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const [dismissed, setDismissed] = useState<number[]>([])

  const analysis = useMemo(() => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    const future = forecast.points.filter((point) => point.month >= currentMonth)
    const first = future[0] ?? forecast.points[0]
    const last = future[future.length - 1] ?? forecast.points[forecast.points.length - 1]
    const lowest = future.reduce((best, point) => point.cash < best.cash ? point : best, first)

    const months = new Map<string, Map<string, number>>()
    transactions.forEach((transaction) => {
      if (!transaction.category_name || transaction.amount >= 0) return
      const key = monthKey(transaction.date)
      const categoryMap = months.get(key) ?? new Map<string, number>()
      categoryMap.set(transaction.category_name, (categoryMap.get(transaction.category_name) ?? 0) + transactionSpend(transaction))
      months.set(key, categoryMap)
    })
    const sortedMonths = Array.from(months.keys()).sort().slice(-12)

    const fallbackCategories = budgetEstimates.map((estimate) => ({
      name: estimate.category_name,
      average: estimate.avg_monthly,
      recent: estimate.avg_monthly,
      prior: estimate.avg_monthly,
      months: estimate.months_sampled,
    }))

    const categoryNames = Array.from(new Set(sortedMonths.flatMap((key) => Array.from(months.get(key)?.keys() ?? []))))
      .filter((name) => !/transfer|payment/i.test(name))
    const computedCategories = categoryNames.map((name) => {
      const values = sortedMonths.map((key) => months.get(key)?.get(name) ?? 0)
      const recentValues = values.slice(-3)
      const priorValues = values.slice(0, Math.max(values.length - 3, 1))
      const average = values.reduce((sum, value) => sum + value, 0) / Math.max(values.length, 1)
      const recent = recentValues.reduce((sum, value) => sum + value, 0) / Math.max(recentValues.length, 1)
      const prior = priorValues.reduce((sum, value) => sum + value, 0) / Math.max(priorValues.length, 1)
      return { name, average, recent, prior, months: values.filter(Boolean).length }
    }).filter((category) => category.average > 0)

    const categories = (computedCategories.length ? computedCategories : fallbackCategories)
      .map((category) => {
        const adjustable = !/rent|mortgage|loan|insurance|tax/i.test(category.name)
        const target = adjustable
          ? Math.max(1, Math.round(category.average * intensityFactors[intensity]))
          : category.average
        return {
          ...category,
          adjustable,
          changePct: category.prior ? ((category.recent - category.prior) / category.prior) * 100 : 0,
          target,
          savings: adjustable ? Math.max(0, category.average - target) : 0,
        }
      })
      .sort((a, b) => b.savings - a.savings || b.average - a.average)

    const totalTargetSavings = categories.reduce((sum, category) => sum + category.savings, 0)
    const monthlyIncome = first?.income ?? 0
    const monthlySpending = first?.expenses ?? 0
    const projectedMonthlySavings = Math.max(0, monthlyIncome - monthlySpending + totalTargetSavings)
    const annualInvestmentReturn = holdings.reduce((sum, holding) =>
      sum + holding.current_value * (holding.assumed_annual_return / 100), 0)
    const forecastInvestmentReturn = forecast.account_forecasts.reduce((sum, account) =>
      sum + Math.max(0, account.ending_balance - account.starting_balance - account.monthly_contribution * forecast.months), 0)

    const anomalies = [...transactions]
      .filter((transaction) => transaction.amount < 0 && transactionSpend(transaction) >= 150 && !/rent|mortgage|loan|transfer|payment/i.test(transaction.category_name ?? ''))
      .sort((a, b) => transactionSpend(b) - transactionSpend(a))
      .slice(0, 4)

    return {
      currentMonth, first, last, lowest, categories, sortedMonths, months,
      monthlyIncome, monthlySpending, projectedMonthlySavings, totalTargetSavings,
      annualInvestmentReturn, forecastInvestmentReturn, anomalies,
    }
  }, [forecast, transactions, holdings, budgetEstimates, intensity])

  const topCategory = analysis.categories[0]
  const savingsRate = analysis.monthlyIncome > 0
    ? (analysis.projectedMonthlySavings / analysis.monthlyIncome) * 100
    : 0

  const trajectoryData = forecast.points.map((point) => ({
    month: formatMonth(point.month),
    netWorth: point.net_worth,
    low: point.net_worth - Math.abs(point.high_cash - point.low_cash) / 2,
    high: point.net_worth + Math.abs(point.high_cash - point.low_cash) / 2,
    raw: point,
  }))

  const trendData = detailCategory
    ? analysis.sortedMonths.map((month) => ({
        month: formatMonth(month),
        amount: analysis.months.get(month)?.get(detailCategory) ?? 0,
        target: analysis.categories.find((category) => category.name === detailCategory)?.target ?? 0,
      }))
    : []

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
      <div className="flex flex-col gap-1">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary">MUNI Foresight</p>
            <h2 className="text-2xl font-bold text-text-primary">Where your money is heading</h2>
          </div>
          <span className="hidden items-center gap-1.5 rounded-full border border-purple-400/30 bg-purple-400/10 px-3 py-1.5 text-xs font-medium text-purple-300 sm:flex">
            <Sparkles size={13} /> Based on your real history
          </span>
        </div>
        <p className="text-sm text-text-secondary">Predictions, achievable spending targets, and the actions with the biggest savings impact.</p>
      </div>

      <div className="grid grid-cols-4 gap-1 rounded-2xl border border-white/10 bg-surface p-1">
        {tabItems.map((item) => {
          const Icon = item.icon
          return (
            <button key={item.id} onClick={() => { setTab(item.id); setDetailCategory(null) }}
              className={cn('flex items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-medium transition-colors sm:text-sm',
                tab === item.id ? 'bg-primary text-white' : 'text-text-secondary hover:bg-surface-2 hover:text-text-primary')}>
              <Icon size={15} /><span>{item.label}</span>
            </button>
          )
        })}
      </div>

      {detailCategory ? (
        <CategoryDetail
          name={detailCategory}
          data={trendData}
          category={analysis.categories.find((category) => category.name === detailCategory)}
          onBack={() => setDetailCategory(null)}
        />
      ) : tab === 'overview' ? (
        <Overview
          analysis={analysis}
          trajectoryData={trajectoryData}
          savingsRate={savingsRate}
          topCategory={topCategory}
          onPoint={setSelectedPoint}
          onTrend={(name: string) => { setDetailCategory(name); setTab('trends') }}
          onPlan={() => setTab('plan')}
        />
      ) : tab === 'trends' ? (
        <Trends categories={analysis.categories} onSelect={setDetailCategory} />
      ) : tab === 'plan' ? (
        <Plan analysis={analysis} intensity={intensity} setIntensity={setIntensity} />
      ) : (
        <Review anomalies={analysis.anomalies.filter((item) => !dismissed.includes(item.id))} dismiss={(id) => setDismissed((items) => [...items, id])} />
      )}

      {selectedPoint && <MonthDetailModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />}
    </div>
  )
}

function Overview({ analysis, trajectoryData, savingsRate, topCategory, onPoint, onTrend, onPlan }: any) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: trajectoryData.length })
  const pinch = useRef<{ distance: number; start: number; end: number } | null>(null)
  const chart = useRef<HTMLDivElement | null>(null)
  const visibleData = trajectoryData.slice(visibleRange.start, visibleRange.end)
  const isZoomed = visibleRange.start > 0 || visibleRange.end < trajectoryData.length

  useEffect(() => {
    setVisibleRange({ start: 0, end: trajectoryData.length })
  }, [trajectoryData.length])

  const touchDistance = (touches: React.TouchList) => (
    Math.abs(touches[0].clientX - touches[1].clientX)
  )

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return
    pinch.current = {
      distance: touchDistance(event.touches),
      start: visibleRange.start,
      end: visibleRange.end,
    }
  }

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinch.current || !chart.current) return
    event.preventDefault()

    const scale = touchDistance(event.touches) / Math.max(pinch.current.distance, 1)
    const originalLength = pinch.current.end - pinch.current.start
    const nextLength = Math.max(4, Math.min(trajectoryData.length, Math.round(originalLength / scale)))
    const bounds = chart.current.getBoundingClientRect()
    const midpoint = (event.touches[0].clientX + event.touches[1].clientX) / 2
    const midpointRatio = Math.max(0, Math.min(1, (midpoint - bounds.left) / Math.max(bounds.width, 1)))
    const center = pinch.current.start + originalLength * midpointRatio
    const start = Math.max(0, Math.min(trajectoryData.length - nextLength, Math.round(center - nextLength * midpointRatio)))

    setVisibleRange({ start, end: start + nextLength })
  }

  return (
    <>
      <Card className="overflow-hidden p-0">
        <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
          <div>
            <p className="text-sm text-text-secondary">At your current pace, net worth reaches</p>
            <p className="mt-1 text-2xl font-bold text-info">{formatCurrency(analysis.last?.net_worth ?? 0)} <span className="text-sm font-normal text-text-secondary">by {formatMonth(analysis.last?.month ?? '')}</span></p>
          </div>
          <button
            type="button"
            disabled={!isZoomed}
            onClick={() => setVisibleRange({ start: 0, end: trajectoryData.length })}
            className="flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-2 text-xs text-text-secondary disabled:cursor-default disabled:opacity-40"
          >
            <RotateCcw size={14} /> Reset view
          </button>
        </div>
        <div
          ref={chart}
          className="h-72 p-2 sm:p-4"
          style={{ touchAction: 'pan-y' }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={() => { pinch.current = null }}
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={visibleData} onClick={(event: any) => event?.activePayload?.[0]?.payload?.raw && onPoint(event.activePayload[0].payload.raw)}>
              <defs><linearGradient id="foresightArea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3b82f6" stopOpacity=".35" /><stop offset="1" stopColor="#3b82f6" stopOpacity=".02" /></linearGradient></defs>
              <CartesianGrid stroke="#2d3748" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${Math.round(v / 1000)}k`} axisLine={false} tickLine={false} width={48} />
              <Tooltip content={<NetWorthTooltip />} />
              <Area type="monotone" dataKey="netWorth" stroke="#3b82f6" strokeWidth={3} fill="url(#foresightArea)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {topCategory && (
        <button onClick={() => onTrend(topCategory.name)} className="flex w-full items-center gap-3 rounded-2xl border border-warning/40 bg-warning/10 p-4 text-left hover:bg-warning/15">
          <div className="rounded-xl bg-warning/20 p-2 text-warning"><Utensils size={20} /></div>
          <div className="min-w-0 flex-1"><p className="text-xs font-semibold uppercase tracking-wider text-warning">Top savings opportunity</p><p className="truncate text-sm text-text-primary">{topCategory.name} target could add {formatCurrency(topCategory.savings)}/mo to savings.</p></div>
          <ArrowRight size={18} className="text-warning" />
        </button>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={PiggyBank} label="Savings rate" value={`${savingsRate.toFixed(0)}%`} tone="green" />
        <Metric icon={WalletCards} label="Lowest cash" value={formatCurrency(analysis.lowest?.cash ?? 0)} tone="red" />
        <Metric icon={CircleDollarSign} label="Est. annual return" value={formatCurrency(analysis.annualInvestmentReturn)} tone="blue" />
        <Metric icon={TrendingUp} label="Forecast return" value={formatCurrency(analysis.forecastInvestmentReturn)} tone="purple" />
      </div>

      <Card title="Coin summary">
        <div className="divide-y divide-white/10">
          <SummaryRow icon={Utensils} text={`${topCategory?.name ?? 'Spending'} is your best achievable cut`} value={`+${formatCurrency(topCategory?.savings ?? 0)}/mo`} onClick={() => topCategory && onTrend(topCategory.name)} />
          <SummaryRow icon={CalendarDays} text={`${formatMonth(analysis.lowest?.month ?? '')} is your lowest cash month`} value={formatCurrency(analysis.lowest?.cash ?? 0)} />
          <SummaryRow icon={TrendingUp} text="Estimated investment return over forecast" value={formatCurrency(analysis.forecastInvestmentReturn)} />
        </div>
      </Card>

      <button onClick={onPlan} className="rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary/90">Build my achievable savings plan</button>
    </>
  )
}

function NetWorthTooltip({ active, payload }: any) {
  const point = payload?.[0]?.payload?.raw as ForecastPoint | undefined
  if (!active || !point) return null

  const accounts = [...(point.net_worth_breakdown ?? [])]
    .filter((account) => account.source !== 'no balance recorded')
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
    .slice(0, 4)

  return (
    <div className="max-w-64 rounded-xl border border-white/10 bg-[#1a1f2e] p-3 shadow-xl">
      <p className="text-xs text-muted">{formatMonth(point.month)}</p>
      <p className="mt-0.5 text-lg font-bold text-info">{formatCurrency(point.net_worth)}</p>
      <p className="mb-2 text-[11px] text-text-secondary">
        {point.calculation_method === 'recorded_snapshots' ? 'Recorded account balances' : 'Forecast account balances'}
      </p>
      <div className="space-y-1 border-t border-white/10 pt-2">
        {accounts.map((account) => (
          <div key={account.account_id} className="flex items-center justify-between gap-4 text-xs">
            <span className="truncate text-text-secondary">{account.account_name}</span>
            <span className={account.is_liability ? 'text-danger' : 'text-text-primary'}>
              {account.is_liability ? '-' : ''}{formatCurrency(Math.abs(account.balance))}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[10px] text-muted">Tap the month for the full calculation.</p>
    </div>
  )
}

function Trends({ categories, onSelect }: { categories: any[]; onSelect: (name: string) => void }) {
  return (
    <Card title="Spending trends">
      <p className="mb-3 text-xs text-muted">Recent monthly pace compared with your longer-term average. Targets are intentionally achievable, not extreme.</p>
      <div className="divide-y divide-white/10">
        {categories.slice(0, 10).map((category) => {
          const Icon = categoryIcon(category.name)
          return (
            <button key={category.name} onClick={() => onSelect(category.name)} className="flex w-full items-center gap-3 py-3 text-left hover:bg-white/[0.02]">
              <Icon size={18} className={category.changePct > 5 ? 'text-danger' : 'text-primary'} />
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-text-primary">{category.name}</p><p className="text-xs text-muted">{formatCurrency(category.average)}/mo average · {category.months} months analyzed</p></div>
              <div className="text-right"><p className={cn('text-sm font-semibold', category.changePct > 5 ? 'text-danger' : category.changePct < -5 ? 'text-primary' : 'text-text-secondary')}>{category.changePct > 0 ? '+' : ''}{category.changePct.toFixed(0)}%</p><p className="text-xs text-primary">save {formatCurrency(category.savings)}/mo</p></div>
              <ArrowRight size={15} className="text-muted" />
            </button>
          )
        })}
      </div>
    </Card>
  )
}

function Plan({ analysis, intensity, setIntensity }: { analysis: any; intensity: Intensity; setIntensity: (value: Intensity) => void }) {
  return (
    <>
      <Card title="Savings intensity">
        <div className="grid grid-cols-3 gap-1 rounded-xl bg-background p-1">
          {(['comfortable', 'steady', 'push'] as Intensity[]).map((value) => (
            <button key={value} onClick={() => setIntensity(value)} className={cn('rounded-lg px-2 py-2 text-xs font-medium capitalize', intensity === value ? 'bg-primary text-white' : 'text-text-secondary')}>{value}</button>
          ))}
        </div>
      </Card>
      <Card className="border-primary/40 bg-primary/5">
        <div className="grid grid-cols-2 gap-4">
          <Metric icon={PiggyBank} label="Target savings" value={`${formatCurrency(analysis.projectedMonthlySavings)}/mo`} tone="green" />
          <Metric icon={WalletCards} label="Added vs current" value={`${formatCurrency(analysis.totalTargetSavings)}/mo`} tone="blue" />
          <Metric icon={TrendingUp} label="Projected net worth" value={formatCurrency(analysis.last?.net_worth ?? 0)} tone="purple" />
          <Metric icon={CircleDollarSign} label="Annual investment return" value={formatCurrency(analysis.annualInvestmentReturn)} tone="green" />
        </div>
      </Card>
      <Card title="Monthly spending goals">
        <div className="divide-y divide-white/10">
          {analysis.categories.filter((category: any) => category.adjustable).slice(0, 8).map((category: any) => (
            <div key={category.name} className="py-3">
              <div className="mb-2 flex items-center justify-between gap-3"><p className="truncate text-sm font-medium text-text-primary">{category.name}</p><p className="text-sm text-primary">Stay below {formatCurrency(category.target)}</p></div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, (category.target / Math.max(category.average, 1)) * 100)}%` }} /></div>
              <p className="mt-1 text-xs text-muted">Current average {formatCurrency(category.average)} · achievable reduction {formatCurrency(category.savings)}/mo</p>
            </div>
          ))}
        </div>
      </Card>
    </>
  )
}

function Review({ anomalies, dismiss }: { anomalies: Transaction[]; dismiss: (id: number) => void }) {
  return (
    <>
      <Card title="Review queue">
        <p className="mb-3 text-xs text-muted">Confirm unusual purchases so one-off spending does not distort your trends and targets.</p>
        {anomalies.length ? <div className="divide-y divide-white/10">{anomalies.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-3"><ReceiptText size={19} className="text-warning" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-text-primary">{item.merchant || item.description}</p><p className="text-xs text-muted">{item.category_name || 'Uncategorized'} · {item.date}</p></div><p className="text-sm font-semibold text-warning">{formatCurrency(transactionSpend(item))}</p><button onClick={() => dismiss(item.id)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-primary">Done</button></div>
        ))}</div> : <div className="py-8 text-center"><CheckCircle2 className="mx-auto mb-2 text-primary" /><p className="text-sm text-text-secondary">Review queue is clear.</p></div>}
      </Card>
      <Card className="border-primary/30 bg-primary/5"><div className="flex gap-3"><CheckCircle2 className="text-primary" /><div><p className="font-semibold text-primary">Forecast confidence improves with review</p><p className="mt-1 text-sm text-text-secondary">Marking one-time purchases keeps recurring spending goals realistic.</p></div></div></Card>
    </>
  )
}

function CategoryDetail({ name, data, category, onBack }: { name: string; data: any[]; category: any; onBack: () => void }) {
  return (
    <>
      <button onClick={onBack} className="flex w-fit items-center gap-2 text-sm text-text-secondary hover:text-text-primary"><ArrowLeft size={16} /> Back to trends</button>
      <Card title={`${name} trend`}>
        <div className="mb-4 flex items-end justify-between"><div><p className="text-xs text-muted">Recent monthly pace</p><p className="text-2xl font-bold text-text-primary">{formatCurrency(category?.recent ?? 0)}/mo</p></div><div className="text-right"><p className="text-xs text-muted">Achievable target</p><p className="text-lg font-bold text-primary">{formatCurrency(category?.target ?? 0)}/mo</p></div></div>
        <div className="h-72"><ResponsiveContainer width="100%" height="100%"><LineChart data={data}><CartesianGrid stroke="#2d3748" strokeDasharray="3 3" vertical={false} /><XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} /><YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} tickFormatter={(v) => `$${v}`} axisLine={false} tickLine={false} width={45} /><Tooltip formatter={(value: number) => formatCurrency(value)} contentStyle={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 12 }} /><ReferenceLine y={category?.target ?? 0} stroke="#22c55e" strokeDasharray="5 5" label={{ value: 'Target', fill: '#22c55e', fontSize: 10 }} /><Line type="monotone" dataKey="amount" stroke="#3b82f6" strokeWidth={3} dot={{ fill: '#3b82f6' }} /></LineChart></ResponsiveContainer></div>
      </Card>
      <Card className="border-purple-400/30 bg-purple-400/5"><div className="flex gap-3"><Sparkles className="text-purple-300" /><div><p className="font-semibold text-purple-300">Foresight explanation</p><p className="mt-1 text-sm leading-6 text-text-secondary">{name} is averaging {formatCurrency(category?.average ?? 0)} per month. A target of {formatCurrency(category?.target ?? 0)} is below your current pace without assuming a drastic lifestyle change, adding about {formatCurrency(category?.savings ?? 0)} to monthly savings.</p></div></div></Card>
    </>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: React.ElementType; label: string; value: string; tone: 'green' | 'red' | 'blue' | 'purple' }) {
  const colors = { green: 'text-primary', red: 'text-danger', blue: 'text-info', purple: 'text-purple-300' }
  return <div className="rounded-xl border border-white/10 bg-surface p-3"><Icon size={17} className={colors[tone]} /><p className="mt-2 text-xs text-text-secondary">{label}</p><p className={cn('mt-0.5 break-words text-lg font-bold', colors[tone])}>{value}</p></div>
}

function SummaryRow({ icon: Icon, text, value, onClick }: { icon: React.ElementType; text: string; value: string; onClick?: () => void }) {
  return <button onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 py-3 text-left"><Icon size={17} className="text-primary" /><span className="min-w-0 flex-1 text-sm text-text-primary">{text}</span><span className="text-sm font-semibold text-info">{value}</span>{onClick && <ArrowRight size={14} className="text-muted" />}</button>
}
