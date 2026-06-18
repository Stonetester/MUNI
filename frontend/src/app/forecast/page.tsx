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
  getMe,
  getTransactions,
  markJointTransactionOneOff,
  updateTransaction,
} from '@/lib/api'
import { ForecastResponse, InvestmentHolding, Transaction } from '@/lib/types'
import { useViewMode } from '@/lib/viewMode'

export default function ForecastPage() {
  const { mode } = useViewMode()
  const [forecast, setForecast] = useState<ForecastResponse | null>(null)
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([])
  const [budgetEstimates, setBudgetEstimates] = useState<Array<{ category_name: string; avg_monthly: number; months_sampled: number }>>([])
  const [currentAge, setCurrentAge] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [forecastData, transactionData, holdingData, estimates, me] = await Promise.all([
        mode === 'joint' ? getJointForecast(24, 24) : getForecast(undefined, 24, 24),
        mode === 'joint' ? getJointTransactions(2000) : getTransactions({ limit: 2000 }),
        getHoldings().catch(() => []),
        getBudgetEstimates().catch(() => []),
        getMe().catch(() => null),
      ])
      setForecast(forecastData)
      setTransactions(transactionData.items)
      setHoldings(holdingData)
      setBudgetEstimates(estimates)
      setCurrentAge(me?.age ?? null)
    } catch (error) {
      console.error(error)
      setForecast(null)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { load() }, [load])

  const markOneOff = async (transaction: Transaction) => {
    if (mode === 'joint') {
      await markJointTransactionOneOff(transaction.id)
    } else {
      const marker = '[one-off]'
      const notes = transaction.notes?.trim()
      await updateTransaction(transaction.id, {
        notes: notes ? `${notes} ${marker}` : marker,
      })
    }
    await load()
  }

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
          currentAge={currentAge}
          onMarkOneOff={markOneOff}
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
