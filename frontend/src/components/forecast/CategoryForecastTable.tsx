'use client'

import { ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'

interface CategoryForecastTableProps {
  points: ForecastPoint[]
}

export default function CategoryForecastTable({ points }: CategoryForecastTableProps) {
  const allCategories = Array.from(
    new Set(points.flatMap((p) => Object.keys(p.by_category || {})))
  ).sort()

  if (allCategories.length === 0) {
    return (
      <Card title="Projected Monthly Spending by Category">
        <p className="text-text-secondary text-sm text-center py-6">No category data available</p>
      </Card>
    )
  }

  const displayMonths = points.slice(0, 12)

  // Only show spending categories (negative total = expense outflows)
  const spendingCategories = allCategories.filter((cat) => {
    const totals = displayMonths.map((p) => p.by_category?.[cat] || 0)
    const total = totals.reduce((s, v) => s + v, 0)
    return total < 0
  })

  if (spendingCategories.length === 0) {
    return (
      <Card title="Projected Monthly Spending by Category">
        <p className="text-text-secondary text-sm text-center py-6">No spending categories found</p>
      </Card>
    )
  }

  return (
    <Card title="Projected Monthly Spending by Category">
      <p className="text-xs text-muted mb-3">Based on your recurring rules and historical spending averages. Income categories excluded.</p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left py-2 px-2 text-text-secondary font-medium uppercase tracking-wider sticky left-0 bg-surface min-w-[120px]">
                Category
              </th>
              <th className="text-right py-2 px-2 text-text-secondary font-medium whitespace-nowrap bg-surface-2/50 border-l border-white/[0.06]">
                Avg/Mo
              </th>
              {displayMonths.map((p) => (
                <th key={p.month} className="text-right py-2 px-2 text-text-secondary font-medium whitespace-nowrap">
                  {formatMonth(p.month)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {spendingCategories.map((cat) => {
              const totals = displayMonths.map((p) => p.by_category?.[cat] || 0)
              const nonZero = totals.filter((v) => v !== 0)
              const avg = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0
              return (
                <tr key={cat} className="hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-2 text-text-primary font-medium sticky left-0 bg-surface">{cat}</td>
                  <td className="py-2 px-2 text-right text-warning font-semibold bg-surface-2/50 border-l border-white/[0.06]">
                    {formatCurrency(Math.abs(avg))}
                  </td>
                  {totals.map((v, i) => (
                    <td key={i} className={`py-2 px-2 text-right ${v < 0 ? 'text-danger' : 'text-text-secondary'}`}>
                      {v !== 0 ? formatCurrency(Math.abs(v)) : '—'}
                    </td>
                  ))}
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="border-t-2 border-white/10 font-semibold">
              <td className="py-2 px-2 text-text-primary sticky left-0 bg-surface">Total</td>
              <td className="py-2 px-2 text-right text-warning bg-surface-2/50 border-l border-white/[0.06]">
                {formatCurrency(Math.abs(
                  spendingCategories.reduce((catSum, cat) => {
                    const totals = displayMonths.map((p) => p.by_category?.[cat] || 0)
                    const nonZero = totals.filter((v) => v !== 0)
                    return catSum + (nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0)
                  }, 0)
                ))}
              </td>
              {displayMonths.map((p) => {
                const total = spendingCategories.reduce((s, cat) => s + (p.by_category?.[cat] || 0), 0)
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
