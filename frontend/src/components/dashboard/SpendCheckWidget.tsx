'use client'

import { useState, useEffect } from 'react'
import { getBudgetSummary, getBudgetEstimates } from '@/lib/api'
import type { BudgetSummary } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'

// Fixed costs excluded from the discretionary spend signal
const EXCLUDED_NAMES = ['rent', 'mortgage']

function isExcluded(b: BudgetSummary) {
  if (b.kind === 'savings' || b.kind === 'transfer') return true
  if (EXCLUDED_NAMES.includes(b.category_name.toLowerCase())) return true
  return false
}

type Status = 'green' | 'yellow' | 'red'

interface RowData {
  b: BudgetSummary
  benchmark: number       // budget if set, else 3-mo historical avg
  hasBudget: boolean
  remaining: number
  overBudget: boolean
  projectedOver: boolean
  projectedTotal: number
  status: Status
  hint: string
}

export default function SpendCheckWidget() {
  const [all, setAll] = useState<BudgetSummary[]>([])
  const [estimates, setEstimates] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    Promise.all([getBudgetSummary(), getBudgetEstimates()])
      .then(([summary, ests]) => {
        setAll(summary)
        const map: Record<number, number> = {}
        for (const e of ests) map[e.category_id] = e.avg_monthly
        setEstimates(map)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  if (loading) return null

  const dayOfMonth = new Date().getDate()
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const daysLeft = daysInMonth - dayOfMonth

  // Discretionary: expense kind, not excluded, has either actual spend or a benchmark
  const discretionary = all.filter((b) => {
    if (b.kind !== 'expense') return false
    if (isExcluded(b)) return false
    const benchmark = b.budget_amount > 0 ? b.budget_amount : (estimates[b.category_id] ?? 0)
    return benchmark > 0 || b.actual_amount > 0
  })

  if (discretionary.length === 0) return null

  const rows: RowData[] = discretionary.map((b) => {
    const hasBudget = b.budget_amount > 0
    const benchmark = hasBudget ? b.budget_amount : (estimates[b.category_id] ?? 0)

    const dailyRate = dayOfMonth > 0 ? b.actual_amount / dayOfMonth : 0
    const projectedTotal = dailyRate * daysInMonth
    const remaining = benchmark > 0 ? benchmark - b.actual_amount : 0
    const overBudget = benchmark > 0 && remaining < 0
    const projectedOver = !overBudget && benchmark > 0 && projectedTotal > benchmark * 1.05

    let status: Status = 'green'
    if (overBudget) status = 'red'
    else if (projectedOver) status = 'yellow'
    // No benchmark = no signal, leave green

    const hint = benchmark === 0
      ? `${formatCurrency(b.actual_amount)} spent (no budget set)`
      : overBudget
      ? `${formatCurrency(Math.abs(remaining))} over ${hasBudget ? 'budget' : 'avg'}`
      : projectedOver
      ? `On pace for ${formatCurrency(Math.round(projectedTotal))} — ${formatCurrency(Math.round(projectedTotal - benchmark))} over`
      : `${formatCurrency(Math.round(remaining))} left`

    return { b, benchmark, hasBudget, remaining, overBudget, projectedOver, projectedTotal, status, hint }
  }).sort((a, b) => {
    const rank = { red: 0, yellow: 1, green: 2 }
    if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status]
    return b.b.actual_amount - a.b.actual_amount
  })

  const overallStatus: Status = rows.some((r) => r.status === 'red')
    ? 'red'
    : rows.some((r) => r.status === 'yellow')
    ? 'yellow'
    : 'green'

  const redRows = rows.filter((r) => r.status === 'red')
  const yellowRows = rows.filter((r) => r.status === 'yellow')

  const statusLabel =
    overallStatus === 'red'
      ? redRows.length === 1
        ? `Overspent on ${redRows[0].b.category_name} — hold off`
        : `Overspent in ${redRows.length} categories — hold off`
      : overallStatus === 'yellow'
      ? yellowRows.length === 1
        ? `${yellowRows[0].b.category_name} is running hot — slow down`
        : `${yellowRows.length} categories running hot — slow down`
      : "You're on track — spending looks good this month"

  const dotColor =
    overallStatus === 'red' ? 'bg-red-500' : overallStatus === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'

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
      {/* Banner — always visible */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="relative flex-shrink-0 w-3 h-3">
          <span className={cn('w-3 h-3 rounded-full block', dotColor)} />
          {overallStatus !== 'green' && (
            <span className={cn('absolute inset-0 rounded-full animate-ping opacity-60', dotColor)} />
          )}
        </span>
        <span className="text-sm font-medium text-text-primary flex-1">{statusLabel}</span>
        <span className="text-xs text-muted whitespace-nowrap">{daysLeft}d left</span>
        {open
          ? <ChevronUp size={14} className="text-muted flex-shrink-0" />
          : <ChevronDown size={14} className="text-muted flex-shrink-0" />}
      </button>

      {/* Expandable breakdown */}
      {open && (
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.06] flex flex-col gap-2">
          <p className="text-xs text-muted mb-1">Rent &amp; savings transfers excluded. * = no budget set, using 3-mo avg.</p>
          {rows.map(({ b, status, hint, hasBudget }) => {
            const rowDot =
              status === 'red' ? 'bg-red-500' : status === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'
            const rowPill =
              status === 'red'
                ? 'bg-red-500/20 text-red-400 border border-red-700/40'
                : status === 'yellow'
                ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-600/40'
                : 'bg-green-500/20 text-green-400 border border-green-700/30'
            const pillLabel = status === 'red' ? 'Over' : status === 'yellow' ? 'Watch' : 'Good'

            return (
              <div key={b.category_id} className="flex items-center gap-2.5">
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', rowDot)} />
                <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: b.color }} />
                <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                  {b.category_name}{!hasBudget ? ' *' : ''}
                </span>
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
