'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, CircleDollarSign,
  Info, LineChart as LineChartIcon, PiggyBank, ReceiptText, RotateCcw, Sparkles, Sun, Target,
  TrendingDown, TrendingUp, Utensils, WalletCards,
  X,
} from 'lucide-react'
import {
  Area, AreaChart, CartesianGrid, Line, LineChart, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import Card from '@/components/ui/Card'
import CoastFiCalculator from '@/components/foresight/CoastFiCalculator'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
import { ForecastPoint, ForecastResponse, InvestmentHolding, Transaction } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import { cn } from '@/lib/utils'

type Tab = 'overview' | 'trends' | 'plan' | 'coastfi' | 'review'
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
  currentAge?: number | null
  onMarkOneOff: (transaction: Transaction) => Promise<void>
}

interface CalculationDetail {
  title: string
  value: string
  formula: string
  dateRange: string
  assumptions: string[]
  warnings: string[]
  inputs: CalculationInput[]
}

interface CalculationInput {
  label: string
  value: string
  note?: string
  detail?: CalculationDetail
}

const tabItems: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Foresight', icon: LineChartIcon },
  { id: 'trends', label: 'Trends', icon: TrendingUp },
  { id: 'plan', label: 'Plan', icon: Target },
  { id: 'coastfi', label: 'Coast FI', icon: Sun },
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

function isOneOff(transaction: Transaction) {
  return transaction.notes?.toLowerCase().includes('[one-off]') ?? false
}

export default function ForesightDashboard({ forecast, transactions, holdings, budgetEstimates, currentAge, onMarkOneOff }: Props) {
  const [tab, setTab] = useState<Tab>('overview')
  const [intensity, setIntensity] = useState<Intensity>('steady')
  const [detailCategory, setDetailCategory] = useState<string | null>(null)
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const [calculation, setCalculation] = useState<CalculationDetail | null>(null)
  const [dismissed, setDismissed] = useState<number[]>([])

  const analysis = useMemo(() => {
    const now = new Date()
    const currentMonth = now.toISOString().slice(0, 7)
    const forecastReferenceDate = now.toISOString().slice(0, 10)
    const forecastSourceStart = new Date(now)
    forecastSourceStart.setFullYear(forecastSourceStart.getFullYear() - 1)
    const forecastSourceStartDate = forecastSourceStart.toISOString().slice(0, 10)
    const future = forecast.points.filter((point) => point.month >= currentMonth)
    const first = future[0] ?? forecast.points[0]
    const last = future[future.length - 1] ?? forecast.points[forecast.points.length - 1]
    const lowest = future.reduce((best, point) => point.cash < best.cash ? point : best, first)

    const months = new Map<string, Map<string, number>>()
    transactions.forEach((transaction) => {
      if (!transaction.category_name || transaction.amount >= 0 || isOneOff(transaction)) return
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
      sourceTransactions: [] as Transaction[],
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
      const sourceTransactions = transactions.filter((transaction) =>
        transaction.category_name === name && transaction.amount < 0 && !isOneOff(transaction) && sortedMonths.includes(monthKey(transaction.date)))
      return { name, average, recent, prior, months: values.filter(Boolean).length, sourceTransactions }
    }).filter((category) => category.average > 0)

    const categories = (computedCategories.length ? computedCategories : fallbackCategories)
      .map((category) => {
        const adjustable = !/rent|mortgage|loan|insurance|tax|wedding/i.test(category.name)
        const target = adjustable
          ? Math.max(1, Math.round(category.average * intensityFactors[intensity]))
          : category.average
        return {
          ...category,
          adjustable,
          currentSpend: transactions
            .filter((transaction) => transaction.category_name === category.name
              && transaction.amount < 0
              && monthKey(transaction.date) === currentMonth)
            .reduce((sum, transaction) => sum + transactionSpend(transaction), 0),
          changePct: category.prior ? ((category.recent - category.prior) / category.prior) * 100 : 0,
          target,
          savings: adjustable ? Math.max(0, category.average - target) : 0,
        }
      })
      .sort((a, b) => b.savings - a.savings || b.average - a.average)

    const totalTargetSavings = categories.reduce((sum, category) => sum + category.savings, 0)
    const monthlyIncome = first?.income ?? 0
    const monthlySpending = Math.abs(first?.expenses ?? 0)
    const currentMonthlySavings = monthlyIncome - monthlySpending
    const projectedMonthlySavings = currentMonthlySavings + totalTargetSavings
    const returnAccounts = forecast.account_forecasts.filter((account) => account.annual_return_pct !== 0)
    const annualInvestmentReturn = returnAccounts.reduce((sum, account) =>
      sum + account.starting_balance * (account.annual_return_pct / 100), 0)
    const forecastInvestmentReturn = returnAccounts.reduce((sum, account) =>
      sum + account.ending_balance - account.starting_balance - account.monthly_contribution * forecast.months, 0)

    const anomalies = [...transactions]
      .filter((transaction) => transaction.amount < 0 && !isOneOff(transaction) && transactionSpend(transaction) >= 150 && !/rent|mortgage|loan|transfer|payment/i.test(transaction.category_name ?? ''))
      .sort((a, b) => transactionSpend(b) - transactionSpend(a))
      .slice(0, 4)

    return {
      currentMonth, first, last, lowest, categories, sortedMonths, months,
      monthlyIncome, monthlySpending, projectedMonthlySavings, totalTargetSavings,
      currentMonthlySavings, annualInvestmentReturn, forecastInvestmentReturn, returnAccounts, holdings,
      forecastMonths: forecast.months, anomalies, transactions, forecastReferenceDate, forecastSourceStartDate,
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

      <div className="grid grid-cols-5 gap-1 rounded-2xl border border-white/10 bg-surface p-1">
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
          onCalculation={setCalculation}
          onTrend={(name: string) => { setDetailCategory(name); setTab('trends') }}
          onPlan={() => setTab('plan')}
        />
      ) : tab === 'trends' ? (
        <Trends categories={analysis.categories} onSelect={setDetailCategory} />
      ) : tab === 'plan' ? (
        <Plan analysis={analysis} intensity={intensity} setIntensity={setIntensity} onCalculation={setCalculation} onPoint={setSelectedPoint} />
      ) : tab === 'coastfi' ? (
        <CoastFiCalculator
          forecast={forecast}
          holdings={holdings}
          currentAge={currentAge ?? 30}
          monthlySpend={analysis.monthlySpending}
          monthlyContribution={forecast.account_forecasts
            .filter((account) => account.annual_return_pct > 0)
            .reduce((sum, account) => sum + account.monthly_contribution, 0)}
          onDetail={(detail) => setCalculation({
            title: detail.title,
            value: detail.value,
            formula: detail.formula,
            dateRange: 'Projection in today’s (real) dollars from the current year to your target retirement age.',
            assumptions: detail.notes,
            warnings: [],
            inputs: detail.inputs.map((input) => ({ label: input.label, value: input.value, note: input.note })),
          })}
        />
      ) : (
        <Review
          anomalies={analysis.anomalies.filter((item) => !dismissed.includes(item.id))}
          markOneOff={async (transaction) => {
            await onMarkOneOff(transaction)
            setDismissed((items) => [...items, transaction.id])
          }}
        />
      )}

      {selectedPoint && <MonthDetailModal point={selectedPoint} accountForecasts={forecast.account_forecasts} onClose={() => setSelectedPoint(null)} />}
      {calculation && <CalculationDetailModal detail={calculation} onClose={() => setCalculation(null)} />}
    </div>
  )
}

