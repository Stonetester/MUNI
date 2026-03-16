'use client'

import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  TooltipProps,
} from 'recharts'

interface ForecastPreviewChartProps {
  forecastPreview: ForecastPoint[]
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    const main = payload.find((p) => p.name === 'net_worth')
    const low = payload.find((p) => p.name === 'low_net_worth')
    const high = payload.find((p) => p.name === 'high_net_worth')
    return (
      <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl">
        <p className="text-text-secondary font-medium mb-1">{label}</p>
        {main && <p className="text-info font-semibold">Expected: {formatCurrency(main.value as number)}</p>}
        {high && <p className="text-text-secondary">High: {formatCurrency(high.value as number)}</p>}
        {low && <p className="text-text-secondary">Low: {formatCurrency(low.value as number)}</p>}
      </div>
    )
  }
  return null
}

export default function ForecastPreviewChart({ forecastPreview }: ForecastPreviewChartProps) {
  const chartData = forecastPreview.slice(0, 6).map((p) => ({
    month: formatMonth(p.month),
    net_worth: p.net_worth,
    low_net_worth: p.low_cash,
    high_net_worth: p.high_cash,
  }))

  return (
    <Card title="Net Worth Forecast (6 months)" className="col-span-full md:col-span-1">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData}>
            <defs>
              <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
              width={50}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="high_net_worth"
              stroke="none"
              fill="url(#rangeGrad)"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="low_net_worth"
              stroke="none"
              fill="#0f1117"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="net_worth"
              stroke="#3b82f6"
              strokeWidth={2}
              fill="url(#netWorthGrad)"
              dot={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
