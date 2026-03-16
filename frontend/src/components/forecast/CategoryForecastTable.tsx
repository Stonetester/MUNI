'use client'

import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'

interface CategoryForecastTableProps {
  points: ForecastPoint[]
}

export default function CategoryForecastTable({ points }: CategoryForecastTableProps) {
  // Collect all category names
  const allCategories = Array.from(
    new Set(points.flatMap((p) => Object.keys(p.by_category || {})))
  ).sort()

  if (allCategories.length === 0) {
    return (
      <Card title="Category Spending Forecast">
        <p className="text-text-secondary text-sm text-center py-6">No category data available</p>
      </Card>
    )
  }

  const displayMonths = points.slice(0, 12)

  return (
    <Card title="Category Spending Forecast">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[#2d3748]">
              <th className="text-left py-2 px-2 text-text-secondary font-medium uppercase tracking-wider sticky left-0 bg-surface min-w-[120px]">
                Category
              </th>
              {displayMonths.map((p) => (
                <th key={p.month} className="text-right py-2 px-2 text-text-secondary font-medium whitespace-nowrap">
                  {formatMonth(p.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2d3748]">
            {allCategories.map((cat) => {
              const totals = displayMonths.map((p) => p.by_category?.[cat] || 0)
              const total = totals.reduce((s, v) => s + v, 0)
              if (total === 0) return null
              return (
                <tr key={cat} className="hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-2 text-text-primary font-medium sticky left-0 bg-surface">{cat}</td>
                  {totals.map((v, i) => (
                    <td key={i} className={`py-2 px-2 text-right ${v > 0 ? 'text-danger' : 'text-text-secondary'}`}>
                      {v !== 0 ? formatCurrency(Math.abs(v)) : '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="border-t-2 border-[#2d3748] font-semibold">
              <td className="py-2 px-2 text-text-primary sticky left-0 bg-surface">Total</td>
              {displayMonths.map((p) => {
                const total = Object.values(p.by_category || {}).reduce((s, v) => s + v, 0)
                return (
                  <td key={p.month} className="py-2 px-2 text-right text-danger">
                    {formatCurrency(Math.abs(total))}
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}
