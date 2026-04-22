'use client'

import { useState, useEffect } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { getDashboard } from '@/lib/api'
import { DashboardData } from '@/lib/types'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Card from '@/components/ui/Card'
import MoneyFlowChart from '@/components/dashboard/MoneyFlowChart'
import { formatMonth, getCurrentMonth } from '@/lib/utils'

export default function FlowPage() {
  const [data, setData] = useState<DashboardData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    getDashboard()
      .then(setData)
      .catch(() => setError('Failed to load data.'))
      .finally(() => setLoading(false))
  }, [])

  return (
    <AppLayout>
      <div className="flex flex-col gap-4 max-w-lg mx-auto">
        <div>
          <h1 className="text-lg font-bold text-text-primary">Money Flow</h1>
          <p className="text-xs text-text-secondary mt-0.5">
            {formatMonth(getCurrentMonth())} — where your income goes
          </p>
        </div>

        {loading && (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        )}

        {error && (
          <div className="text-center py-16 text-danger text-sm">{error}</div>
        )}

        {data && (
          <Card>
            <MoneyFlowChart
              income={data.this_month.income}
              spending={data.this_month.spending}
              savings={data.this_month.savings}
              byCategory={data.this_month.by_category}
            />
          </Card>
        )}
      </div>
    </AppLayout>
  )
}
