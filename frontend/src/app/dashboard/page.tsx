'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { getDashboard } from '@/lib/api'
import { DashboardData } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import NetWorthCard from '@/components/dashboard/NetWorthCard'
import MonthlyFlowCard from '@/components/dashboard/MonthlyFlowCard'
import AccountsGrid from '@/components/dashboard/AccountsGrid'
import SpendingByCategoryChart from '@/components/dashboard/SpendingByCategoryChart'
import ForecastPreviewChart from '@/components/dashboard/ForecastPreviewChart'
import UpcomingEventsCard from '@/components/dashboard/UpcomingEventsCard'
import RecentTransactions from '@/components/dashboard/RecentTransactions'
import { TrendingUp, TrendingDown, DollarSign, CreditCard } from 'lucide-react'

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

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    async function load() {
      try {
        const d = await getDashboard()
        setData(d)
      } catch (e) {
        setError('Failed to load dashboard data. Is the API running?')
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <ForecastPreviewChart forecastPreview={data.forecast_preview} />
          <UpcomingEventsCard events={data.upcoming_events} />
        </div>

        {/* Recent Transactions */}
        <RecentTransactions transactions={data.recent_transactions} />
      </div>
    </AppLayout>
  )
}
