'use client'

import { useState } from 'react'
import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import MonthDetailModal from '@/components/ui/MonthDetailModal'
import InfoTooltip from '@/components/ui/InfoTooltip'
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea,
  TooltipProps,
} from 'recharts'

interface NetWorthForecastChartProps {
  points: ForecastPoint[]
  showEvents?: boolean
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    const expected = payload.find((p) => p.dataKey === 'net_worth')
    const high = payload.find((p) => p.dataKey === 'band_width')
    const low = payload.find((p) => p.dataKey === 'band_base')
    const nwHigh = high && low ? (low.value as number) + (high.value as number) : null
    const nwLow = low ? (low.value as number) : null
    return (
      <div className="bg-surface border border-white/10 rounded-xl p-3 text-xs shadow-xl min-w-[190px]">
        <p className="text-text-secondary font-medium mb-2">{label}</p>
        {expected && <p className="text-info font-bold text-sm">Expected: {formatCurrency(expected.value as number)}</p>}
        {nwHigh !== null && <p className="text-muted">Optimistic: {formatCurrency(nwHigh)}</p>}
        {nwLow !== null && <p className="text-muted">Conservative: {formatCurrency(nwLow)}</p>}
      </div>
    )
  }
  return null
}

export default function NetWorthForecastChart({ points, showEvents = true }: NetWorthForecastChartProps) {
  const [selectedPoint, setSelectedPoint] = useState<ForecastPoint | null>(null)
  const currentMonth = new Date().toISOString().slice(0, 7)

  const chartData = points.map((p) => {
    // Center the variance band symmetrically around net_worth
    const cashVariance = Math.abs(p.high_cash - p.low_cash) / 2
    const nwLow = p.net_worth - cashVariance
    const nwHigh = p.net_worth + cashVariance
    return {
      month: formatMonth(p.month),
      rawMonth: p.month,
      net_worth: p.net_worth,
      band_base: nwLow,
      band_width: nwHigh - nwLow,
      hasEvent: p.event_impact !== 0,
    }
  })

  const currentIndex = chartData.findIndex((d) => d.rawMonth === currentMonth)
  const futureStartLabel = currentIndex >= 0 ? chartData[currentIndex + 1]?.month : chartData[0]?.month
  const lastLabel = chartData[chartData.length - 1]?.month

  const allValues = chartData.flatMap((d) => [d.net_worth, d.band_base, d.band_base + d.band_width])
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
      <Card title="Net Worth Projection" action={
        <InfoTooltip
          title="How this forecast works"
          content={
            <div className="flex flex-col gap-2">
              <p><strong className="text-text-primary">Expected line:</strong> Your projected net worth using average recurring income, expenses, and compound growth on investments.</p>
              <p><strong className="text-text-primary">Confidence band:</strong> ±variance centered on the expected line, based on your historical spending variability. Wider band = more month-to-month variation in your past spending.</p>
              <p><strong className="text-text-primary">Net worth</strong> = all asset balances (checking, savings, investments) minus liabilities (loans, credit cards).</p>
              <p className="text-muted">Investments grow using compound interest with your configured return rates. Dimmed area = future predictions.</p>
            </div>
          }
        />
      }>
        <p className="text-xs text-muted mb-2">Click any month for details</p>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chartData} onClick={handleClick} style={{ cursor: 'pointer' }}>
              <defs>
                <linearGradient id="bandFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.20} />
                  <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.05} />
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
              {currentIndex >= 0 && (
                <ReferenceLine
                  x={chartData[currentIndex]?.month}
                  stroke="#60a5fa"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  label={{ value: 'Now', position: 'top', fill: '#60a5fa', fontSize: 10 }}
                />
              )}
              {/* Stacked band: transparent base + visible amber band on top */}
              <Area
                type="monotone"
                dataKey="band_base"
                stackId="band"
                stroke="none"
                fill="transparent"
                legendType="none"
                isAnimationActive={false}
              />
              <Area
                type="monotone"
                dataKey="band_width"
                stackId="band"
                stroke="#f59e0b"
                strokeWidth={0.5}
                strokeDasharray="3 3"
                fill="url(#bandFill)"
                legendType="none"
                isAnimationActive={false}
              />
              {/* Future dimming overlay */}
              {futureStartLabel && lastLabel && (
                <ReferenceArea
                  x1={futureStartLabel}
                  x2={lastLabel}
                  fill="#141824"
                  fillOpacity={0.35}
                  stroke="none"
                  isFront={false}
                />
              )}
              {/* Expected net worth line on top */}
              <Line
                type="monotone"
                dataKey="net_worth"
                stroke="#3b82f6"
                strokeWidth={2.5}
                dot={(props) => {
                  const { cx, cy, payload } = props as { cx: number; cy: number; payload: { hasEvent: boolean } }
                  if (showEvents && payload.hasEvent) {
                    return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={5} fill="#f59e0b" stroke="#141824" strokeWidth={2} />
                  }
                  return <g key={`dot-${cx}-${cy}`} />
                }}
                activeDot={{ r: 4, fill: '#3b82f6' }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center gap-4 mt-3 text-xs text-text-secondary">
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-0.5 bg-info rounded" />
            <span>Expected</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-6 h-3 rounded" style={{ background: 'rgba(245,158,11,0.18)', border: '1px dashed rgba(245,158,11,0.5)' }} />
            <span>Variance band</span>
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
