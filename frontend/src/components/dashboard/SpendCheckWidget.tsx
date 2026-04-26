'use client'

import { useState, useEffect } from 'react'
import { getBudgetSummary } from '@/lib/api'
import type { BudgetSummary } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Excluded from the spend signal — fixed costs the user can't control day-to-day
const EXCLUDED_NAMES = ['rent', 'mortgage']

function isExcluded(b: BudgetSummary) {
  if (b.kind === 'savings' || b.kind === 'transfer') return true
  if (EXCLUDED_NAMES.includes(b.category_name.toLowerCase())) return true
  return false
}

type Status = 'green' | 'yellow' | 'red'

interface RowData {
  b: BudgetSummary
  remaining: number
  overBudget: boolean
  projectedOver: boolean
  projectedTotal: number
  status: Status
  hint: string
}

export default function SpendCheckWidget() {
  const [all, setAll] = useState<BudgetSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    getBudgetSummary()
      .then((data) => setAll(data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  const dayOfMonth = new Date().getDate()
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - dayOfMonth

  // Only discretionary expense categories with a budget set
  const discretionary = all.filter((b) => b.kind === 'expense' && b.budget_amount > 0 && !isExcluded(b))

  if (discretionary.length === 0) return null

  const rows: RowData[] = discretionary.map((b) => {
    const dailyRate = dayOfMonth > 0 ? b.actual_amount / dayOfMonth : 0
    const projectedTotal = dailyRate * daysInMonth
    const remaining = b.budget_amount - b.actual_amount
    const overBudget = remaining < 0
    // Projected over = currently within budget but daily pace will exceed it by >5%
    const projectedOver = !overBudget && projectedTotal > b.budget_amount * 1.05

    let status: Status = 'green'
    if (overBudget) status = 'red'
    else if (projectedOver) status = 'yellow'

    const hint = overBudget
      ? `${formatCurrency(Math.abs(remaining))} over budget`
      : projectedOver
      ? `On pace for ${formatCurrency(Math.round(projectedTotal))} — ${formatCurrency(Math.round(projectedTotal - b.budget_amount))} over`
      : `${formatCurrency(Math.round(remaining))} left`

    return { b, remaining, overBudget, projectedOver, projectedTotal, status, hint }
  }).sort((a, b) => {
    const rank = { red: 0, yellow: 1, green: 2 }
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    return b.b.actual_amount - a.b.actual_amount
  })

  // Overall status = worst category
  const overallStatus: Status = rows.some((r) => r.status === 'red')
    ? 'red'
    : rows.some((r) => r.status === 'yellow')
    ? 'yellow'
    : 'green'

  const redCount = rows.filter((r) => r.status === 'red').length
  const yellowCount = rows.filter((r) => r.status === 'yellow').length

  const statusLabel =
    overallStatus === 'red'
      ? redCount === 1
        ? `Overspent in ${rows.find((r) => r.status === 'red')!.b.category_name} — hold off`
        : `Overspent in ${redCount} categories — hold off`
      : overallStatus === 'yellow'
      ? yellowCount === 1
        ? `${rows.find((r) => r.status === 'yellow')!.b.category_name} is running hot — slow down`
        : `${yellowCount} categories running hot — slow down`
      : "You're on track — spending looks good this month"

  const dotColor =
    overallStatus === 'red'
      ? 'bg-red-500'
      : overallStatus === 'yellow'
      ? 'bg-yellow-400'
      : 'bg-green-500'

  const borderColor =
    overallStatus === 'red'
      ? 'border-red-700/40'
      : overallStatus === 'yellow'
      ? 'border-yellow-600/30'
      : 'border-green-700/20'

  const bgColor =
    overallStatus === 'red'
      ? 'bg-red-900/15'
      : overallStatus === 'yellow'
      ? 'bg-yellow-900/10'
      : 'bg-green-900/10'

  return (
    <div className={cn('rounded-xl border', borderColor, bgColor)}>
      {/* Banner row — always visible */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        {/* Pulsing status dot */}
        <span className="relative flex-shrink-0">
          <span className={cn('w-3 h-3 rounded-full block', dotColor)} />
          {overallStatus !== 'green' && (
            <span className={cn('absolute inset-0 rounded-full animate-ping opacity-60', dotColor)} />
          )}
        </span>

        <span className="text-sm font-medium text-text-primary flex-1">{statusLabel}</span>

        <span className="text-xs text-muted whitespace-nowrap">{daysLeft}d left</span>
        {open ? <ChevronUp size={14} className="text-muted flex-shrink-0" /> : <ChevronDown size={14} className="text-muted flex-shrink-0" />}
      </button>

      {/* Expandable breakdown */}
      {open && (
        <div className="px-4 pb-4 flex flex-col gap-2 border-t border-white/[0.06] pt-3">
          <p className="text-xs text-muted mb-1">Discretionary spending only — rent &amp; savings transfers excluded.</p>
          {rows.map(({ b, status, hint }) => {
            const rowDot = status === 'red' ? 'bg-red-500' : status === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'
            const rowPill =
              status === 'red'
                ? 'bg-red-500/20 text-red-400 border border-red-700/40'
                : status === 'yellow'
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-600/40'
                : 'bg-green-500/20 text-green-400 border border-green-700/30'
            const pillLabel = status === 'red' ? 'Over' : status === 'yellow' ? 'Watch' : 'Good'

            return (
              <div key={b.category_id} className="flex items-center gap-3">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', rowDot)} />
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-sm text-text-primary flex-1 min-w-0 truncate">{b.category_name}</span>
                <span className="text-xs text-muted hidden sm:block whitespace-nowrap">{hint}</span>
                <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0', rowPill)}>
                  {pillLabel}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
