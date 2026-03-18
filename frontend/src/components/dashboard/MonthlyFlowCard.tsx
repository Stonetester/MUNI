'use client'

import { useState } from 'react'
import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
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

interface MonthlyFlowCardProps {
  forecastPreview: ForecastPoint[]
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl">
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

export default function MonthlyFlowCard({ forecastPreview }: MonthlyFlowCardProps) {
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const points = forecastPreview.slice(0, 6)
  const chartData = points.map((p) => ({
    month: formatMonth(p.month),
    Income: p.income,
    Spending: p.expenses,
  }))

  function handleClick(data: { activeLabel?: string }) {
    const label = data?.activeLabel
    if (!label) return
    const point = points.find((p) => formatMonth(p.month) === label)
    if (point) setSelectedPoint(point)
  }

  return (
    <>
      <Card title="Monthly Cash Flow" className="col-span-full md:col-span-2">
        <p className="text-xs text-muted mb-2">Click any month for details</p>
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} barGap={4} barCategoryGap="30%" onClick={handleClick} style={{ cursor: 'pointer' }}>
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
              <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
              <Bar dataKey="Income" fill="#10B981" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Spending" fill="#f87171" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
      {selectedPoint && <MonthDetailModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />}
    </>
  )
}
