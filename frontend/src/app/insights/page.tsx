'use client'

/**
 * Spending Insights — applies analytical frameworks from:
 * - CSV Data Summarizer: transaction mode analysis (monthly totals, category breakdown)
 * - K-Dense AI Scientific Skills: rolling statistics, z-score anomaly detection, trend detection
 * - Anthropic Financial Modeling Suite: scenario-based debt payoff, sensitivity modeling
 * - Awesome Agent Skills: emergency fund ratio, savings rate, debt-to-income metrics
 */

import { useState, useEffect, useCallback, useMemo } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getTransactions, getAccounts, getCategories, getDashboard } from '@/lib/api'
import { Transaction, Account, Category, DashboardData } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid,
  Legend, LineChart, Line, TooltipProps,
} from 'recharts'
import {
  TrendingUp, TrendingDown, Minus, AlertTriangle, ShieldCheck, ShieldAlert,
  Shield, Zap,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import InfoTooltip from '@/components/ui/InfoTooltip'

// ─── Pure math helpers (K-Dense / Quant Analyst methodology) ─────────────────

function mean(arr: number[]): number {
  if (!arr.length) return 0
  return arr.reduce((s, v) => s + v, 0) / arr.length
}

function stddev(arr: number[], avg?: number): number {
  if (arr.length < 2) return 0
  const m = avg ?? mean(arr)
  return Math.sqrt(arr.reduce((s, v) => s + Math.pow(v - m, 2), 0) / arr.length)
}

// Debt amortization: months to payoff given balance, annual rate %, monthly payment
function monthsToPayoff(balance: number, annualRatePct: number, monthlyPayment: number): number | null {
  if (monthlyPayment <= 0) return null
  const r = annualRatePct / 100 / 12
  if (r === 0) return Math.ceil(balance / monthlyPayment)
  const interest = balance * r
  if (monthlyPayment <= interest) return null // never pays off
  return Math.ceil(-Math.log(1 - (balance * r) / monthlyPayment) / Math.log(1 + r))
}

function totalInterest(balance: number, annualRatePct: number, monthlyPayment: number): number {
  const months = monthsToPayoff(balance, annualRatePct, monthlyPayment)
  if (!months) return Infinity
  const r = annualRatePct / 100 / 12
  let bal = balance
  let totalInt = 0
  for (let i = 0; i < months; i++) {
    const int = bal * r
    totalInt += int
    bal = bal + int - monthlyPayment
  }
  return Math.max(0, totalInt)
}

function addMonths(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() + n)
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthBucket {
  month: string           // "YYYY-MM"
  label: string           // "Mar 2025"
  income: number
  expenses: number
  net: number
  byCategory: Record<string, number>
}

interface CategoryStat {
  name: string
  color: string
  monthly: number[]       // amount per month (expenses, positive)
  avg12: number
  avg3: number
  trend: 'up' | 'stable' | 'down'
  momChange: number       // last month vs month before, as %
  anomalyMonths: string[] // months with z-score > 1.5
  totalSpent: number
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function HealthCard({
  title, value, subtitle, status, icon: Icon,
}: {
  title: string
  value: string
  subtitle: string
  status: 'good' | 'warn' | 'bad' | 'neutral'
  icon: React.ElementType
}) {
  const colors = {
    good: 'text-green-400 bg-green-400/10',
    warn: 'text-yellow-400 bg-yellow-400/10',
    bad: 'text-red-400 bg-red-400/10',
    neutral: 'text-primary bg-primary/10',
  }
  const textColor = {
    good: 'text-green-400',
    warn: 'text-yellow-400',
    bad: 'text-red-400',
    neutral: 'text-primary',
  }
  return (
    <Card className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0', colors[status])}>
          <Icon size={16} className={textColor[status]} />
        </div>
        <p className="text-xs text-text-secondary">{title}</p>
      </div>
      <p className={cn('text-xl font-bold', textColor[status])}>{value}</p>
      <p className="text-xs text-muted leading-snug">{subtitle}</p>
    </Card>
  )
}

function TrendArrow({ trend, momChange }: { trend: 'up' | 'stable' | 'down'; momChange: number }) {
  if (trend === 'up') return (
    <span className="flex items-center gap-1 text-red-400 text-xs font-medium">
      <TrendingUp size={12} />
      {momChange > 0 ? '+' : ''}{momChange.toFixed(0)}%
    </span>
  )
  if (trend === 'down') return (
    <span className="flex items-center gap-1 text-green-400 text-xs font-medium">
      <TrendingDown size={12} />
      {momChange.toFixed(0)}%
    </span>
  )
  return (
    <span className="flex items-center gap-1 text-text-secondary text-xs">
      <Minus size={12} />stable
    </span>
  )
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl min-w-[160px]">
      <p className="text-text-secondary font-medium mb-2">{label}</p>
      {payload.map((entry) => (
        <div key={entry.name} className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-text-secondary">{entry.name}:</span>
          <span className="text-text-primary font-semibold">
            {entry.name === 'Savings Rate' ? `${(entry.value as number).toFixed(1)}%` : formatCurrency(entry.value as number)}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Debt Payoff Scenarios (Anthropic Financial Modeling methodology) ─────────

function DebtPayoffCard({ loanAccounts, monthlyDebtPayment }: {
  loanAccounts: Account[]
  monthlyDebtPayment: number
}) {
  const [rate, setRate] = useState(5.5)
  const totalDebt = loanAccounts.reduce((s, a) => s + Math.abs(a.balance), 0)
  const base = monthlyDebtPayment || 800

  const scenarios = [
    { label: 'Minimum', payment: base, color: '#f87171' },
    { label: `+$200/mo`, payment: base + 200, color: '#facc15' },
    { label: `+$500/mo`, payment: base + 500, color: '#10b981' },
  ]

  return (
    <Card title="Debt Payoff Scenarios">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-3 text-sm">
          <span className="text-text-secondary">Total debt: <span className="text-red-400 font-semibold">{formatCurrency(totalDebt)}</span></span>
          <div className="flex items-center gap-2 ml-auto">
            <label className="text-text-secondary text-xs">Interest rate:</label>
            <input
              type="number"
              value={rate}
              onChange={(e) => setRate(parseFloat(e.target.value) || 0)}
              step="0.1"
              min="0"
              max="20"
              className="w-16 bg-surface-2 border border-[#2d3748] rounded-lg px-2 py-1 text-xs text-text-primary text-center focus:outline-none focus:border-primary"
            />
            <span className="text-text-secondary text-xs">%</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {scenarios.map((s) => {
            const months = monthsToPayoff(totalDebt, rate, s.payment)
            const interest = totalInterest(totalDebt, rate, s.payment)
            const payoffDate = months ? addMonths(months) : null
            return (
              <div key={s.label} className="bg-surface-2 rounded-xl p-3 flex flex-col gap-2 border border-[#2d3748]">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-text-primary">{s.label}</span>
                  <span className="text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: s.color, backgroundColor: `${s.color}20` }}>
                    {formatCurrency(s.payment)}/mo
                  </span>
                </div>
                <div className="flex flex-col gap-1 text-xs">
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Payoff</span>
                    <span className="text-text-primary font-medium">{months ? `${months} mo` : '∞'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Date</span>
                    <span className="text-text-primary font-medium">{payoffDate || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-text-secondary">Interest paid</span>
                    <span className="text-red-400 font-medium">{interest < Infinity ? formatCurrency(interest) : '—'}</span>
                  </div>
                  <div className="flex justify-between pt-1 border-t border-[#2d3748]">
                    <span className="text-text-secondary">Total cost</span>
                    <span className="font-semibold" style={{ color: s.color }}>
                      {interest < Infinity ? formatCurrency(totalDebt + interest) : '—'}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
        <p className="text-xs text-muted">
          Savings from paying +$500/mo vs minimum:{' '}
          <span className="text-green-400 font-semibold">
            {formatCurrency(Math.max(0, totalInterest(totalDebt, rate, base) - totalInterest(totalDebt, rate, base + 500)))} in interest
          </span>
        </p>
      </div>
    </Card>
  )
}

// ─── Main Insights Page ───────────────────────────────────────────────────────

export default function InsightsPage() {
  const [period, setPeriod] = useState<3 | 6 | 12>(12)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [dashboard, setDashboard] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)

  const fromDate = useMemo(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - period)
    d.setDate(1)
    return d.toISOString().slice(0, 10)
  }, [period])

  const toDate = useMemo(() => new Date().toISOString().slice(0, 10), [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [txns, accts, cats, dash] = await Promise.all([
        getTransactions({ from_date: fromDate, to_date: toDate, limit: 2000 }),
        getAccounts(),
        getCategories(),
        getDashboard(),
      ])
      setTransactions(txns.items)
      setAccounts(accts)
      setCategories(cats)
      setDashboard(dash)
    } catch { /* silent */ } finally {
      setLoading(false)
    }
  }, [fromDate, toDate])

  useEffect(() => { load() }, [load])

  // ── Derived data (K-Dense rolling stats methodology) ─────────────────────

  const colorMap = useMemo(
    () => Object.fromEntries(categories.map((c) => [c.name, c.color])),
    [categories]
  )

  // Build month list for selected period
  const monthList = useMemo((): string[] => {
    const months: string[] = []
    const d = new Date()
    d.setDate(1)
    for (let i = period - 1; i >= 0; i--) {
      const m = new Date(d)
      m.setMonth(d.getMonth() - i)
      months.push(`${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, '0')}`)
    }
    return months
  }, [period])

  // Group transactions into month buckets
  const monthBuckets = useMemo((): MonthBucket[] => {
    const buckets: Record<string, MonthBucket> = {}
    for (const m of monthList) {
      buckets[m] = {
        month: m,
        label: new Date(m + '-01').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
        income: 0, expenses: 0, net: 0, byCategory: {},
      }
    }
    // Build a set of savings-kind category names so we can exclude them from expenses.
    // Savings transfers (e.g. HYSA contributions) are not true expenses — treating them
    // as expenses inflates spending and deflates the savings rate metric.
    const savingsCatNames = new Set(
      categories.filter(c => c.kind === 'savings').map(c => c.name)
    )

    for (const t of transactions) {
      const m = t.date.slice(0, 7)
      if (!buckets[m]) continue
      const b = buckets[m]
      const catName = t.category_name || 'Uncategorized'
      if (t.amount > 0) {
        b.income += t.amount
      } else if (!savingsCatNames.has(catName)) {
        // Only count as expense if it's not a savings transfer
        const abs = Math.abs(t.amount)
        b.expenses += abs
        b.byCategory[catName] = (b.byCategory[catName] || 0) + abs
      }
      b.net = b.income - b.expenses
    }
    return monthList.map((m) => buckets[m])
  }, [transactions, monthList])

  // Category stats using K-Dense rolling statistics approach
  const categoryStats = useMemo((): CategoryStat[] => {
    const catNames = Array.from(
      new Set(monthBuckets.flatMap((b) => Object.keys(b.byCategory)))
    )

    const stats: CategoryStat[] = []
    for (const name of catNames) {
      const monthly = monthBuckets.map((b) => b.byCategory[name] || 0)
      const avg12 = mean(monthly)
      const avg3 = mean(monthly.slice(-3))
      const sd = stddev(monthly, avg12)

      // Trend: 3-month trailing avg vs overall mean (K-Dense threshold: ±15%)
      const trend: 'up' | 'stable' | 'down' =
        avg3 > avg12 * 1.15 ? 'up' :
        avg3 < avg12 * 0.85 ? 'down' : 'stable'

      // Month-over-month change
      const last = monthly[monthly.length - 1]
      const prev = monthly[monthly.length - 2] || 0
      const momChange = prev > 0 ? ((last - prev) / prev) * 100 : 0

      // Anomaly detection: z-score > 1.5 (K-Dense methodology)
      const anomalyMonths = monthly
        .map((v, i) => ({ v, label: monthBuckets[i].label, z: sd > 0 ? (v - avg12) / sd : 0 }))
        .filter((x) => x.z > 1.5)
        .map((x) => x.label)

      stats.push({
        name,
        color: colorMap[name] || '#94a3b8',
        monthly,
        avg12,
        avg3,
        trend,
        momChange,
        anomalyMonths,
        totalSpent: monthly.reduce((s, v) => s + v, 0),
      })
    }
    return stats.filter((s) => s.avg12 > 5).sort((a, b) => b.avg12 - a.avg12)
  }, [monthBuckets, colorMap])

  // ── Financial Health Metrics (Awesome Agent methodology) ─────────────────

  // Include joint HYSA accounts (is_joint=true) — visible now that accounts.py includes all joint accounts
  const hysa = accounts.find((a) => a.account_type === 'hysa')
  const loanAccounts = accounts.filter((a) =>
    ['student_loan', 'car_loan', 'mortgage'].includes(a.account_type) && a.balance < 0
  )
  const avgMonthlyExpenses = mean(monthBuckets.map((b) => b.expenses).filter((v) => v > 0))
  const emergencyMonths = hysa && avgMonthlyExpenses > 0
    ? (hysa.balance / avgMonthlyExpenses)
    : null

  const savingsRates = monthBuckets
    .filter((b) => b.income > 0)
    .map((b) => ((b.income - b.expenses) / b.income) * 100)
  const avgSavingsRate = mean(savingsRates)

  // Debt-to-income: monthly debt payments vs monthly income
  const monthlyDebtPayment = 800 // from recurring rules (student loan)
  const monthlyIncome = dashboard?.this_month.income || mean(monthBuckets.map((b) => b.income))
  const dti = monthlyIncome > 0 ? (monthlyDebtPayment / monthlyIncome) * 100 : 0

  // Chart data
  const chartData = monthBuckets.map((b) => ({
    month: b.label,
    Income: b.income,
    Spending: b.expenses,
    'Savings Rate': b.income > 0 ? +((b.income - b.expenses) / b.income * 100).toFixed(1) : 0,
  }))

  // Top categories for current month
  const thisMonth = monthBuckets[monthBuckets.length - 1]
  const topCatsThisMonth = Object.entries(thisMonth?.byCategory || {})
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)

  const maxThisMonth = Math.max(...topCatsThisMonth.map(([, v]) => v), 1)

  return (
    <AppLayout>
      <div className="flex flex-col gap-5">

        {/* Period selector */}
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h2 className="text-base font-bold text-text-primary">Spending Insights</h2>
            <p className="text-xs text-muted mt-0.5">
              Statistical analysis of your transactions — trend detection, anomaly flags, debt payoff modeling
            </p>
          </div>
          <div className="flex items-center gap-1 bg-surface border border-[#2d3748] rounded-xl p-1">
            {([3, 6, 12] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-sm font-medium transition-colors',
                  period === p ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
                )}
              >
                {p}mo
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
            {/* ── Financial Health Scorecard ───────────────────────────── */}
            <div className="flex items-center gap-1.5 mb-1">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Financial Health Scorecard</p>
              <InfoTooltip
                title="How these scores are calculated"
                content={
                  <div className="flex flex-col gap-2">
                    <p><strong className="text-text-primary">Emergency Fund:</strong> Your HYSA balance ÷ your average monthly expenses. 3–6 months is the standard recommendation; 6+ is strong.</p>
                    <p><strong className="text-text-primary">Savings Rate:</strong> (Income − Expenses) ÷ Income, averaged over the selected period. 20%+ is excellent; 10–20% is good.</p>
                    <p><strong className="text-text-primary">Debt-to-Income:</strong> Monthly debt payments ÷ monthly gross income. Under 15% is healthy; above 28% is high.</p>
                    <p><strong className="text-text-primary">Avg Monthly Net:</strong> Average of (income − expenses) each month. Positive means you&apos;re saving; negative means spending exceeds income.</p>
                  </div>
                }
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <HealthCard
                title="Emergency Fund"
                value={emergencyMonths != null ? `${emergencyMonths.toFixed(1)} months` : 'N/A'}
                subtitle={
                  emergencyMonths == null ? 'No HYSA found' :
                  emergencyMonths >= 6 ? 'Strong — 6+ months covered' :
                  emergencyMonths >= 3 ? 'Adequate — aim for 6 months' :
                  'Low — build to 3–6 months'
                }
                status={
                  emergencyMonths == null ? 'neutral' :
                  emergencyMonths >= 6 ? 'good' :
                  emergencyMonths >= 3 ? 'warn' : 'bad'
                }
                icon={emergencyMonths != null && emergencyMonths >= 6 ? ShieldCheck : emergencyMonths != null && emergencyMonths >= 3 ? Shield : ShieldAlert}
              />
              <HealthCard
                title="Avg Savings Rate"
                value={`${avgSavingsRate.toFixed(1)}%`}
                subtitle={
                  avgSavingsRate >= 20 ? 'Excellent — above 20%' :
                  avgSavingsRate >= 10 ? 'Good — aim for 20%' :
                  avgSavingsRate >= 0 ? 'Low — reduce expenses' :
                  'Spending exceeds income'
                }
                status={avgSavingsRate >= 20 ? 'good' : avgSavingsRate >= 10 ? 'warn' : 'bad'}
                icon={avgSavingsRate >= 10 ? TrendingUp : TrendingDown}
              />
              <HealthCard
                title="Debt-to-Income"
                value={`${dti.toFixed(1)}%`}
                subtitle={
                  dti < 15 ? 'Healthy — under 15%' :
                  dti < 28 ? 'Moderate — under 28%' :
                  'High — above 28%'
                }
                status={dti < 15 ? 'good' : dti < 28 ? 'warn' : 'bad'}
                icon={dti < 15 ? Zap : AlertTriangle}
              />
              <HealthCard
                title="Avg Monthly Net"
                value={formatCurrency(mean(monthBuckets.map((b) => b.net)))}
                subtitle={`Over last ${period} months · ${mean(monthBuckets.map((b) => b.net)) >= 0 ? 'positive cash flow' : 'negative — spending exceeds income'}`}
                status={mean(monthBuckets.map((b) => b.net)) >= 0 ? 'good' : 'bad'}
                icon={mean(monthBuckets.map((b) => b.net)) >= 0 ? TrendingUp : TrendingDown}
              />
            </div>

            {/* ── Income vs Spending Trend ─────────────────────────────── */}
            <Card title={`Income vs Spending — Last ${period} Months`}>
              <p className="text-xs text-muted mb-3">
                Monthly cash flow from imported transactions. Income may be understated if paychecks aren&apos;t in transactions.
              </p>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} barGap={3} barCategoryGap="25%">
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="left" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} width={48} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: '#94a3b8', fontSize: 10 }}
                      axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} width={36} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }} />
                    <Bar yAxisId="left" dataKey="Income" fill="#10B981" radius={[3, 3, 0, 0]} />
                    <Bar yAxisId="left" dataKey="Spending" fill="#f87171" radius={[3, 3, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="Savings Rate" stroke="#14b8a6"
                      strokeWidth={2} dot={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>

            {/* ── Savings Rate Trend ───────────────────────────────────── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card title="Savings Rate Over Time">
                <div className="h-48">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                      <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false}
                        tickFormatter={(v) => `${v}%`} width={36} />
                      <Tooltip content={<CustomTooltip />} />
                      <Line type="monotone" dataKey="Savings Rate" stroke="#14b8a6" strokeWidth={2.5}
                        dot={{ r: 3, fill: '#14b8a6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              {/* Top categories this month */}
              <Card title={`Top Spending — ${thisMonth?.label || 'This Month'}`}>
                <div className="flex flex-col gap-2.5">
                  {topCatsThisMonth.length === 0 && (
                    <p className="text-sm text-text-secondary text-center py-6">No spending data for this month</p>
                  )}
                  {topCatsThisMonth.map(([cat, val]) => (
                    <div key={cat} className="flex flex-col gap-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full" style={{ backgroundColor: colorMap[cat] || '#94a3b8' }} />
                          <span className="text-text-primary">{cat}</span>
                        </div>
                        <span className="text-red-400 font-medium">{formatCurrency(val)}</span>
                      </div>
                      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${(val / maxThisMonth) * 100}%`, backgroundColor: colorMap[cat] || '#94a3b8' }} />
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </div>

            {/* ── Category Intelligence (K-Dense rolling stats methodology) ── */}
            <Card title="Category Trend Analysis" action={
              <InfoTooltip
                title="How trends & anomalies are detected"
                content={
                  <div className="flex flex-col gap-2">
                    <p><strong className="text-text-primary">Trend:</strong> Compares your 3-month trailing average to your longer-term average for the same category. Up = spending more recently; Down = spending less.</p>
                    <p><strong className="text-text-primary">Anomaly (z-score):</strong> A month is flagged when its spending is more than 1.5 standard deviations above your average for that category. Standard deviation measures how much your spending varies — a z-score of 1.5 means it was unusually high, not just a little above average.</p>
                    <p className="text-muted">These thresholds follow standard statistical practice for identifying outliers in personal finance data.</p>
                  </div>
                }
              />
            }>
              <p className="text-xs text-muted mb-3">
                Trend = 3-month trailing avg vs {period}-month avg. Anomaly = month where spending was unusually high (z-score &gt; 1.5).
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[#2d3748]">
                      <th className="text-left py-2 pr-4 text-xs text-text-secondary font-medium">Category</th>
                      <th className="text-right py-2 pr-4 text-xs text-text-secondary font-medium">{period}mo Avg/mo</th>
                      <th className="text-right py-2 pr-4 text-xs text-text-secondary font-medium">3mo Avg/mo</th>
                      <th className="text-center py-2 pr-4 text-xs text-text-secondary font-medium">Trend</th>
                      <th className="text-right py-2 pr-4 text-xs text-text-secondary font-medium">Last Month</th>
                      <th className="text-left py-2 text-xs text-text-secondary font-medium">Anomalies</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categoryStats.slice(0, 12).map((s) => (
                      <tr key={s.name} className="border-b border-[#2d3748]/50 hover:bg-surface-2 transition-colors">
                        <td className="py-2.5 pr-4">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="text-text-primary font-medium">{s.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 pr-4 text-right text-text-secondary">{formatCurrency(s.avg12)}</td>
                        <td className="py-2.5 pr-4 text-right text-text-secondary">{formatCurrency(s.avg3)}</td>
                        <td className="py-2.5 pr-4 text-center">
                          <TrendArrow trend={s.trend} momChange={s.momChange} />
                        </td>
                        <td className="py-2.5 pr-4 text-right text-red-400 font-medium">
                          {formatCurrency(s.monthly[s.monthly.length - 1])}
                        </td>
                        <td className="py-2.5 text-xs text-yellow-400">
                          {s.anomalyMonths.length > 0
                            ? s.anomalyMonths.slice(0, 2).join(', ') + (s.anomalyMonths.length > 2 ? ` +${s.anomalyMonths.length - 2}` : '')
                            : <span className="text-muted">—</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {categoryStats.length === 0 && (
                  <p className="text-center text-text-secondary py-8">No transaction data found for this period</p>
                )}
              </div>
            </Card>

            {/* ── Debt Payoff Scenarios (Anthropic Financial Modeling methodology) ── */}
            {loanAccounts.length > 0 && (
              <DebtPayoffCard loanAccounts={loanAccounts} monthlyDebtPayment={monthlyDebtPayment} />
            )}

            {/* ── Anomaly Summary ──────────────────────────────────────── */}
            {categoryStats.some((s) => s.anomalyMonths.length > 0) && (
              <Card title="Spending Anomalies Detected" action={
                <InfoTooltip
                  title="What is a spending anomaly?"
                  content={
                    <div className="flex flex-col gap-2">
                      <p>An anomaly is a month where you spent significantly more than usual in a category — specifically, more than 1.5 standard deviations above your average.</p>
                      <p><strong className="text-text-primary">Standard deviation</strong> measures how spread out your monthly spending is. If your grocery spending is usually $400 ± $50, a month at $600 would be flagged as an anomaly.</p>
                      <p className="text-muted">Anomalies aren&apos;t always bad — they may reflect one-time purchases like travel or gifts. Review them to decide if spending was intentional.</p>
                    </div>
                  }
                />
              }>
                <p className="text-xs text-muted mb-3">
                  Months where spending in a category was more than 1.5 standard deviations above your average (K-Dense z-score method).
                </p>
                <div className="flex flex-col gap-2">
                  {categoryStats.filter((s) => s.anomalyMonths.length > 0).map((s) => (
                    <div key={s.name} className="flex items-start gap-3 p-3 rounded-xl bg-yellow-400/5 border border-yellow-400/20">
                      <AlertTriangle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
                      <div>
                        <span className="text-sm font-medium text-text-primary">{s.name}</span>
                        <span className="text-sm text-text-secondary"> — unusually high in: </span>
                        <span className="text-sm text-yellow-300">{s.anomalyMonths.join(', ')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </>
        )}
      </div>
    </AppLayout>
  )
}
