'use client'

import { useState } from 'react'
import { DashboardData, ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from 'lucide-react'
import { useViewMode } from '@/lib/viewMode'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  TooltipProps,
} from 'recharts'

interface NetWorthCardProps {
  data: DashboardData
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-xs">
        <p className="text-text-secondary">{label}</p>
        <p className="text-primary font-semibold">{formatCurrency(payload[0].value as number)}</p>
      </div>
    )
  }
  return null
}

export default function NetWorthCard({ data }: NetWorthCardProps) {
  const { mode } = useViewMode()
  const [expanded, setExpanded] = useState(false)
  const { net_worth, forecast_preview, total_assets, total_liabilities } = data

  const sparklineData = forecast_preview
    .slice(0, 6)
    .map((p: ForecastPoint) => ({
      period: formatMonth(p.month),
      net_worth: p.net_worth,
    }))

  // Compare current net worth against the next forecasted month to show expected change
  const nextForecast = sparklineData.length > 0 ? sparklineData[0]?.net_worth ?? net_worth : net_worth
  const change = nextForecast - net_worth
  const changePercent = net_worth !== 0 ? (change / Math.abs(net_worth)) * 100 : 0
  const isPositive = change >= 0

  const title = mode === 'joint' ? 'Our Net Worth' : 'My Net Worth'

  return (
    <Card className="col-span-full">
      {/* Clickable header row */}
      <button
        className="w-full text-left"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary font-medium mb-1">{title}</p>
              <span className="text-muted sm:hidden">
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </div>
            <p className="text-4xl md:text-5xl font-display text-text-primary tracking-tight">
              {formatCurrency(net_worth)}
            </p>
            <div className={`flex items-center gap-1.5 mt-2 ${isPositive ? 'text-primary' : 'text-danger'}`}>
              {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
              <span className="text-sm font-medium">
                {isPositive ? '+' : ''}{formatCurrency(change)} ({changePercent.toFixed(1)}%) projected next month
              </span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {sparklineData.length > 1 && (
              <div className="w-full sm:w-48 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparklineData}>
                    <Line
                      type="monotone"
                      dataKey="net_worth"
                      stroke="#14D49E"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Tooltip content={<CustomTooltip />} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <span className="hidden sm:block text-muted flex-shrink-0">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </div>
        </div>
      </button>

      {/* Expanded breakdown */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1">Total Assets</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(total_assets)}</p>
            <p className="text-xs text-muted mt-1">Checking, savings, investments</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1">Total Liabilities</p>
            <p className="text-lg font-bold text-danger">{formatCurrency(total_liabilities)}</p>
            <p className="text-xs text-muted mt-1">Loans, credit cards</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1">Net Worth Trend</p>
            <p className={`text-lg font-bold ${isPositive ? 'text-primary' : 'text-danger'}`}>
              {isPositive ? '+' : ''}{formatCurrency(change)}
            </p>
            <p className="text-xs text-muted mt-1">projected next month ({changePercent.toFixed(1)}%)</p>
          </div>
        </div>
      )}
    </Card>
  )
}
