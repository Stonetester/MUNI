'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { getAlerts, getDashboard, getJointSummary, getJointAccounts, getJointTransactions } from '@/lib/api'
import { AlertItem, DashboardData, Transaction } from '@/lib/types'
import { formatCurrency, accountTypeLabel } from '@/lib/utils'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import NetWorthCard from '@/components/dashboard/NetWorthCard'
import MonthlyFlowCard from '@/components/dashboard/MonthlyFlowCard'
import AccountsGrid from '@/components/dashboard/AccountsGrid'
import SpendingByCategoryChart from '@/components/dashboard/SpendingByCategoryChart'
import ForecastPreviewChart from '@/components/dashboard/ForecastPreviewChart'
import UpcomingEventsCard from '@/components/dashboard/UpcomingEventsCard'
import RecentTransactions from '@/components/dashboard/RecentTransactions'
import AlertsCard from '@/components/dashboard/AlertsCard'
import StatDetailModal, { BreakdownItem } from '@/components/dashboard/StatDetailModal'
import { TrendingUp, TrendingDown, DollarSign, CreditCard } from 'lucide-react'
import { useViewMode } from '@/lib/viewMode'
import { cn } from '@/lib/utils'

const ASSET_TYPES = new Set(['checking', 'savings', 'hysa', 'brokerage', 'ira', '401k', 'hsa', 'other', 'paycheck'])
const LIABILITY_TYPES = new Set(['credit_card', 'student_loan', 'car_loan', 'mortgage'])

// Category colors for spending breakdown
const CATEGORY_COLORS: Record<string, string> = {
  Housing: '#6366f1', Food: '#f59e0b', Transport: '#3b82f6', Healthcare: '#10b981',
  Entertainment: '#8b5cf6', Shopping: '#ec4899', Utilities: '#14b8a6', Education: '#f97316',
}

function QuickStat({
  label,
  value,
  icon: Icon,
  color,
  note,
  onClick,
}: {
  label: string
  value: number
  icon: typeof DollarSign
  color: string
  note?: string
  onClick?: () => void
}) {
  return (
    <Card
      className={`flex items-center gap-4 ${onClick ? 'cursor-pointer hover:border-primary/40 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-base sm:text-lg font-bold text-text-primary truncate">{formatCurrency(value)}</p>
        {note && <p className="text-[10px] text-muted truncate">{note}</p>}
      </div>
      {onClick && <span className="text-xs text-muted pr-1">↗</span>}
    </Card>
  )
}

interface JointAccount {
  id: number
  name: string
  account_type: string
  balance: number
  institution?: string
  owner: string
  is_active: boolean
}

interface JointSummary {
  net_worth: number
  total_assets: number
  total_liabilities: number
  this_month_income: number
  this_month_spending: number
}

function JointDashboard() {
  const [summary, setSummary] = useState<JointSummary | null>(null)
  const [accounts, setAccounts] = useState<JointAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const [s, a, t] = await Promise.all([
          getJointSummary(),
          getJointAccounts(),
          getJointTransactions(20, 0),
        ])
        setSummary(s)
        setAccounts(a)
        setTransactions(t.items)
      } catch {
        setError('Failed to load joint data.')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (error || !summary) {
    return (
      <div className="text-center py-16 text-danger">{error || 'No data'}</div>
    )
  }

  // Group accounts by owner
  const owners = Array.from(new Set(accounts.map(a => a.owner)))

  return (
    <div className="flex flex-col gap-4 md:gap-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
        <Card className="col-span-2">
          <p className="text-xs text-text-secondary">Combined Net Worth</p>
          <p className={cn('text-2xl font-bold', summary.net_worth >= 0 ? 'text-primary' : 'text-danger')}>
            {formatCurrency(summary.net_worth)}
          </p>
          <div className="flex gap-4 mt-2">
            <div>
              <p className="text-xs text-text-secondary">Assets</p>
              <p className="text-sm font-semibold text-text-primary">{formatCurrency(summary.total_assets)}</p>
            </div>
            <div>
              <p className="text-xs text-text-secondary">Liabilities</p>
              <p className="text-sm font-semibold text-danger">{formatCurrency(summary.total_liabilities)}</p>
            </div>
          </div>
        </Card>
        <QuickStat label="This Month Income" value={summary.this_month_income} icon={DollarSign} color="bg-info" />
        <QuickStat label="This Month Spending" value={summary.this_month_spending} icon={CreditCard} color="bg-warning" />
      </div>

      {/* Accounts grouped by owner */}
      {owners.map(owner => {
        const ownerAccounts = accounts.filter(a => a.owner === owner)
        const ownerNet = ownerAccounts.reduce((s, a) => {
          const isLiab = ['student_loan', 'car_loan', 'mortgage', 'credit_card'].includes(a.account_type)
          return s + (isLiab ? -Math.abs(a.balance) : a.balance)
        }, 0)
        return (
          <Card key={owner} title={`${owner}'s Accounts`} action={
            <span className={cn('text-sm font-bold', ownerNet >= 0 ? 'text-primary' : 'text-danger')}>
              {formatCurrency(ownerNet)}
            </span>
          }>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {ownerAccounts.map(acc => {
                const isLiab = ['student_loan', 'car_loan', 'mortgage', 'credit_card'].includes(acc.account_type)
                return (
                  <div key={acc.id} className="bg-surface-2 rounded-xl p-3">
                    <p className="text-xs text-text-secondary truncate">{acc.name}</p>
                    <p className="text-xs text-muted">{accountTypeLabel(acc.account_type)}</p>
                    <p className={cn('text-sm font-bold mt-1', isLiab ? 'text-danger' : 'text-text-primary')}>
                      {formatCurrency(acc.balance)}
                    </p>
                  </div>
                )
              })}
            </div>
          </Card>
        )
      })}

      {/* Joint recent transactions */}
      <RecentTransactions transactions={transactions} />
    </div>
  )
}

