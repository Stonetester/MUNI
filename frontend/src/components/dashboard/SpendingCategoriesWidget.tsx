'use client'

import { useState, useEffect, useMemo } from 'react'
import { getBudgetSummary, getBudgetEstimates, updateCategory } from '@/lib/api'
import type { BudgetSummary } from '@/lib/types'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import {
  ChevronDown, ChevronUp, Sparkles, TrendingUp, AlertCircle,
  CheckCircle2, Clock, Info,
} from 'lucide-react'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'

// ── Helpers ───────────────────────────────────────────────────────────────────

function statusColor(pct: number, hasBudget: boolean) {
  if (!hasBudget) return 'text-text-secondary'
  if (pct >= 100) return 'text-red-400'
  if (pct >= 80) return 'text-yellow-400'
  return 'text-green-400'
}

function statusBg(pct: number, hasBudget: boolean) {
  if (!hasBudget) return 'bg-surface-2'
  if (pct >= 100) return 'bg-red-900/20'
  if (pct >= 80) return 'bg-yellow-900/20'
  return 'bg-green-900/20'
}

function statusBar(pct: number, hasBudget: boolean) {
  if (!hasBudget) return 'bg-text-secondary/30'
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-yellow-400'
  return 'bg-green-500'
}

function statusIcon(pct: number, hasBudget: boolean) {
  if (!hasBudget) return null
  if (pct >= 100) return <AlertCircle size={12} className="text-red-400 shrink-0" />
  if (pct >= 80) return <Clock size={12} className="text-yellow-400 shrink-0" />
  return <CheckCircle2 size={12} className="text-green-400 shrink-0" />
}

function paceLabel(pct: number, dayOfMonth: number, hasBudget: boolean): string {
  if (!hasBudget) return ''
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const expectedPct = (dayOfMonth / daysInMonth) * 100

  if (pct >= 100) return 'Over budget'
  if (pct >= 80 && dayOfMonth <= 10) return 'Heavy spend early — pace yourself'
  if (pct >= expectedPct * 1.3) return 'Spending ahead of pace'
  if (pct < expectedPct * 0.5 && dayOfMonth >= 20) return 'Well under budget'
  if (pct >= 80) return 'Close to limit'
  return 'On track'
}

function recommendation(
  cat: BudgetSummary,
  estimate: number | undefined,
  dayOfMonth: number,
): string | null {
  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate()
  const expectedPct = (dayOfMonth / daysInMonth) * 100
  const hasBudget = cat.budget_amount > 0
  const budget = hasBudget ? cat.budget_amount : (estimate ?? 0)
  if (!budget) return null

  const pct = (cat.actual_amount / budget) * 100

  if (dayOfMonth <= 10) {
    if (pct > 70) return `You've used ${pct.toFixed(0)}% of this budget with ${daysInMonth - dayOfMonth} days left. Hold off if possible.`
    if (pct > 40) return `Moderate spend early in the month — this category typically runs all month.`
    return null
  }

  if (dayOfMonth >= 20) {
    if (pct >= 100) return `Over budget. Avoid further spend here this month.`
    if (pct >= 85) return `Almost at the limit — ${formatCurrency(budget - cat.actual_amount)} left.`
    return null
  }

  if (pct >= expectedPct * 1.4) return `Spending ${Math.round(pct - expectedPct)}% ahead of monthly pace.`
  return null
}

// ── Row component ─────────────────────────────────────────────────────────────

function CategoryRow({
  cat,
  estimate,
  dayOfMonth,
  suggestedBudget,
  showRec,
}: {
  cat: BudgetSummary
  estimate?: number
  dayOfMonth: number
  suggestedBudget?: number
  showRec?: boolean
}) {
  const hasBudget = cat.budget_amount > 0
  const effectiveBudget = hasBudget ? cat.budget_amount : (suggestedBudget ?? 0)
  const pct = effectiveBudget > 0 ? Math.min((cat.actual_amount / effectiveBudget) * 100, 100) : 0
  const rec = showRec ? recommendation(cat, suggestedBudget, dayOfMonth) : null

  return (
    <div className={cn('rounded-xl p-3 flex flex-col gap-2', statusBg(pct, effectiveBudget > 0))}>
      <div className="flex items-center gap-2">
        {/* Color swatch from category */}
        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color || '#14D49E' }} />
        <span className="text-sm font-medium text-text-primary flex-1 truncate">{cat.category_name}</span>
        {statusIcon(pct, effectiveBudget > 0)}
        <span className={cn('text-xs font-semibold shrink-0', statusColor(pct, effectiveBudget > 0))}>
          {formatCurrency(cat.actual_amount)}
          {effectiveBudget > 0 && (
            <span className="text-muted font-normal"> / {formatCurrency(effectiveBudget)}</span>
          )}
        </span>
      </div>

      {/* Progress bar */}
      {effectiveBudget > 0 && (
        <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
          <div
            className={cn('h-full rounded-full transition-all', statusBar(pct, true))}
            style={{ width: `${Math.min(pct, 100)}%` }}
          />
        </div>
      )}

      {/* Suggested budget label */}
      {!hasBudget && suggestedBudget && (
        <p className="text-[11px] text-muted flex items-center gap-1">
          <Sparkles size={10} className="text-primary/60" />
          Suggested budget: {formatCurrency(suggestedBudget)}/mo (based on history)
        </p>
      )}

      {/* Recommendation */}
      {rec && (
        <p className="text-[11px] text-yellow-300/80 flex items-start gap-1">
          <Info size={10} className="mt-0.5 shrink-0" />
          {rec}
        </p>
      )}
    </div>
  )
}

