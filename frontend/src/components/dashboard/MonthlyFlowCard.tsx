'use client'

import { useState, useEffect, useRef } from 'react'
import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
import { getForecast } from '@/lib/api'
import {
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
  forecastPreview?: ForecastPoint[]
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

const BAR_GROUP_WIDTH = 80 // px per month group

export default function MonthlyFlowCard({ forecastPreview }: MonthlyFlowCardProps) {
  const [allPoints, setAllPoints] = useState<ForecastPoint[]>([])
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const [loading, setLoading] = useState(true)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getForecast(undefined, 6, 12)
      .then((res) => setAllPoints(res.points))
      .catch(() => {
        // fallback to prop data if fetch fails
        if (forecastPreview) setAllPoints(forecastPreview)
      })
      .finally(() => setLoading(false))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Sort chronologically
  const sorted = [...allPoints].sort((a, b) => a.month.localeCompare(b.month))

  const chartData = sorted.map((p) => ({
    month: formatMonth(p.month),
    Income: p.income,
    Spending: p.expenses,
    _point: p,
  }))

  // Scroll to end (most recent) on initial load
  useEffect(() => {
    if (!loading && scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth
    }
  }, [loading])

  function handleClick(data: { activeLabel?: string }) {
    const label = data?.activeLabel
    if (!label) return
    const entry = chartData.find((d) => d.month === label)
    if (entry) setSelectedPoint(entry._point)
  }

  const chartWidth = Math.max(chartData.length * BAR_GROUP_WIDTH, 400)

  return (
    <>
      <Card title="Monthly Cash Flow" className="col-span-full md:col-span-2">
        <p className="text-xs text-muted mb-2">Scroll to see past months · Click any bar for details</p>
        {loading ? (
          <div className="h-56 flex items-center justify-center text-text-secondary text-sm">Loading…</div>
        ) : (
          <div ref={scrollRef} className="overflow-x-auto" style={{ cursor: 'grab' }}>
            <div style={{ width: chartWidth, height: 224 }}>
              <BarChart
                width={chartWidth}
                height={224}
                data={chartData}
                barGap={4}
                barCategoryGap="30%"
                onClick={handleClick}
                style={{ cursor: 'pointer' }}
              >
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
            </div>
          </div>
        )}
      </Card>
      {selectedPoint && <MonthDetailModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />}
    </>
  )
}
