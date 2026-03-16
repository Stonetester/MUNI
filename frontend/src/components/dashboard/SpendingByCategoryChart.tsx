'use client'

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

function CustomTooltip({ active, payload }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl">
        <p className="text-text-primary font-medium">{payload[0].name}</p>
        <p className="text-primary font-semibold">{formatCurrency(payload[0].value as number)}</p>
      </div>
    )
  }
  return null
}

export default function SpendingByCategoryChart({ byCategory }: SpendingByCategoryChartProps) {
  const data = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, value]) => ({ name, value }))

  if (data.length === 0) {
    return (
      <Card title="Spending by Category" className="col-span-full md:col-span-1">
        <div className="h-48 flex items-center justify-center text-text-secondary text-sm">
          No spending data this month
        </div>
      </Card>
    )
  }

  return (
    <Card title="Spending by Category" className="col-span-full md:col-span-1">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="45%"
              innerRadius={55}
              outerRadius={90}
              paddingAngle={2}
              dataKey="value"
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
