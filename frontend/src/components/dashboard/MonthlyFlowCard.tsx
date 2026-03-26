'use client'

import { useState, useRef, useEffect } from 'react'
import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
import { getForecast } from '@/lib/api'
import {
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  TooltipProps,
} from 'recharts'

interface MonthlyFlowCardProps {
  flowMonths: ForecastPoint[]
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

const BAR_WIDTH = 52  // px per month group

function shortMonth(yyyyMM: string): string {
  const [year, month] = yyyyMM.split('-')
  const d = new Date(parseInt(year), parseInt(month) - 1, 1)
  const abbr = d.toLocaleDateString('en-US', { month: 'short' })
  return parseInt(month) === 1 ? `${abbr} '${year.slice(2)}` : abbr
}

export default function MonthlyFlowCard({ flowMonths }: MonthlyFlowCardProps) {
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)

  const currentMonth = new Date().toISOString().slice(0, 7)

  const chartData = flowMonths.map((p) => ({
    month: shortMonth(p.month),
    rawMonth: p.month,
    Income: p.income,
    Spending: Math.abs(p.expenses),
    isCurrent: p.month === currentMonth,
  }))

  const currentIndex = chartData.findIndex((d) => d.rawMonth === currentMonth)

  // Auto-scroll so the current month bar is visible (centered-ish)
  useEffect(() => {
    if (scrollRef.current && currentIndex >= 0) {
      const containerWidth = scrollRef.current.clientWidth
      const scrollTarget = currentIndex * BAR_WIDTH - containerWidth / 2 + BAR_WIDTH / 2
      scrollRef.current.scrollLeft = Math.max(0, scrollTarget)
    }
  }, [currentIndex])

  function handleClick(data: { activePayload?: Array<{ payload: typeof chartData[0] }> }) {
    const item = data?.activePayload?.[0]?.payload
    if (!item) return
    const point = flowMonths.find((p) => p.month === item.rawMonth)
    if (point) setSelectedPoint(point)
  }

  const totalWidth = Math.max(chartData.length * BAR_WIDTH, 400)

  return (
    <>
      <Card title="Monthly Cash Flow" className="col-span-full md:col-span-2">
        <p className="text-xs text-muted mb-2">Scroll to see past months · Click any bar for details</p>
        <div
          ref={scrollRef}
          className="overflow-x-auto"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div style={{ width: totalWidth, height: 224 }}>
            <BarChart
              width={totalWidth}
              height={224}
              data={chartData}
              barGap={2}
              barCategoryGap="28%"
              onClick={handleClick}
              style={{ cursor: 'pointer' }}
            >
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
                width={46}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
              {currentIndex >= 0 && (
                <ReferenceLine
                  x={chartData[currentIndex]?.month}
                  stroke="#60a5fa"
                  strokeWidth={2}
                  strokeDasharray="4 3"
                  label={{ value: 'Now', position: 'top', fill: '#60a5fa', fontSize: 10 }}
                />
              )}
              <Bar dataKey="Income" fill="#10B981" radius={[4, 4, 0, 0]} maxBarSize={24}>
                {chartData.map((_, i) => (
                  <Cell key={`income-${i}`} fillOpacity={i > currentIndex ? 0.38 : 1} />
                ))}
              </Bar>
              <Bar dataKey="Spending" fill="#f87171" radius={[4, 4, 0, 0]} maxBarSize={24}>
                {chartData.map((_, i) => (
                  <Cell key={`spending-${i}`} fillOpacity={i > currentIndex ? 0.38 : 1} />
                ))}
              </Bar>
            </BarChart>
          </div>
        </div>
      </Card>
      {selectedPoint && <MonthDetailModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />}
    </>
  )
}
