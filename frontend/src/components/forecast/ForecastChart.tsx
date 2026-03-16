'use client'

import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  TooltipProps,
} from 'recharts'

interface ForecastChartProps {
  points: ForecastPoint[]
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl min-w-[160px]">
        <p className="text-text-secondary font-medium mb-2">{label}</p>
        {payload.map((entry) => (
          <div key={entry.name} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-text-secondary capitalize">{entry.name}:</span>
            <span className="text-text-primary font-semibold">{formatCurrency(entry.value as number)}</span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

export default function ForecastChart({ points }: ForecastChartProps) {
  const chartData = points.map((p) => ({
    month: formatMonth(p.month),
    Income: p.income,
    Spending: p.expenses,
    Savings: p.net,
  }))

  return (
    <Card title="Monthly Cash Flow Forecast">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2} barCategoryGap="25%">
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#94a3b8', fontSize: 10 }}
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
            <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
            <Bar dataKey="Income" fill="#10B981" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Spending" fill="#f87171" radius={[3, 3, 0, 0]} />
            <Bar dataKey="Savings" fill="#14b8a6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
