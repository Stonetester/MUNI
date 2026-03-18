'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'
import Card from '@/components/ui/Card'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  TooltipProps,
} from 'recharts'

interface SpendingByCategoryChartProps {
  byCategory: Record<string, number>
}

const COLORS = [
  '#10B981', '#14b8a6', '#3b82f6', '#8b5cf6',
  '#f59e0b', '#ef4444', '#ec4899', '#06b6d4',
  '#84cc16', '#f97316',
]

type LabelMode = 'hover' | 'amount' | 'percent'

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    const total = payload[0].payload?.total ?? 1
    const value = payload[0].value as number
    return (
      <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl">
        <p className="text-text-primary font-medium">{payload[0].name}</p>
        <p className="text-primary font-semibold">{formatCurrency(value)}</p>
        <p className="text-muted">{((value / total) * 100).toFixed(1)}%</p>
      </div>
    )
  }
  return null
}

function renderCustomLabel({
  cx, cy, midAngle, innerRadius, outerRadius, name, value, total, mode,
}: {
  cx: number; cy: number; midAngle: number; innerRadius: number; outerRadius: number
  name: string; value: number; total: number; mode: LabelMode
}) {
  if (mode === 'hover') return null
  const RADIAN = Math.PI / 180
  const radius = outerRadius + 24
  const x = cx + radius * Math.cos(-midAngle * RADIAN)
  const y = cy + radius * Math.sin(-midAngle * RADIAN)
  const pct = ((value / total) * 100).toFixed(0)
  const label = mode === 'amount' ? formatCurrency(value) : `${pct}%`
  return (
    <text x={x} y={y} fill="#94a3b8" textAnchor={x > cx ? 'start' : 'end'} dominantBaseline="central" fontSize={10}>
      {label}
    </text>
  )
}

export default function SpendingByCategoryChart({ byCategory }: SpendingByCategoryChartProps) {
  const [labelMode, setLabelMode] = useState<LabelMode>('hover')

  const raw = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const total = raw.reduce((s, [, v]) => s + v, 0)
  const data = raw.map(([name, value]) => ({ name, value, total }))

  if (data.length === 0) {
    return (
      <Card title="Spending by Category" className="col-span-full md:col-span-1">
        <div className="h-48 flex items-center justify-center text-text-secondary text-sm">
          No spending data this month
        </div>
      </Card>
    )
  }

  const modes: { key: LabelMode; label: string }[] = [
    { key: 'hover', label: 'Hover' },
    { key: 'amount', label: '$' },
    { key: 'percent', label: '%' },
  ]

  return (
    <Card
      title="Spending by Category"
      className="col-span-full md:col-span-1"
      action={
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
          {modes.map(m => (
            <button
              key={m.key}
              onClick={() => setLabelMode(m.key)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                labelMode === m.key
                  ? 'bg-primary text-white'
                  : 'text-text-secondary hover:text-text-primary'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>
      }
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={50}
              outerRadius={80}
              paddingAngle={2}
              dataKey="value"
              label={labelMode !== 'hover' ? (props) => renderCustomLabel({ ...props, mode: labelMode }) : false}
              labelLine={labelMode !== 'hover'}
            >
              {data.map((_, index) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend
              wrapperStyle={{ fontSize: '11px', color: '#94a3b8' }}
              formatter={(value) => <span className="text-text-secondary text-xs">{value}</span>}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
