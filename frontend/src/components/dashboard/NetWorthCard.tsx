'use client'

import { DashboardData, ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import { TrendingUp, TrendingDown } from 'lucide-react'
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
      <div className="bg-surface border border-[#2d3748] rounded-lg px-3 py-2 text-xs">
        <p className="text-text-secondary">{label}</p>
        <p className="text-primary font-semibold">{formatCurrency(payload[0].value as number)}</p>
      </div>
    )
  }
  return null
}

export default function NetWorthCard({ data }: NetWorthCardProps) {
  const { net_worth, forecast_preview } = data
  const { viewMode } = useViewMode()

  // Build sparkline from last 6 forecast preview points (reversed so oldest first)
  const sparklineData = forecast_preview
    .slice(0, 6)
    .map((p: ForecastPoint) => ({
      period: formatMonth(p.month),
      net_worth: p.net_worth,
    }))

  const prevNetWorth = sparklineData.length > 1 ? sparklineData[sparklineData.length - 2]?.net_worth ?? net_worth : net_worth
  const change = net_worth - prevNetWorth
  const changePercent = prevNetWorth !== 0 ? (change / Math.abs(prevNetWorth)) * 100 : 0
  const isPositive = change >= 0

  return (
    <Card className="col-span-full">
      <div className="flex flex-col sm:flex-row sm:items-center gap-4">
        <div className="flex-1">
          <p className="text-sm text-text-secondary font-medium mb-1">{viewMode === 'joint' ? 'Our Net Worth' : 'My Net Worth'}</p>
          <p className="text-4xl md:text-5xl font-bold text-text-primary">
            {formatCurrency(net_worth)}
          </p>
          <div className={`flex items-center gap-1.5 mt-2 ${isPositive ? 'text-primary' : 'text-danger'}`}>
            {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
            <span className="text-sm font-medium">
              {isPositive ? '+' : ''}{formatCurrency(change)} ({changePercent.toFixed(1)}%) from last month
            </span>
          </div>
        </div>
        {sparklineData.length > 1 && (
          <div className="w-full sm:w-48 h-16">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparklineData}>
                <Line
                  type="monotone"
                  dataKey="net_worth"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                />
                <Tooltip content={<CustomTooltip />} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </Card>
  )
}
