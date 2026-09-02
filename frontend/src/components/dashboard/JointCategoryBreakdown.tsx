'use client'

import Card from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'

const COLORS = ['#10B981', '#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

export default function JointCategoryBreakdown({ byCategory }: { byCategory: Record<string, number> }) {
  const categories = Object.entries(byCategory)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
  const largest = categories[0]?.[1] || 1
  const total = categories.reduce((sum, [, amount]) => sum + amount, 0)

  return (
    <Card title="Joint Spending by Category" action={<span className="text-sm font-bold text-text-primary">{formatCurrency(total)}</span>}>
      {categories.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-text-secondary">No spending in this month</div>
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map(([name, amount], index) => (
            <div key={name}>
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-text-secondary">{name}</span>
                <span className="shrink-0 font-semibold text-text-primary">{formatCurrency(amount)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(2, (amount / largest) * 100)}%`, backgroundColor: COLORS[index % COLORS.length] }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
