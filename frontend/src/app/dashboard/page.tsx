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
import { TrendingUp, TrendingDown, DollarSign, CreditCard } from 'lucide-react'
import { useViewMode } from '@/lib/viewMode'
import { cn } from '@/lib/utils'

function QuickStat({
  label,
  value,
  icon: Icon,
  color,
}: {
  label: string
  value: number
  icon: typeof DollarSign
  color: string
}) {
  return (
    <Card className="flex items-center gap-4">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${color}`}>
        <Icon size={20} className="text-white" />
      </div>
      <div>
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-lg font-bold text-text-primary">{formatCurrency(value)}</p>
      </div>
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

export default function DashboardPage() {
  const { mode } = useViewMode()
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [alerts, setAlerts] = useState<AlertItem[]>([])

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

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 md:gap-5">
        {/* Net Worth */}
        <NetWorthCard data={data} />

        {/* Quick Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <QuickStat label="Total Assets" value={data.total_assets} icon={TrendingUp} color="bg-primary" />
          <QuickStat label="Total Liabilities" value={data.total_liabilities} icon={TrendingDown} color="bg-danger" />
          <QuickStat label="This Month Income" value={data.this_month.income} icon={DollarSign} color="bg-info" />
          <QuickStat label="This Month Spending" value={data.this_month.spending} icon={CreditCard} color="bg-warning" />
        </div>

        {/* Accounts Grid */}
        <AccountsGrid data={data} />

        {/* Charts row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <MonthlyFlowCard forecastPreview={data.forecast_preview} />
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
    </AppLayout>
  )
}
