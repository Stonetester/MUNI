'use client'

import { useState, useEffect } from 'react'
import { getBudgetSummary } from '@/lib/api'
import type { BudgetSummary } from '@/lib/types'
import Card from '@/components/ui/Card'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

export default function SpendCheckWidget() {
  const [items, setItems] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getBudgetSummary()
      .then((data) => setItems(data.filter((b) => b.kind === 'expense' && b.budget_amount > 0)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading || items.length === 0) return null

  const dayOfMonth = new Date().getDate()
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - dayOfMonth

  const rows = items.map((b) => {
    const dailyRate = dayOfMonth > 0 ? b.actual_amount / dayOfMonth : 0
    const projectedTotal = dailyRate * daysInMonth
    const remaining = b.budget_amount - b.actual_amount
    const overBudget = remaining < 0
    const projectedOver = !overBudget && projectedTotal > b.budget_amount * 1.05
    const canSpend = !overBudget && !projectedOver
    return { b, remaining, overBudget, projectedOver, canSpend, projectedTotal }
  }).sort((a, b) => {
    if (a.overBudget && !b.overBudget) return -1
    if (!a.overBudget && b.overBudget) return 1
    if (a.projectedOver && !b.projectedOver) return -1
    if (!a.projectedOver && b.projectedOver) return 1
    return b.b.actual_amount - a.b.actual_amount
  })

  return (
    <Card
      title="Spend Check"
      action={<span className="text-xs text-muted">{daysLeft} days left this month</span>}
    >
      <p className="text-xs text-muted mb-3">Based on your budget goals — should you spend more this month?</p>
      <div className="flex flex-col gap-2">
        {rows.map(({ b, remaining, overBudget, projectedOver, canSpend, projectedTotal }) => {
          const bgColor = overBudget
            ? 'bg-red-900/20 border-red-700/30'
            : projectedOver
            ? 'bg-yellow-900/15 border-yellow-700/30'
            : 'bg-green-900/15 border-green-700/20'
          const pillColor = overBudget
            ? 'bg-red-500 text-white'
            : projectedOver
            ? 'bg-yellow-400 text-black'
            : 'bg-green-500 text-white'
          const pillLabel = overBudget ? 'Hold off' : projectedOver ? 'Watch it' : 'OK to spend'
          const hint = overBudget
            ? `${formatCurrency(Math.abs(remaining))} over budget`
            : projectedOver
            ? `On pace for ${formatCurrency(projectedTotal)} — ${formatCurrency(projectedTotal - b.budget_amount)} over`
            : `${formatCurrency(remaining)} left`

          return (
            <div key={b.category_id} className={cn('flex items-center gap-3 rounded-xl border px-3 py-2.5', bgColor)}>
              <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
              <span className="text-sm font-medium text-text-primary flex-1 min-w-0 truncate">{b.category_name}</span>
              <span className="text-xs text-muted whitespace-nowrap hidden sm:block">{hint}</span>
              <span className={cn('text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0', pillColor)}>
                {pillLabel}
              </span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
