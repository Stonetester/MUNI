'use client'

import { useCallback, useEffect, useState } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Button from '@/components/ui/Button'
import ForesightDashboard from '@/components/foresight/ForesightDashboard'
import {
  getBudgetEstimates,
  getForecast,
  getHoldings,
  getJointForecast,
  getJointTransactions,
  getTransactions,
} from '@/lib/api'
import { ForecastResponse, InvestmentHolding, Transaction } from '@/lib/types'
import { useViewMode } from '@/lib/viewMode'

export default function ForecastPage() {
  const { mode } = useViewMode()
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([])
  const [budgetEstimates, setBudgetEstimates] = useState<Array<{ category_name: string; avg_monthly: number; months_sampled: number }>>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [forecastData, transactionData, holdingData, estimates] = await Promise.all([
        mode === 'joint' ? getJointForecast(24, 24) : getForecast(undefined, 24, 24),
        mode === 'joint' ? getJointTransactions(2000) : getTransactions({ limit: 2000 }),
        getHoldings().catch(() => []),
        getBudgetEstimates().catch(() => []),
      ])
      setForecast(forecastData)
      setTransactions(transactionData.items)
      setHoldings(holdingData)
      setBudgetEstimates(estimates)
    } catch (error) {
      console.error(error)
      setForecast(null)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { load() }, [load])

  return (
    <AppLayout>
      {loading ? (
        <div className="flex h-64 items-center justify-center"><LoadingSpinner size="lg" /></div>
      ) : forecast ? (
        <ForesightDashboard
          forecast={forecast}
          transactions={transactions}
          holdings={holdings}
          budgetEstimates={budgetEstimates}
        />
      ) : (
        <div className="py-16 text-center text-text-secondary">
          <p>Foresight could not load your financial data.</p>
          <Button variant="primary" className="mt-4" onClick={load}>Retry</Button>
        </div>
      )}
    </AppLayout>
  )
}
