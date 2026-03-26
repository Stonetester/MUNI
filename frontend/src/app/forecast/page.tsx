'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Select from '@/components/ui/Select'
import NetWorthForecastChart from '@/components/forecast/NetWorthForecastChart'
import ForecastChart from '@/components/forecast/ForecastChart'
import CategoryForecastTable from '@/components/forecast/CategoryForecastTable'
import AccountForecastChart from '@/components/forecast/AccountForecastChart'
import { getForecast, getScenarios } from '@/lib/api'
import { ForecastResponse, Scenario } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

const MONTH_OPTIONS = [
  { value: 6, label: '6 months' },
  { value: 12, label: '12 months' },
  { value: 24, label: '24 months' },
  { value: 36, label: '36 months' },
  { value: 60, label: '60 months' },
]

const PAST_OPTIONS = [
  { value: 0, label: 'From now' },
  { value: 3, label: '3mo history' },
  { value: 6, label: '6mo history' },
  { value: 12, label: '12mo history' },
]

export default function ForecastPage() {
  const [data, setData] = useState<ForecastResponse | null>(null)
  const [scenarios, setScenarios] = useState<Scenario[]>([])
  const [scenarioId, setScenarioId] = useState<number | undefined>()
  const [months, setMonths] = useState(12)
  const [pastMonths, setPastMonths] = useState(0)
  const [showEvents, setShowEvents] = useState(true)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [forecastData, scenarioList] = await Promise.all([
        getForecast(scenarioId, months, pastMonths),
        getScenarios(),
      ])
      setData(forecastData)
      setScenarios(scenarioList)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [scenarioId, months, pastMonths])

  useEffect(() => { load() }, [load])

  const scenarioOptions = scenarios.map((s) => ({ value: s.id, label: `${s.name}${s.is_baseline ? ' (Baseline)' : ''}` }))

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {/* Controls */}
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-3">
          <Select
            placeholder="All scenarios"
            options={scenarioOptions}
            value={scenarioId || ''}
            onChange={(e) => setScenarioId(e.target.value ? Number(e.target.value) : undefined)}
            className="w-full sm:w-44"
          />
          <div className="flex items-center gap-1 bg-surface border border-[#2d3748] rounded-xl p-1 overflow-x-auto">
            {PAST_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setPastMonths(opt.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  pastMonths === opt.value
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1 bg-surface border border-[#2d3748] rounded-xl p-1 overflow-x-auto">
            {MONTH_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setMonths(opt.value)}
                className={`px-2.5 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition-colors whitespace-nowrap ${
                  months === opt.value
                    ? 'bg-primary text-white'
                    : 'text-text-secondary hover:text-text-primary'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 cursor-pointer sm:ml-auto">
            <input
              type="checkbox"
              checked={showEvents}
              onChange={(e) => setShowEvents(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm text-text-secondary">Show life events</span>
          </label>
        </div>

        <p className="text-xs text-muted">Income shown is <strong className="text-text-secondary">net</strong> (after taxes &amp; deductions) — from paystub net pay and transaction history.</p>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <LoadingSpinner size="lg" />
          </div>
        ) : data ? (
          <>
            {/* Summary cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <Card className="p-3">
                <p className="text-xs text-text-secondary">Total Income</p>
                <p className="text-lg font-bold text-primary">{formatCurrency(data.total_income)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-text-secondary">Total Spending</p>
                <p className="text-lg font-bold text-danger">{formatCurrency(data.total_expenses)}</p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-text-secondary">Net Savings</p>
                <p className={`text-lg font-bold ${(data.total_income - data.total_expenses) >= 0 ? 'text-primary' : 'text-danger'}`}>
                  {formatCurrency((data.total_income - data.total_expenses))}
                </p>
              </Card>
              <Card className="p-3">
                <p className="text-xs text-text-secondary">Ending Net Worth</p>
                <p className="text-lg font-bold text-info">{formatCurrency(data.ending_net_worth)}</p>
              </Card>
            </div>

            {/* Net Worth chart */}
            <NetWorthForecastChart points={data.points} showEvents={showEvents} />

            {/* Monthly Cash Flow */}
            <ForecastChart points={data.points} />

            {/* Account Balance Projections with compound interest */}
            <AccountForecastChart points={data.points} accountForecasts={data.account_forecasts ?? []} />

            {/* Category table */}
            <CategoryForecastTable points={data.points} />
          </>
        ) : (
          <div className="text-center py-16 text-text-secondary">
            <p>Failed to load forecast data. Is the API running?</p>
            <Button variant="primary" className="mt-4" onClick={load}>Retry</Button>
          </div>
        )}
      </div>
    </AppLayout>
  )
}