function Overview({ analysis, trajectoryData, savingsRate, topCategory, onPoint, onTrend, onPlan, onCalculation }: any) {
  const [visibleRange, setVisibleRange] = useState({ start: 0, end: trajectoryData.length })
  const pinch = useRef<{ distance: number; start: number; end: number } | null>(null)
  const chart = useRef<HTMLDivElement | null>(null)
  const visibleData = trajectoryData.slice(visibleRange.start, visibleRange.end)
  const isZoomed = visibleRange.start > 0 || visibleRange.end < trajectoryData.length
  const forecastRange = `${formatMonth(analysis.first?.month ?? '')} to ${formatMonth(analysis.last?.month ?? '')}`
  const transactionRange = analysis.sortedMonths.length
    ? `${formatMonth(analysis.sortedMonths[0])} to ${formatMonth(analysis.sortedMonths[analysis.sortedMonths.length - 1])}`
    : 'No transaction months loaded'
  const forecastCategories = Object.entries(analysis.first?.by_category ?? {}) as Array<[string, number]>
  const sourceTransactions = (categoryName: string, sign: 'income' | 'expense') => analysis.transactions
    .filter((transaction: Transaction) =>
      transaction.category_name === categoryName
      && (sign === 'income' ? transaction.amount > 0 : transaction.amount < 0)
      && !isOneOff(transaction)
      && transaction.date >= analysis.forecastSourceStartDate
      && transaction.date < analysis.forecastReferenceDate)
    .sort((a: Transaction, b: Transaction) => b.date.localeCompare(a.date))
  const sourceRecordInputs = (records: Transaction[]): CalculationInput[] => records.slice(0, 50).map((transaction) => ({
    label: transaction.merchant || transaction.description,
    value: formatCurrency(transactionSpend(transaction)),
    note: `${transaction.date} · ${transaction.import_source || 'manual entry'}${transaction.account_name ? ` · ${transaction.account_name}` : ''}${transaction.owner ? ` · ${transaction.owner}` : ''}`,
  }))
  const categoryOriginDetail = (categoryName: string, amount: number, sign: 'income' | 'expense'): CalculationDetail => {
    const records = sourceTransactions(categoryName, sign)
    return {
      title: `${categoryName} forecast source`,
      value: formatCurrency(Math.abs(amount)),
      formula: '50% of trailing 3-month average + 30% of trailing 6-month average + 20% of trailing 12-month average. If this category has no historical average, an active recurring rule may supply the value.',
      dateRange: `Forecast record for ${formatMonth(analysis.first?.month ?? '')}; backend source window ${analysis.forecastSourceStartDate} to ${analysis.forecastReferenceDate}.`,
      assumptions: ['One-off purchases and neutral transfers are excluded from recurring forecast averages.', 'Months without a transaction still count in the backend 3-, 6-, and 12-month denominators.'],
      warnings: [
        ...(records.length ? [] : ['No matching source transaction is present in the loaded 2,000-record window; this value may come from an active recurring rule or older history.']),
        ...(records.length > 50 ? [`Showing the 50 most recent of ${records.length} loaded source transactions.`] : []),
      ],
      inputs: sourceRecordInputs(records),
    }
  }
  const incomeDetail: CalculationDetail = {
    title: 'Forecast income',
    value: formatCurrency(analysis.monthlyIncome),
    formula: 'Sum of every positive category value in the selected monthly forecast record.',
    dateRange: `Forecast month ${formatMonth(analysis.first?.month ?? '')}; category source history uses ${transactionRange}.`,
    assumptions: ['Employer 401(k), savings transfers, and neutral transfers are not spendable income.'],
    warnings: forecastCategories.some(([, amount]) => amount > 0) ? [] : ['The forecast record does not expose a positive category breakdown.'],
    inputs: forecastCategories.filter(([, amount]) => amount > 0).map(([name, amount]) => ({
      label: name,
      value: formatCurrency(amount),
      note: 'Tap for weighted-average source records and origin.',
      detail: categoryOriginDetail(name, amount, 'income'),
    })),
  }
  const expensesDetail: CalculationDetail = {
    title: 'Forecast expenses',
    value: formatCurrency(analysis.monthlySpending),
    formula: 'Sum of the absolute values of every negative category value in the selected monthly forecast record.',
    dateRange: `Forecast month ${formatMonth(analysis.first?.month ?? '')}; category source history uses ${transactionRange}.`,
    assumptions: ['Savings transfers, neutral transfers, and marked one-off purchases are excluded from recurring forecast pace.'],
    warnings: forecastCategories.some(([, amount]) => amount < 0) ? [] : ['The forecast record does not expose a negative category breakdown.'],
    inputs: forecastCategories.filter(([, amount]) => amount < 0).map(([name, amount]) => ({
      label: name,
      value: formatCurrency(Math.abs(amount)),
      note: 'Tap for weighted-average source records and origin.',
      detail: categoryOriginDetail(name, amount, 'expense'),
    })),
  }
  const currentSavingsDetail: CalculationDetail = {
    title: 'Current forecast savings',
    value: formatCurrency(analysis.currentMonthlySavings),
    formula: `${formatCurrency(analysis.monthlyIncome)} - ${formatCurrency(analysis.monthlySpending)} = ${formatCurrency(analysis.currentMonthlySavings)}.`,
    dateRange: `Forecast month ${formatMonth(analysis.first?.month ?? '')}.`,
    assumptions: ['This is projected monthly cash flow, not the change in every account balance.'],
    warnings: [],
    inputs: [
      { label: 'Forecast income', value: formatCurrency(analysis.monthlyIncome), note: 'Tap for categories and source records.', detail: incomeDetail },
      { label: 'Forecast expenses', value: formatCurrency(analysis.monthlySpending), note: 'Subtracted; tap for categories and source records.', detail: expensesDetail },
    ],
  }
  const reductionInputs: CalculationInput[] = analysis.categories.filter((category: any) => category.savings > 0).map((category: any) => ({
    label: category.name,
    value: formatCurrency(category.savings),
    note: `${formatCurrency(category.average)} recurring average - ${formatCurrency(category.target)} target`,
    detail: {
      title: `${category.name} achievable reduction`,
      value: formatCurrency(category.savings),
      formula: 'Recurring loaded-month category average - selected savings-intensity target.',
      dateRange: transactionRange,
      assumptions: ['Marked one-off purchases are excluded from the recurring average.', 'Months with no category spending count as $0.'],
      warnings: [
        ...(category.months < analysis.sortedMonths.length ? [`Spending was recorded in ${category.months} of ${analysis.sortedMonths.length} loaded months.`] : []),
        ...(category.sourceTransactions.length > 50 ? [`Showing the 50 most recent of ${category.sourceTransactions.length} source transactions.`] : []),
      ],
      inputs: sourceRecordInputs(category.sourceTransactions),
    },
  }))
  const reductionsDetail: CalculationDetail = {
    title: 'Achievable reductions',
    value: formatCurrency(analysis.totalTargetSavings),
    formula: `${reductionInputs.length} adjustable category reductions summed = ${formatCurrency(analysis.totalTargetSavings)}.`,
    dateRange: transactionRange,
    assumptions: ['Fixed and temporary categories are excluded.', 'The selected savings intensity controls each adjustable target.'],
    warnings: reductionInputs.length ? [] : ['No adjustable category reductions were calculated.'],
    inputs: reductionInputs,
  }
  const projectedSavingsDetail: CalculationDetail = {
    title: 'Projected monthly savings',
    value: formatCurrency(analysis.projectedMonthlySavings),
    formula: `${formatCurrency(analysis.currentMonthlySavings)} + ${formatCurrency(analysis.totalTargetSavings)} = ${formatCurrency(analysis.projectedMonthlySavings)}.`,
    dateRange: `Forecast month ${formatMonth(analysis.first?.month ?? '')}; category targets use ${transactionRange}.`,
    assumptions: ['Achievable reductions assume spending reaches the selected category targets.'],
    warnings: [],
    inputs: [
      { label: 'Current forecast savings', value: formatCurrency(analysis.currentMonthlySavings), note: 'Tap for income and expense origins.', detail: currentSavingsDetail },
      { label: 'Achievable reductions', value: formatCurrency(analysis.totalTargetSavings), note: 'Tap for each category target and its source records.', detail: reductionsDetail },
    ],
  }
  const savingsRateDetail: CalculationDetail = {
    title: 'Savings rate',
    value: `${savingsRate.toFixed(0)}%`,
    formula: `${formatCurrency(analysis.projectedMonthlySavings)} / ${formatCurrency(analysis.monthlyIncome)} x 100 = ${savingsRate.toFixed(1)}%. Projected monthly savings = ${formatCurrency(analysis.monthlyIncome)} - ${formatCurrency(analysis.monthlySpending)} + ${formatCurrency(analysis.totalTargetSavings)}.`,
    dateRange: `Monthly forecast inputs for ${formatMonth(analysis.first?.month ?? '')}; category targets use ${transactionRange}.`,
    assumptions: ['The selected savings intensity is applied only to adjustable categories.', 'This is a projected rate, not a bank-account balance change.'],
    warnings: [
      ...(analysis.monthlyIncome <= 0 ? ['No positive forecast income is available, so the rate is shown as 0%.'] : []),
      ...(analysis.sortedMonths.length < 12 ? [`Only ${analysis.sortedMonths.length} transaction months were loaded for category targets.`] : []),
    ],
    inputs: [
      { label: 'Forecast income', value: formatCurrency(analysis.monthlyIncome), note: 'Denominator; tap for categories and source records.', detail: incomeDetail },
      { label: 'Forecast expenses', value: formatCurrency(analysis.monthlySpending), note: 'Subtracted; tap for categories and source records.', detail: expensesDetail },
      { label: 'Current forecast savings', value: formatCurrency(analysis.currentMonthlySavings), note: 'Income - expenses; tap for both inputs.', detail: currentSavingsDetail },
      { label: 'Achievable reductions', value: formatCurrency(analysis.totalTargetSavings), note: 'Tap for every category target and source transaction.', detail: reductionsDetail },
      { label: 'Projected monthly savings', value: formatCurrency(analysis.projectedMonthlySavings), note: 'Numerator; tap for its full equation.', detail: projectedSavingsDetail },
    ],
  }
  const lowestCashDetail: CalculationDetail = {
    title: 'Lowest cash',
    value: formatCurrency(analysis.lowest?.cash ?? 0),
    formula: 'Minimum cash value among the future monthly forecast records.',
    dateRange: forecastRange,
    assumptions: ['Cash is the forecast cash pool after projected income, expenses, and life-event impacts.', 'Investment and savings balances are excluded from cash.'],
    warnings: ['Cash is estimated from historical averages and may differ from actual balances.', ...(analysis.lowest?.cash < 0 ? ['Projected cash falls below $0.'] : [])],
    inputs: (analysis.first ? [analysis.first, analysis.lowest, analysis.last] : []).filter(Boolean).map((point: ForecastPoint) => ({
      label: formatMonth(point.month), value: formatCurrency(point.cash), note: point === analysis.lowest ? 'Lowest forecast record' : 'Range reference',
    })),
  }
  const annualReturnDetail: CalculationDetail = {
    title: 'Estimated annual return',
    value: formatCurrency(analysis.annualInvestmentReturn),
    formula: 'Sum of each growth account starting balance x its annual return assumption.',
    dateRange: `One-year estimate using starting balances for ${formatMonth(analysis.first?.month ?? '')}.`,
    assumptions: ['Rates come from configured holdings, profile settings, or forecast account-type defaults.', 'Contributions and market volatility are excluded.'],
    warnings: [
      'Forecast records do not expose the date of each starting balance; stale account snapshots may affect this estimate.',
      ...(analysis.returnAccounts.length ? [] : ['No accounts with a non-zero return assumption were found.']),
    ],
    inputs: analysis.returnAccounts.map((account: any) => {
      const matching = analysis.holdings.filter((holding: InvestmentHolding) => holding.account_id === account.account_id)
      return {
        label: account.account_name,
        value: formatCurrency(account.starting_balance * account.annual_return_pct / 100),
        note: `${formatCurrency(account.starting_balance)} x ${account.annual_return_pct.toFixed(2)}%${matching.length ? `; ${matching.length} holding record(s)` : '; estimated/default rate'}`,
      }
    }),
  }
  const forecastReturnDetail: CalculationDetail = {
    title: 'Forecast return',
    value: formatCurrency(analysis.forecastInvestmentReturn),
    formula: 'Sum of growth-account ending balance - starting balance - (monthly contribution x forecast months).',
    dateRange: forecastRange,
    assumptions: ['Only accounts with a non-zero forecast return rate are included.', 'The forecast compounds monthly at the listed annual rate.'],
    warnings: ['This is modeled growth, not a guaranteed return.', 'Forecast records do not expose the date of each starting balance.', ...(analysis.returnAccounts.length ? [] : ['No growth accounts were found.'])],
    inputs: analysis.returnAccounts.map((account: any) => ({
      label: account.account_name,
      value: formatCurrency(account.ending_balance - account.starting_balance - account.monthly_contribution * analysis.forecastMonths),
      note: `${formatCurrency(account.ending_balance)} - ${formatCurrency(account.starting_balance)} - (${formatCurrency(account.monthly_contribution)} x ${analysis.forecastMonths})`,
    })),
  }

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
        <Metric icon={PiggyBank} label="Savings rate" value={`${savingsRate.toFixed(0)}%`} tone="green" onClick={() => onCalculation(savingsRateDetail)} />
        <Metric icon={WalletCards} label="Lowest cash" value={formatCurrency(analysis.lowest?.cash ?? 0)} tone="red" onClick={() => onCalculation(lowestCashDetail)} />
        <Metric icon={CircleDollarSign} label="Est. annual return" value={formatCurrency(analysis.annualInvestmentReturn)} tone="blue" onClick={() => onCalculation(annualReturnDetail)} />
        <Metric icon={TrendingUp} label="Forecast return" value={formatCurrency(analysis.forecastInvestmentReturn)} tone="purple" onClick={() => onCalculation(forecastReturnDetail)} />
      </div>

      <Card title="Coin summary">
        <div className="divide-y divide-white/10">
          <SummaryRow icon={Utensils} text={`${topCategory?.name ?? 'Spending'} is your best achievable cut`} value={`+${formatCurrency(topCategory?.savings ?? 0)}/mo`} onClick={() => topCategory && onTrend(topCategory.name)} />
          <SummaryRow icon={CalendarDays} text={`${formatMonth(analysis.lowest?.month ?? '')} is your lowest cash month`} value={formatCurrency(analysis.lowest?.cash ?? 0)} onClick={() => onCalculation(lowestCashDetail)} />
          <SummaryRow icon={TrendingUp} text="Estimated investment return over forecast" value={formatCurrency(analysis.forecastInvestmentReturn)} onClick={() => onCalculation(forecastReturnDetail)} />
        </div>
      </Card>

      <button onClick={onPlan} className="rounded-xl bg-primary px-4 py-3 font-semibold text-white hover:bg-primary/90">Build my achievable savings plan</button>
    </>
  )
}

