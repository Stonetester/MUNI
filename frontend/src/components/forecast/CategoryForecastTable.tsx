'use client'

import { ForecastPoint } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
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
    const total = displayMonths.reduce((s, p) => s + (p.by_category?.[cat] || 0), 0)
    return total < 0
  })

  if (spendingCategories.length === 0) {
    return (
      <Card title="Projected Monthly Spending by Category">
        <p className="text-text-secondary text-sm text-center py-6">No spending categories found</p>
      </Card>
    )
  }

  // Per-category: compute avg/mo and annual total
  // Some categories may vary month-to-month (recurring rules with start/end dates),
  // so we average over displayMonths rather than just taking month 0.
  const rows = spendingCategories.map((cat) => {
    const monthlyAmounts = displayMonths.map((p) => Math.abs(p.by_category?.[cat] || 0))
    const nonZero = monthlyAmounts.filter((v) => v > 0)
    const avgPerMonth = nonZero.length > 0 ? nonZero.reduce((s, v) => s + v, 0) / nonZero.length : 0
    const annualTotal = monthlyAmounts.reduce((s, v) => s + v, 0)
    // Detect if this category actually varies across months
    const min = Math.min(...monthlyAmounts.filter((v) => v > 0))
    const max = Math.max(...monthlyAmounts)
    const varies = nonZero.length > 1 && max - min > 1
    return { cat, avgPerMonth, annualTotal, varies, monthlyAmounts }
  }).sort((a, b) => b.avgPerMonth - a.avgPerMonth)

  const totalAvg = rows.reduce((s, r) => s + r.avgPerMonth, 0)
  const totalAnnual = rows.reduce((s, r) => s + r.annualTotal, 0)
  const anyVaries = rows.some((r) => r.varies)

  return (
    <Card title="Projected Monthly Spending by Category">
      <p className="text-xs text-muted mb-3">
        Based on your weighted 3/6/12-month spending history. Income categories excluded.
        {anyVaries && ' * indicates amount varies by month due to recurring rules.'}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-white/[0.06]">
              <th className="text-left py-2 px-2 text-text-secondary font-medium uppercase tracking-wider sticky left-0 bg-surface min-w-[140px]">
                Category
              </th>
              <th className="text-right py-2 px-2 text-text-secondary font-medium whitespace-nowrap bg-surface-2/50 border-l border-white/[0.06]">
                Avg / Mo
              </th>
              <th className="text-right py-2 px-2 text-text-secondary font-medium whitespace-nowrap">
                {displayMonths.length === 12 ? 'Annual Total' : `${displayMonths.length}-Mo Total`}
              </th>
              <th className="text-right py-2 px-2 text-text-secondary font-medium whitespace-nowrap">
                % of Budget
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.04]">
            {rows.map(({ cat, avgPerMonth, annualTotal, varies }) => {
              const sharePct = totalAvg > 0 ? (avgPerMonth / totalAvg) * 100 : 0
              return (
                <tr key={cat} className="hover:bg-surface-2 transition-colors">
                  <td className="py-2 px-2 text-text-primary font-medium sticky left-0 bg-surface">
                    {cat}{varies ? ' *' : ''}
                  </td>
                  <td className="py-2 px-2 text-right text-warning font-semibold bg-surface-2/50 border-l border-white/[0.06]">
                    {formatCurrency(avgPerMonth)}
                  </td>
                  <td className="py-2 px-2 text-right text-danger">
                    {formatCurrency(annualTotal)}
                  </td>
                  <td className="py-2 px-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-warning/60 rounded-full"
                          style={{ width: `${Math.min(sharePct, 100)}%` }}
                        />
                      </div>
                      <span className="text-muted w-8 text-right">{sharePct.toFixed(0)}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            {/* Total row */}
            <tr className="border-t-2 border-white/10 font-semibold">
              <td className="py-2 px-2 text-text-primary sticky left-0 bg-surface">Total</td>
              <td className="py-2 px-2 text-right text-warning bg-surface-2/50 border-l border-white/[0.06]">
                {formatCurrency(totalAvg)}
              </td>
              <td className="py-2 px-2 text-right text-danger">
                {formatCurrency(totalAnnual)}
              </td>
              <td className="py-2 px-2 text-right text-muted">100%</td>
            </tr>
          </tbody>
        </table>
      </div>
    </Card>
  )
}