interface StatModal {
  title: string
  description: string
  value: number
  valueColor: string
  breakdown: BreakdownItem[]
  note?: string
}

export default function DashboardPage() {
  const { mode } = useViewMode()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [alerts, setAlerts] = useState<AlertItem[]>([])
  const [statModal, setStatModal] = useState<StatModal | null>(null)

  useEffect(() => {
    if (mode === 'joint') return
    async function load() {
      try {
        const [d, a] = await Promise.all([getDashboard(), getAlerts()])
        setData(d)
        setAlerts(a)
      } catch (e) {
        setError('Failed to load dashboard data. Is the API running?')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [mode])

  if (mode === 'joint') {
    return (
      <AppLayout>
        <JointDashboard />
      </AppLayout>
    )
  }

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </AppLayout>
    )
  }

  if (error || !data) {
    return (
      <AppLayout>
        <div className="flex flex-col items-center justify-center h-64 gap-3 text-text-secondary">
          <p className="text-danger">{error || 'No data available'}</p>
          <button
            onClick={() => { setError(''); setLoading(true); getDashboard().then(setData).catch(() => setError('Failed to load')).finally(() => setLoading(false)) }}
            className="text-sm text-primary hover:underline"
          >
            Retry
          </button>
        </div>
      </AppLayout>
    )
  }

  // Build breakdown data for each clickable stat
  function openAssets() {
    const breakdown: BreakdownItem[] = data!.balances_by_type
      .filter((b) => ASSET_TYPES.has(b.account_type) && b.total > 0)
      .flatMap((b) =>
        b.accounts.map((a) => ({
          label: a.name,
          sublabel: accountTypeLabel(b.account_type),
          value: a.balance,
          color: '#10b981',
        }))
      )
      .sort((a, b) => b.value - a.value)
    setStatModal({
      title: 'Total Assets',
      description: 'Sum of all your accounts that hold positive value — checking, savings, investments, and more.',
      value: data!.total_assets,
      valueColor: 'text-primary',
      breakdown,
      note: 'Only accounts with a positive balance are counted as assets.',
    })
  }

  function openLiabilities() {
    const breakdown: BreakdownItem[] = data!.balances_by_type
      .filter((b) => LIABILITY_TYPES.has(b.account_type))
      .flatMap((b) =>
        b.accounts.map((a) => ({
          label: a.name,
          sublabel: accountTypeLabel(b.account_type),
          value: Math.abs(a.balance),
          color: '#f87171',
        }))
      )
      .sort((a, b) => b.value - a.value)
    setStatModal({
      title: 'Total Liabilities',
      description: 'Sum of all debt balances — credit cards, student loans, car loans, and mortgages.',
      value: data!.total_liabilities,
      valueColor: 'text-danger',
      breakdown,
      note: 'Paying these down increases your net worth directly.',
    })
  }

  function openIncome() {
    const currentMonth = new Date().toISOString().slice(0, 7)
    const incomeTxns = data!.recent_transactions
      .filter((t) => t.date.startsWith(currentMonth) && t.amount > 0)
      .sort((a, b) => b.amount - a.amount)
    const breakdown: BreakdownItem[] = incomeTxns.map((t) => ({
      label: t.description,
      sublabel: t.account_name ? `${t.account_name} · ${t.date}` : t.date,
      value: t.amount,
      color: '#10b981',
    }))
    setStatModal({
      title: 'This Month Income',
      description: 'Net take-home pay and other income received this calendar month. Employer 401k contributions are excluded (they go directly to your 401k, not your checking).',
      value: data!.this_month.income,
      valueColor: 'text-primary',
      breakdown,
      note: breakdown.length === 0
        ? 'No income transactions found in recent history for this month.'
        : `Showing ${breakdown.length} income transaction${breakdown.length !== 1 ? 's' : ''} from recent history. Import paystubs to see full detail.`,
    })
  }

  function openSpending() {
    const byCategory = data!.this_month.by_category || {}
    const breakdown: BreakdownItem[] = Object.entries(byCategory)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .map(([name, val]) => ({
        label: name,
        value: val,
        color: CATEGORY_COLORS[name] || '#94a3b8',
      }))
    setStatModal({
      title: 'This Month Spending',
      description: 'Total expenses recorded this calendar month, broken down by category.',
      value: data!.this_month.spending,
      valueColor: 'text-warning',
      breakdown,
      note: 'Spending data comes from your synced transactions. Categories with no spend are hidden.',
    })
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 md:gap-5">
        {/* Net Worth */}
        <NetWorthCard data={data} />

        {/* Quick Stats */}
        {(() => {
          // Trailing 3-month spending average from the last 3 past months in flow_months
          // flow_months = 24 past months (oldest first) + current + 5 future
          const past = data.flow_months.slice(0, 24).filter(p => p.expenses > 0)
          const trail3 = past.slice(-3)
          const avgSpending = trail3.length > 0
            ? trail3.reduce((s, p) => s + p.expenses, 0) / trail3.length
            : null
          const spendingNote = avgSpending ? `3-mo avg: ${formatCurrency(avgSpending)}` : undefined
          return (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
              <QuickStat label="Total Assets" value={data.total_assets} icon={TrendingUp} color="bg-primary" onClick={openAssets} />
              <QuickStat label="Total Liabilities" value={data.total_liabilities} icon={TrendingDown} color="bg-danger" onClick={openLiabilities} />
              <QuickStat label="This Month Income" value={data.this_month.income} icon={DollarSign} color="bg-info" onClick={openIncome} />
              <QuickStat label="This Month Spending" value={data.this_month.spending} icon={CreditCard} color="bg-warning" note={spendingNote} onClick={openSpending} />
            </div>
          )
        })()}

        {/* Accounts Grid */}
        <AccountsGrid data={data} />

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MonthlyFlowCard flowMonths={data.flow_months} />
          <SpendingByCategoryChart byCategory={data.this_month.by_category} />
        </div>

        {/* Forecast + Events */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <ForecastPreviewChart forecastPreview={data.forecast_preview} />
          <UpcomingEventsCard events={data.upcoming_events} />
          <AlertsCard alerts={alerts} />
        </div>

        {/* Recent Transactions */}
        <RecentTransactions transactions={data.recent_transactions} />
      </div>

      {statModal && (
        <StatDetailModal
          title={statModal.title}
          description={statModal.description}
          value={statModal.value}
          valueColor={statModal.valueColor}
          breakdown={statModal.breakdown}
          note={statModal.note}
          onClose={() => setStatModal(null)}
        />
      )}
    </AppLayout>
  )
}