function NetWorthTooltip({ active, payload }: any) {
  const point = payload?.[0]?.payload?.raw as ForecastPoint | undefined
  if (!active || !point) return null

  return (
    <div className="max-w-64 rounded-xl border border-white/10 bg-[#1a1f2e] p-3 shadow-xl">
      <p className="text-xs text-muted">{formatMonth(point.month)}</p>
      <p className="mt-0.5 text-lg font-bold text-info">{formatCurrency(point.net_worth)}</p>
      <p className="text-[11px] text-text-secondary">
        {point.calculation_method === 'recorded_snapshots' ? 'Recorded account balances' : 'Forecast account balances'}
      </p>
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

function Plan({ analysis, intensity, setIntensity, onCalculation, onPoint }: { analysis: any; intensity: Intensity; setIntensity: (value: Intensity) => void; onCalculation: (detail: CalculationDetail) => void; onPoint: (point: ForecastPoint) => void }) {
  const planDetail = (addedOnly: boolean): CalculationDetail => ({
    title: addedOnly ? 'Added vs current' : 'Target savings',
    value: `${formatCurrency(addedOnly ? analysis.totalTargetSavings : analysis.projectedMonthlySavings)}/mo`,
    formula: addedOnly ? 'Sum of each adjustable category average - target.' : 'Forecast income - forecast expenses + total achievable category reductions.',
    dateRange: analysis.sortedMonths.length ? `${formatMonth(analysis.sortedMonths[0])} to ${formatMonth(analysis.sortedMonths[analysis.sortedMonths.length - 1])}` : 'No transaction months loaded',
    assumptions: [`${intensity} intensity uses a ${Math.round((1 - intensityFactors[intensity]) * 100)}% reduction for adjustable categories.`, 'Rent, mortgage, loan, insurance, tax, and Wedding categories are treated as fixed or temporary.'],
    warnings: analysis.sortedMonths.length < 12 ? [`Only ${analysis.sortedMonths.length} months were loaded.`] : [],
    inputs: analysis.categories.filter((category: any) => category.savings > 0).map((category: any) => ({
      label: category.name, value: formatCurrency(category.savings), note: `${formatCurrency(category.average)} average - ${formatCurrency(category.target)} target`,
    })),
  })
  const annualDetail: CalculationDetail = {
    title: 'Annual investment return',
    value: formatCurrency(analysis.annualInvestmentReturn),
    formula: 'Sum of each growth account starting balance x annual return assumption.',
    dateRange: `Starting balances for ${formatMonth(analysis.first?.month ?? '')}`,
    assumptions: ['Uses forecast engine account return assumptions.'],
    warnings: ['Estimated return; not guaranteed.'],
    inputs: analysis.returnAccounts.map((account: any) => ({ label: account.account_name, value: formatCurrency(account.starting_balance * account.annual_return_pct / 100), note: `${formatCurrency(account.starting_balance)} x ${account.annual_return_pct.toFixed(2)}%` })),
  }
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
          <Metric icon={PiggyBank} label="Target savings" value={`${formatCurrency(analysis.projectedMonthlySavings)}/mo`} tone="green" onClick={() => onCalculation(planDetail(false))} />
          <Metric icon={WalletCards} label="Added vs current" value={`${formatCurrency(analysis.totalTargetSavings)}/mo`} tone="blue" onClick={() => onCalculation(planDetail(true))} />
          <Metric icon={TrendingUp} label="Projected net worth" value={formatCurrency(analysis.last?.net_worth ?? 0)} tone="purple" onClick={() => analysis.last && onPoint(analysis.last)} />
          <Metric icon={CircleDollarSign} label="Annual investment return" value={formatCurrency(analysis.annualInvestmentReturn)} tone="green" onClick={() => onCalculation(annualDetail)} />
        </div>
      </Card>
      <Card title="Monthly spending goals">
        <div className="divide-y divide-white/10">
          {analysis.categories.filter((category: any) => category.adjustable).slice(0, 8).map((category: any) => (
            <button key={category.name} onClick={() => onCalculation({
              title: `${category.name} monthly target`,
              value: formatCurrency(category.target),
              formula: `Loaded-month category average x ${intensityFactors[intensity]} rounded to the nearest dollar.`,
              dateRange: analysis.sortedMonths.length ? `${formatMonth(analysis.sortedMonths[0])} to ${formatMonth(analysis.sortedMonths[analysis.sortedMonths.length - 1])}` : 'No transaction months loaded',
              assumptions: [`${intensity} savings intensity`, 'Months with no category spending count as $0.'],
              warnings: [
                ...(category.months < analysis.sortedMonths.length ? [`Spending was recorded in ${category.months} of ${analysis.sortedMonths.length} loaded months.`] : []),
                ...(category.sourceTransactions.length > 30 ? [`Showing the 30 most recent of ${category.sourceTransactions.length} source transactions.`] : []),
                ...(category.sourceTransactions.length ? [] : ['No source transactions were loaded; this target uses the budget-estimate fallback.']),
              ],
              inputs: category.sourceTransactions.slice(0, 30).map((transaction: Transaction) => ({ label: transaction.merchant || transaction.description, value: formatCurrency(transactionSpend(transaction)), note: `${transaction.date}${transaction.import_source ? ` · ${transaction.import_source}` : ''}${transaction.owner ? ` · ${transaction.owner}` : ''}` })),
            })} className="w-full py-3 text-left">
              <div className="mb-2 flex items-center justify-between gap-3"><p className="truncate text-sm font-medium text-text-primary">{category.name}</p><p className="text-sm text-primary">Stay below {formatCurrency(category.target)}</p></div>
              <div className="h-2 overflow-hidden rounded-full bg-white/10"><div className={cn('h-full rounded-full', category.currentSpend > category.target ? 'bg-danger' : 'bg-primary')} style={{ width: `${Math.min(100, (category.currentSpend / Math.max(category.target, 1)) * 100)}%` }} /></div>
              <p className="mt-1 text-xs text-muted">Spent {formatCurrency(category.currentSpend)} this month · recurring average {formatCurrency(category.average)}</p>
            </button>
          ))}
        </div>
      </Card>
    </>
  )
}

function Review({ anomalies, markOneOff }: { anomalies: Transaction[]; markOneOff: (transaction: Transaction) => Promise<void> }) {
  const [saving, setSaving] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const mark = async (transaction: Transaction) => {
    setSaving(transaction.id)
    setError(null)
    try {
      await markOneOff(transaction)
    } catch {
      setError('Could not mark that transaction. Try again after refreshing Foresight.')
    } finally {
      setSaving(null)
    }
  }

  return (
    <>
      <Card className="border-warning/30 bg-warning/5">
        <p className="text-xs font-semibold uppercase tracking-wider text-warning">Why these were selected</p>
        <p className="mt-2 text-sm leading-6 text-text-secondary">Each row is a source transaction of at least $150. Marking it one-off keeps its real cash impact in the month it happened, but removes it from recurring trend averages and future spending targets.</p>
      </Card>
      <Card title="Review queue">
        <p className="mb-3 text-xs text-muted">Confirm unusual purchases so one-off spending does not distort your trends and targets.</p>
        {anomalies.length ? <div className="divide-y divide-white/10">{anomalies.map((item) => (
          <div key={item.id} className="flex items-center gap-3 py-3"><ReceiptText size={19} className="text-warning" /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium text-text-primary">{item.merchant || item.description}</p><p className="text-xs text-muted">{item.category_name || 'Uncategorized'} · {item.date}</p></div><p className="text-sm font-semibold text-warning">{formatCurrency(transactionSpend(item))}</p><button disabled={saving === item.id} onClick={() => mark(item)} className="rounded-lg border border-white/10 px-2 py-1 text-xs text-text-secondary hover:text-primary disabled:opacity-50">{saving === item.id ? 'Saving...' : 'Mark one-off'}</button></div>
        ))}</div> : <div className="py-8 text-center"><CheckCircle2 className="mx-auto mb-2 text-primary" /><p className="text-sm text-text-secondary">Review queue is clear.</p></div>}
        {error && <p className="mt-3 text-xs text-danger">{error}</p>}
      </Card>
      <Card className="border-primary/30 bg-primary/5"><div className="flex gap-3"><CheckCircle2 className="text-primary" /><div><p className="font-semibold text-primary">Forecast confidence improves with review</p><p className="mt-1 text-sm text-text-secondary">One-off purchases remain in actual monthly spending but no longer inflate recurring goals.</p></div></div></Card>
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
      <Card title="Calculation trace">
        <p className="text-sm text-text-secondary">Average = sum of the monthly category totals below / {data.length || 1} loaded months. Target = average x the selected savings-intensity factor, rounded to the nearest dollar. Savings = average - target.</p>
        <div className="mt-3 divide-y divide-white/10">{data.map((item) => <div key={item.month} className="flex justify-between py-2 text-sm"><span className="text-text-secondary">{item.month}</span><span className="text-text-primary">{formatCurrency(item.amount)}</span></div>)}</div>
        <details className="mt-3 rounded-xl border border-white/10 p-3">
          <summary className="cursor-pointer text-sm font-medium text-text-primary">Source transactions ({category?.sourceTransactions?.length ?? 0})</summary>
          <div className="mt-2 max-h-72 divide-y divide-white/10 overflow-y-auto">
            {(category?.sourceTransactions ?? []).map((transaction: Transaction) => <div key={transaction.id} className="flex items-start justify-between gap-3 py-2 text-xs"><div className="min-w-0"><p className="truncate text-text-primary">{transaction.merchant || transaction.description}</p><p className="text-muted">{transaction.date}{transaction.import_source ? ` · ${transaction.import_source}` : ''}{transaction.owner ? ` · ${transaction.owner}` : ''}</p></div><span className="shrink-0 text-text-secondary">{formatCurrency(transactionSpend(transaction))}</span></div>)}
          </div>
        </details>
      </Card>
    </>
  )
}

function Metric({ icon: Icon, label, value, tone, onClick }: { icon: React.ElementType; label: string; value: string; tone: 'green' | 'red' | 'blue' | 'purple'; onClick?: () => void }) {
  const colors = { green: 'text-primary', red: 'text-danger', blue: 'text-info', purple: 'text-purple-300' }
  const content = <><div className="flex items-start justify-between"><Icon size={17} className={colors[tone]} />{onClick && <Info size={14} className="text-muted" />}</div><p className="mt-2 text-xs text-text-secondary">{label}</p><p className={cn('mt-0.5 break-words text-lg font-bold', colors[tone])}>{value}</p></>
  return onClick
    ? <button onClick={onClick} className="rounded-xl border border-white/10 bg-surface p-3 text-left hover:border-white/20 hover:bg-surface-2">{content}</button>
    : <div className="rounded-xl border border-white/10 bg-surface p-3">{content}</div>
}

function SummaryRow({ icon: Icon, text, value, onClick }: { icon: React.ElementType; text: string; value: string; onClick?: () => void }) {
  return <button onClick={onClick} disabled={!onClick} className="flex w-full items-center gap-3 py-3 text-left"><Icon size={17} className="text-primary" /><span className="min-w-0 flex-1 text-sm text-text-primary">{text}</span><span className="text-sm font-semibold text-info">{value}</span>{onClick && <ArrowRight size={14} className="text-muted" />}</button>
}

function CalculationDetailModal({ detail, onClose }: { detail: CalculationDetail; onClose: () => void }) {
  const [activeDetail, setActiveDetail] = useState(detail)
  const [history, setHistory] = useState<CalculationDetail[]>([])

  useEffect(() => {
    setActiveDetail(detail)
    setHistory([])
  }, [detail])

  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    window.addEventListener('keydown', close)
    return () => window.removeEventListener('keydown', close)
  }, [onClose])

  const openDetail = (next: CalculationDetail) => {
    setHistory((items) => [...items, activeDetail])
    setActiveDetail(next)
  }

  const goBack = () => {
    const previous = history[history.length - 1]
    if (!previous) return
    setActiveDetail(previous)
    setHistory((items) => items.slice(0, -1))
  }

  return <div className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
    <button aria-label="Close calculation detail" className="absolute inset-0 bg-black/70" onClick={onClose} />
    <div className="relative flex max-h-[92vh] w-full max-w-lg flex-col rounded-t-2xl border border-white/10 bg-surface shadow-2xl sm:rounded-2xl">
      <div className="flex items-start justify-between gap-3 border-b border-white/10 p-4">
        <div className="min-w-0">
          {history.length > 0 && <button onClick={goBack} className="mb-2 flex items-center gap-1 text-xs font-medium text-text-secondary hover:text-primary"><ArrowLeft size={13} /> Back</button>}
          <p className="text-xs font-semibold uppercase tracking-wider text-primary">Calculation detail</p>
          <h2 className="mt-1 text-lg font-bold text-text-primary">{activeDetail.title}</h2>
          <p className="text-2xl font-bold text-info">{activeDetail.value}</p>
        </div>
        <button onClick={onClose} className="rounded-lg p-2 text-text-secondary hover:bg-surface-2"><X size={18} /></button>
      </div>
      <div className="overflow-y-auto p-4">
        <DetailSection title="Exact formula"><p>{activeDetail.formula}</p></DetailSection>
        <DetailSection title="Relevant date range"><p>{activeDetail.dateRange}</p></DetailSection>
        <DetailSection title="Inputs and total">
          <div className="divide-y divide-white/10 rounded-xl border border-white/10 px-3">{activeDetail.inputs.map((input, index) => {
            const content = <><div className="min-w-0 flex-1"><p className="text-sm text-text-primary">{input.label}</p>{input.note && <p className="text-[11px] leading-4 text-muted">{input.note}</p>}</div><p className="shrink-0 text-sm font-semibold text-info">{input.value}</p>{input.detail && <ArrowRight size={14} className="shrink-0 text-muted" />}</>
            return input.detail
              ? <button key={`${input.label}-${index}`} onClick={() => openDetail(input.detail!)} className="flex w-full items-start justify-between gap-3 py-2.5 text-left hover:bg-white/[0.02]">{content}</button>
              : <div key={`${input.label}-${index}`} className="flex items-start justify-between gap-3 py-2.5">{content}</div>
          })}</div>
        </DetailSection>
        <DetailSection title="Assumptions">{activeDetail.assumptions.map((item) => <p key={item}>• {item}</p>)}</DetailSection>
        {activeDetail.warnings.length > 0 && <DetailSection title="Data quality"><div className="rounded-xl border border-warning/30 bg-warning/10 p-3 text-warning">{activeDetail.warnings.map((item) => <p key={item}>• {item}</p>)}</div></DetailSection>}
      </div>
    </div>
  </div>
}

function DetailSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section className="mb-4 text-sm leading-6 text-text-secondary"><h3 className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-primary">{title}</h3>{children}</section>
}
