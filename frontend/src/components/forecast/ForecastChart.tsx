'use client'

import { useState, useRef, useEffect } from 'react'
import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
import {
  ComposedChart,
  Bar,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  ReferenceLine,
  TooltipProps,
} from 'recharts'

interface ForecastChartProps {
  points: ForecastPoint[]
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  const income = payload.find((p) => p.dataKey === 'Income')
  const spending = payload.find((p) => p.dataKey === 'Spending')
  const net = payload.find((p) => p.dataKey === 'Net')
  return (
    <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl min-w-[160px]">
      <p className="text-text-secondary font-medium mb-2">{label}</p>
      {income && (
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-[#10B981]" />
          <span className="text-text-secondary">Income:</span>
          <span className="text-text-primary font-semibold ml-auto">{formatCurrency(income.value as number)}</span>
        </div>
      )}
      {spending && (
        <div className="flex items-center gap-2 mb-1">
          <div className="w-2 h-2 rounded-full bg-[#f87171]" />
          <span className="text-text-secondary">Spending:</span>
          <span className="text-text-primary font-semibold ml-auto">{formatCurrency(spending.value as number)}</span>
        </div>
      )}
      {net && (
        <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[#2d3748]">
          <div className="w-2 h-2 rounded-full bg-[#a78bfa]" />
          <span className="text-text-secondary">Net saved:</span>
          <span className={`font-semibold ml-auto ${(net.value as number) >= 0 ? 'text-[#a78bfa]' : 'text-danger'}`}>
            {(net.value as number) >= 0 ? '+' : ''}{formatCurrency(net.value as number)}
          </span>
        </div>
      )}
    </div>
  )
}

export default function ForecastChart({ points }: ForecastChartProps) {
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [barWidth, setBarWidth] = useState(50)
  const [chartHeight, setChartHeight] = useState(220)

  // Compute responsive bar size and chart height based on container width
  useEffect(() => {
    function measure() {
      const vw = window.innerWidth
      setBarWidth(vw < 480 ? 38 : vw < 768 ? 46 : 58)
      setChartHeight(vw < 480 ? 180 : vw < 768 ? 200 : 256)
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const currentMonth = new Date().toISOString().slice(0, 7)
  const currentIndex = points.findIndex((p) => p.month === currentMonth)

  const chartData = points.map((p) => ({
    month: formatMonth(p.month),
    rawMonth: p.month,
    Income: p.income,
    Spending: Math.abs(p.expenses),
    Net: p.net,
  }))

  // Auto-scroll to current month
  useEffect(() => {
    if (scrollRef.current && currentIndex >= 0) {
      const containerWidth = scrollRef.current.clientWidth
      const scrollTarget = currentIndex * barWidth - containerWidth / 2 + barWidth / 2
      scrollRef.current.scrollLeft = Math.max(0, scrollTarget)
    }
  }, [currentIndex, barWidth])

  const totalWidth = Math.max(chartData.length * barWidth, 300)

  function handleClick(data: { activePayload?: Array<{ payload: typeof chartData[0] }> }) {
    const item = data?.activePayload?.[0]?.payload
    if (!item) return
    const point = points.find((p) => p.month === item.rawMonth)
    if (point) setSelectedPoint(point)
  }

  return (
    <>
      <Card title="Monthly Cash Flow Forecast">
        <p className="text-muted mb-2 text-[10px] md:text-xs">
          <span className="md:hidden">Swipe to scroll · Purple = net · Tap month for details</span>
          <span className="hidden md:inline">Scroll ← → to see all months · Purple line = net saved · Click any month for details</span>
        </p>
        <div
          ref={scrollRef}
          className="overflow-x-auto -mx-4 md:-mx-5 px-4 md:px-5"
          style={{ WebkitOverflowScrolling: 'touch', scrollbarWidth: 'thin' }}
        >
          <div style={{ width: totalWidth, height: chartHeight }}>
            <ComposedChart
              width={totalWidth}
              height={chartHeight}
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
                tickFormatter={(v) => v >= 1000 || v <= -1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
                width={48}
              />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: '12px', color: '#94a3b8' }} />
              <ReferenceLine y={0} stroke="#4a5568" strokeDasharray="3 3" />
              {currentIndex >= 0 && (
                <ReferenceLine
                  x={chartData[currentIndex]?.month}
                  stroke="#60a5fa"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  label={{ value: 'Now', position: 'top', fill: '#60a5fa', fontSize: 10 }}
                />
              )}
              <Bar dataKey="Income" fill="#10B981" radius={[3, 3, 0, 0]} maxBarSize={22}>
                {chartData.map((_, i) => (
                  <Cell key={`income-${i}`} fillOpacity={i > currentIndex ? 0.38 : 1} />
                ))}
              </Bar>
              <Bar dataKey="Spending" fill="#f87171" radius={[3, 3, 0, 0]} maxBarSize={22}>
                {chartData.map((_, i) => (
                  <Cell key={`spending-${i}`} fillOpacity={i > currentIndex ? 0.38 : 1} />
                ))}
              </Bar>
              <Line
                dataKey="Net"
                stroke="#a78bfa"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: '#a78bfa' }}
                strokeOpacity={1}
              />
            </ComposedChart>
          </div>
        </div>
      </Card>
      {selectedPoint && <MonthDetailModal point={selectedPoint} onClose={() => setSelectedPoint(null)} />}
    </>
  )
}
