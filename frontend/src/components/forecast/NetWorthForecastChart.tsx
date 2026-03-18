'use client'

import { useState } from 'react'
import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  TooltipProps,
} from 'recharts'

interface NetWorthForecastChartProps {
  points: ForecastPoint[]
  showEvents?: boolean
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    const expected = payload.find((p) => p.dataKey === 'net_worth')
    const low = payload.find((p) => p.dataKey === 'low_cash')
    const high = payload.find((p) => p.dataKey === 'high_cash')
    return (
      <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl min-w-[180px]">
        <p className="text-text-secondary font-medium mb-2">{label}</p>
        {expected && <p className="text-info font-bold text-sm">Expected: {formatCurrency(expected.value as number)}</p>}
        {high && <p className="text-text-secondary">High: {formatCurrency(high.value as number)}</p>}
        {low && <p className="text-text-secondary">Low: {formatCurrency(low.value as number)}</p>}
      </div>
    )
  }
  return null
}

export default function NetWorthForecastChart({ points, showEvents = true }: NetWorthForecastChartProps) {
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const chartData = points.map((p) => ({
    month: formatMonth(p.month),
    net_worth: p.net_worth,
    low_cash: p.low_cash,
    high_cash: p.high_cash,
    hasEvent: p.event_impact !== 0,
    eventTotal: p.event_impact,
  }))

  const allValues = chartData.flatMap((d) => [d.net_worth, d.low_cash, d.high_cash])
  const minVal = Math.min(...allValues)
  const maxVal = Math.max(...allValues)
  const padding = (maxVal - minVal) * 0.1 || 10000

  function handleClick(data: { activeLabel?: string }) {
    const label = data?.activeLabel
    if (!label) return
    const point = points.find((p) => formatMonth(p.month) === label)
    if (point) setSelectedPoint(point)
  }

  return (
    <>
    <Card title="Net Worth Projection">
      <p className="text-xs text-muted mb-2">Click any month for details</p>
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }}>
            <defs>
              <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="bandGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.08} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
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
              width={55}
              domain={[minVal - padding, maxVal + padding]}
            />
            <Tooltip content={<CustomTooltip />} />
            {minVal < 0 && <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="4 4" />}
            <Area
              type="monotone"
              dataKey="high_cash"
              stroke="none"
              fill="url(#bandGrad)"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="low_cash"
              stroke="none"
              fill="#0f1117"
              legendType="none"
            />
            <Area
              type="monotone"
              dataKey="net_worth"
              stroke="#3b82f6"
              strokeWidth={2.5}
              fill="url(#nwGrad)"
              dot={(props) => {
                const { cx, cy, payload } = props as { cx: number; cy: number; payload: { hasEvent: boolean } }
                if (showEvents && payload.hasEvent) {
                  return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill="#f59e0b" stroke="#1a1f2e" strokeWidth={2} />
                }
                return <g key={`dot-${cx}-${cy}`} />
              }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center gap-4 mt-3 text-xs text-text-secondary">
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-0.5 bg-info rounded" />
          <span>Expected</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-3 h-2 bg-info/10 rounded" />
          <span>Low/High range</span>
        </div>
        {showEvents && (
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 bg-warning rounded-full" />
            <span>Life event</span>
          </div>
        )}
      </div>
    </Card>
    {selectedPoint && <MonthDetailModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />}
    </>
  )
}
