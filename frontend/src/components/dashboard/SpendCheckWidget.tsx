'use client'

import { useState, useEffect } from 'react'
import { getBudgetSummary, getBudgetEstimates, getTransactions } from '@/lib/api'
import type { BudgetSummary, Transaction } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, X } from 'lucide-react'

// Fixed costs excluded from the discretionary spend signal
const EXCLUDED_NAMES = ['rent', 'mortgage', 'tax', 'taxes', 'medical', 'healthcare', 'car expense', 'car payment', 'auto', 'savings transfer']

function isExcluded(b: BudgetSummary) {
  if (b.kind === 'savings' || b.kind === 'transfer') return true
  if (EXCLUDED_NAMES.includes(b.category_name.toLowerCase().trim())) return true
  return false
}

type Status = 'green' | 'yellow' | 'red'

interface RowData {
  b: BudgetSummary
  benchmark: number
  hasBudget: boolean
  remaining: number
  overBudget: boolean
  projectedOver: boolean
  projectedTotal: number
  status: Status
  hint: string
}

// ── Per-category drill-down panel ─────────────────────────────────────────────

function CategoryDrillDown({
  row,
  onClose,
}: {
  row: RowData
  onClose: () => void
}) {
  const [txns, setTxns] = useState<Transaction[]>([])
  const [loading, setLoading] = useState(true)

  const today = new Date()
  const fromDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const toDate = today.toISOString().slice(0, 10)

  useEffect(() => {
    getTransactions({
      category_id: row.b.category_id,
      from_date: fromDate,
      to_date: toDate,
      limit: 50,
    })
      .then((res) => setTxns(res.items.filter((t) => t.amount < 0)))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [row.b.category_id])

  const pct = row.benchmark > 0 ? Math.min((row.b.actual_amount / row.benchmark) * 100, 100) : 0
  const barColor =
    row.status === 'red' ? 'bg-red-500' : row.status === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'

  return (
    <div className="mt-3 pt-3 border-t border-white/[0.08]">
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: row.b.color }} />
          <span className="text-sm font-semibold text-text-primary">{row.b.category_name}</span>
        </div>
        <button onClick={onClose} className="text-muted hover:text-text-primary">
          <X size={13} />
        </button>
      </div>

      {/* Spent vs benchmark bar */}
      <div className="mb-3">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-text-secondary">
            {formatCurrency(row.b.actual_amount)} spent
            {row.benchmark > 0 && (
              <span className="text-muted"> of {formatCurrency(row.benchmark)} {row.hasBudget ? 'budget' : 'avg'}</span>
            )}
          </span>
          {row.benchmark > 0 && (
            <span className={cn('font-semibold', row.status === 'red' ? 'text-red-400' : row.status === 'yellow' ? 'text-yellow-400' : 'text-green-400')}>
              {row.overBudget
                ? `${formatCurrency(Math.abs(row.remaining))} over`
                : `${formatCurrency(row.remaining)} left`}
            </span>
          )}
        </div>
        {row.benchmark > 0 && (
          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div className={cn('h-full rounded-full transition-all', barColor)} style={{ width: `${pct}%` }} />
          </div>
        )}
      </div>

      {/* Transactions */}
      {loading ? (
        <p className="text-xs text-muted py-2">Loading transactions...</p>
      ) : txns.length === 0 ? (
        <p className="text-xs text-muted py-2">No transactions this month yet.</p>
      ) : (
        <div className="flex flex-col gap-1 max-h-48 overflow-y-auto pr-1">
          {txns.map((t) => (
            <div key={t.id} className="flex items-center justify-between gap-2 py-1">
              <div className="flex-1 min-w-0">
                <p className="text-xs text-text-primary truncate">{t.description}</p>
                <p className="text-[11px] text-muted">{t.date}</p>
              </div>
              <span className="text-xs font-medium text-danger whitespace-nowrap">
                {formatCurrency(Math.abs(t.amount))}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function SpendCheckWidget() {
  const [all, setAll] = useState<BudgetSummary[]>([])
  const [estimates, setEstimates] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [expandedCatId, setExpandedCatId] = useState<number | null>(null)

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

    const hint = benchmark === 0
      ? `${formatCurrency(b.actual_amount)} spent`
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
    ? 'red' : rows.some((r) => r.status === 'yellow') ? 'yellow' : 'green'

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

  const dotColor = overallStatus === 'red' ? 'bg-red-500' : overallStatus === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'
  const borderColor = overallStatus === 'red' ? 'border-red-700/40' : overallStatus === 'yellow' ? 'border-yellow-600/30' : 'border-green-700/20'
  const bgColor = overallStatus === 'red' ? 'bg-red-900/15' : overallStatus === 'yellow' ? 'bg-yellow-900/10' : 'bg-green-900/10'

  return (
    <div className={cn('rounded-xl border', borderColor, bgColor)}>
      {/* Banner */}
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left"
        onClick={() => { setOpen((v) => !v); setExpandedCatId(null) }}
      >
        <span className="relative flex-shrink-0 w-3 h-3">
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
        <div className="px-4 pb-4 pt-3 border-t border-white/[0.06]">
          <p className="text-xs text-muted mb-2">Tap a category to see transactions. Rent &amp; fixed costs excluded.{rows.some(r => !r.hasBudget) ? ' * = using 3-mo avg.' : ''}</p>
          <div className="flex flex-col gap-1">
            {rows.map((row) => {
              const isExpanded = expandedCatId === row.b.category_id
              const rowDot = row.status === 'red' ? 'bg-red-500' : row.status === 'yellow' ? 'bg-yellow-400' : 'bg-green-500'
              const rowPill =
                row.status === 'red'
                  ? 'bg-red-500/20 text-red-400 border border-red-700/40'
                  : row.status === 'yellow'
                  ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-600/40'
                  : 'bg-green-500/20 text-green-400 border border-green-700/30'
              const pillLabel = row.status === 'red' ? 'Over' : row.status === 'yellow' ? 'Watch' : 'Good'

              return (
                <div key={row.b.category_id} className={cn('rounded-lg transition-colors', isExpanded ? 'bg-white/[0.04] px-3 py-2' : 'py-1')}>
                  <button
                    className="w-full flex items-center gap-2.5 text-left"
                    onClick={() => setExpandedCatId(isExpanded ? null : row.b.category_id)}
                  >
                    <span className={cn('w-2 h-2 rounded-full flex-shrink-0', rowDot)} />
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: row.b.color }} />
                    <span className="text-sm text-text-primary flex-1 min-w-0 truncate">
                      {row.b.category_name}{!row.hasBudget ? ' *' : ''}
                    </span>
                    <span className="text-xs text-muted hidden sm:block whitespace-nowrap">{row.hint}</span>
                    <span className={cn('text-xs font-medium px-2 py-0.5 rounded-full whitespace-nowrap flex-shrink-0', rowPill)}>
                      {pillLabel}
                    </span>
                    {isExpanded
                      ? <ChevronUp size={12} className="text-muted flex-shrink-0" />
                      : <ChevronDown size={12} className="text-muted flex-shrink-0" />}
                  </button>

                  {isExpanded && (
                    <CategoryDrillDown
                      row={row}
                      onClose={() => setExpandedCatId(null)}
                    />
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