// ── Full modal: all categories ordered by spend ──────────────────────────────

function AllCategoriesModal({
  isOpen,
  onClose,
  summary,
  estimates,
  dayOfMonth,
  onApplySuggested,
  applying,
}: {
  isOpen: boolean
  onClose: () => void
  summary: BudgetSummary[]
  estimates: Record<number, number>
  dayOfMonth: number
  onApplySuggested: () => void
  applying: boolean
}) {
  const unset = summary.filter(c => c.budget_amount === 0 && estimates[c.category_id])
  const sorted = [...summary].sort((a, b) => b.actual_amount - a.actual_amount)

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Spending This Month" size="lg">
      <div className="flex flex-col gap-3">

        {/* Apply suggested button */}
        {unset.length > 0 && (
          <div className="p-3 rounded-xl border border-primary/20 bg-primary/5 flex items-start gap-3">
            <Sparkles size={16} className="text-primary mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-text-primary">
                {unset.length} {unset.length === 1 ? 'category has' : 'categories have'} no budget set
              </p>
              <p className="text-xs text-text-secondary mt-0.5">
                Apply suggested amounts from your 3-month spending history?
              </p>
            </div>
            <Button
              variant="primary"
              onClick={onApplySuggested}
              loading={applying}
              className="text-xs px-3 py-1.5 shrink-0"
            >
              Apply All
            </Button>
          </div>
        )}

        {/* Category list */}
        <div className="flex flex-col gap-2 max-h-[60vh] overflow-y-auto pr-1">
          {sorted.map(cat => (
            <CategoryRow
              key={cat.category_id}
              cat={cat}
              estimate={estimates[cat.category_id]}
              suggestedBudget={estimates[cat.category_id]}
              dayOfMonth={dayOfMonth}
              showRec
            />
          ))}
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 pt-1 border-t border-border text-[11px] text-muted flex-wrap">
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Under 80%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-400" />80–99%</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" />Over budget</span>
          <span className="flex items-center gap-1"><Sparkles size={10} className="text-primary/60" />No budget set (suggested)</span>
        </div>
      </div>
    </Modal>
  )
}

// ── Main widget ───────────────────────────────────────────────────────────────

export default function SpendingCategoriesWidget() {
  const [summary, setSummary] = useState<BudgetSummary[]>([])
  const [estimates, setEstimates] = useState<Record<number, number>>({})
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [applying, setApplying] = useState(false)

  const dayOfMonth = new Date().getDate()

  useEffect(() => {
    let cancelled = false
    async function load() {
      try {
        const [s, e] = await Promise.all([
          getBudgetSummary(),
          getBudgetEstimates(3),
        ])
        if (cancelled) return
        setSummary(s)
        const estMap: Record<number, number> = {}
        for (const est of e) estMap[est.category_id] = est.avg_monthly
        setEstimates(estMap)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [])

  const topThree = useMemo(() => {
    // Sort by actual spend desc, prioritise over-budget items first
    return [...summary]
      .filter(c => c.actual_amount > 0)
      .sort((a, b) => {
        const aOverBudget = a.budget_amount > 0 && a.actual_amount >= a.budget_amount * 0.8
        const bOverBudget = b.budget_amount > 0 && b.actual_amount >= b.budget_amount * 0.8
        if (aOverBudget && !bOverBudget) return -1
        if (!aOverBudget && bOverBudget) return 1
        return b.actual_amount - a.actual_amount
      })
      .slice(0, 3)
  }, [summary])

  const overBudgetCount = summary.filter(c => c.budget_amount > 0 && c.actual_amount > c.budget_amount).length

  const handleApplySuggested = async () => {
    setApplying(true)
    try {
      const toUpdate = summary.filter(c => c.budget_amount === 0 && estimates[c.category_id])
      await Promise.all(
        toUpdate.map(c => updateCategory(c.category_id, { budget_amount: estimates[c.category_id] }))
      )
      // Reload
      const s = await getBudgetSummary()
      setSummary(s)
    } finally {
      setApplying(false)
    }
  }

  if (loading) return null

  const hasData = topThree.length > 0

  return (
    <>
      <Card
        title="Top Spending This Month"
        action={
          hasData ? (
            <button
              onClick={() => setModalOpen(true)}
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors"
            >
              See all <ChevronDown size={13} />
            </button>
          ) : undefined
        }
      >
        {!hasData ? (
          <p className="text-sm text-text-secondary py-2">No spending recorded this month yet.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {topThree.map(cat => (
              <CategoryRow
                key={cat.category_id}
                cat={cat}
                estimate={estimates[cat.category_id]}
                suggestedBudget={estimates[cat.category_id]}
                dayOfMonth={dayOfMonth}
                showRec
              />
            ))}

            {/* Summary footer */}
            <button
              onClick={() => setModalOpen(true)}
              className="mt-1 flex items-center justify-between text-xs text-text-secondary hover:text-text-primary transition-colors pt-2 border-t border-border"
            >
              <span>
                {summary.length} categories
                {overBudgetCount > 0 && (
                  <span className="ml-2 text-red-400 font-medium">
                    · {overBudgetCount} over budget
                  </span>
                )}
              </span>
              <span className="flex items-center gap-0.5 text-primary">
                View all <TrendingUp size={12} />
              </span>
            </button>
          </div>
        )}
      </Card>

      <AllCategoriesModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        summary={summary}
        estimates={estimates}
        dayOfMonth={dayOfMonth}
        onApplySuggested={handleApplySuggested}
        applying={applying}
      />
    </>
  )
}
