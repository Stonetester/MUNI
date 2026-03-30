'use client'

import { useState, useEffect, useMemo } from 'react'
import { bulkSaveEventLineItems } from '@/lib/api'
import { LifeEvent, EventLineItem } from '@/lib/types'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Plus, Trash2, ChevronRight, ChevronDown, Check, CalendarDays, X, TrendingDown,
} from 'lucide-react'

// ── Categories & starter data ─────────────────────────────────────────────────

const WEDDING_CATEGORIES = [
  'Pre-Wedding',
  'Gifts',
  'Venue & Ceremony',
  'Catering',
  'Florals & Decor',
  'Photography',
  'Attire & Beauty',
  'Entertainment',
  'Stationery',
  'Other',
  'Honeymoon',
]

const STARTER_ITEMS: Omit<EventLineItem, 'id' | 'event_id'>[] = [
  { name: 'Engagement Party', category: 'Pre-Wedding', estimated_cost: 700, sort_order: 0 },
  { name: 'Bachelorette / Bachelor Party', category: 'Pre-Wedding', estimated_cost: 1000, sort_order: 1 },
  { name: 'Bridal Shower', category: 'Pre-Wedding', estimated_cost: 0, sort_order: 2 },
  { name: 'Groomsmen Gifts', category: 'Gifts', estimated_cost: 500, sort_order: 10 },
  { name: 'Bridesmaids / MOB Gifts', category: 'Gifts', estimated_cost: 500, sort_order: 11 },
  { name: 'Guest Book', category: 'Gifts', estimated_cost: 0, sort_order: 12 },
  { name: 'Venue', category: 'Venue & Ceremony', estimated_cost: 2000, sort_order: 20 },
  { name: 'Church', category: 'Venue & Ceremony', estimated_cost: 2000, sort_order: 21 },
  { name: 'Transportation', category: 'Venue & Ceremony', estimated_cost: 2000, sort_order: 22 },
  { name: 'Hotel Room', category: 'Venue & Ceremony', estimated_cost: 300, sort_order: 23 },
  { name: 'Add-Ons (extra time, etc.)', category: 'Venue & Ceremony', estimated_cost: 1800, sort_order: 24 },
  { name: 'Reception Catering', category: 'Catering', estimated_cost: 27000, sort_order: 30 },
  { name: 'Rehearsal Catering', category: 'Catering', estimated_cost: 2000, sort_order: 31 },
  { name: 'Brunch Catering', category: 'Catering', estimated_cost: 0, sort_order: 32 },
  { name: 'Weekend Alcohol', category: 'Catering', estimated_cost: 0, sort_order: 33 },
  { name: 'Florals', category: 'Florals & Decor', estimated_cost: 3000, sort_order: 40 },
  { name: 'Decor (signs, centerpieces, seating chart)', category: 'Florals & Decor', estimated_cost: 500, sort_order: 41 },
  { name: 'Photographer', category: 'Photography', estimated_cost: 6000, sort_order: 50 },
  { name: 'Bridal Outfits & Honeymoon Outfits', category: 'Attire & Beauty', estimated_cost: 500, sort_order: 60 },
  { name: 'Attire – Groom', category: 'Attire & Beauty', estimated_cost: 500, sort_order: 61 },
  { name: 'Hair & Makeup', category: 'Attire & Beauty', estimated_cost: 300, sort_order: 62 },
  { name: 'DJ / Entertainment', category: 'Entertainment', estimated_cost: 2000, sort_order: 70 },
  { name: 'Wedding Coordinator', category: 'Entertainment', estimated_cost: 0, sort_order: 71 },
  { name: 'Invitations', category: 'Stationery', estimated_cost: 300, sort_order: 80 },
  { name: 'Save the Dates', category: 'Stationery', estimated_cost: 200, sort_order: 81 },
  { name: 'Program Printing', category: 'Stationery', estimated_cost: 50, sort_order: 82 },
  { name: 'Miscellaneous', category: 'Other', estimated_cost: 800, sort_order: 90 },
  { name: 'Wedding Insurance', category: 'Other', estimated_cost: 200, sort_order: 91 },
  { name: 'Honeymoon', category: 'Honeymoon', estimated_cost: 6000, sort_order: 100 },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function monthsBetween(from: Date, to: Date) {
  return Math.max(
    0,
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()),
  )
}

// ── Item card ─────────────────────────────────────────────────────────────────

type DraftItem = Omit<EventLineItem, 'id' | 'event_id'>

interface CardProps {
  item: DraftItem
  index: number
  onChange: (index: number, field: keyof DraftItem, value: string | number | undefined) => void
  onDelete: (index: number) => void
}

function ItemCard({ item, index, onChange, onDelete }: CardProps) {
  const paid = item.actual_cost ?? 0
  const est = item.estimated_cost || 0
  const remaining = est - paid
  const pct = est > 0 ? Math.min(100, (paid / est) * 100) : 0
  const isDone = est > 0 && remaining <= 0

  return (
    <div className={cn(
      'rounded-xl border p-3 flex flex-col gap-2.5',
      isDone ? 'border-primary/30 bg-primary/5' : 'border-border/50 bg-surface-2/30',
    )}>
      {/* Name + delete */}
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-transparent text-sm font-medium text-text-primary focus:outline-none placeholder:text-muted/50 min-w-0 py-0.5"
          value={item.name}
          onChange={e => onChange(index, 'name', e.target.value)}
          placeholder="Item name"
        />
        {isDone && <Check size={14} className="text-primary shrink-0" />}
        <button
          onClick={() => onDelete(index)}
          className="p-2 rounded-lg text-muted hover:text-danger hover:bg-danger/10 active:bg-danger/20 transition-colors shrink-0"
        >
          <Trash2 size={15} />
        </button>
      </div>

      {/* Estimated / Paid / Remaining */}
      <div className="grid grid-cols-3 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted font-medium uppercase tracking-wide">Estimated</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">$</span>
            <input
              type="number"
              min="0"
              step="50"
              inputMode="decimal"
              className="w-full bg-surface border border-border/60 text-sm text-right focus:outline-none focus:border-primary/60 rounded-lg pl-5 pr-2 py-2"
              value={est || ''}
              onChange={e => onChange(index, 'estimated_cost', parseFloat(e.target.value) || 0)}
            />
          </div>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[10px] text-muted font-medium uppercase tracking-wide">Paid</span>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">$</span>
            <input
              type="number"
              min="0"
              step="50"
              inputMode="decimal"
              className="w-full bg-surface border border-border/60 text-sm text-right focus:outline-none focus:border-primary/60 rounded-lg pl-5 pr-2 py-2"
              value={item.actual_cost ?? ''}
              placeholder="0"
              onChange={e => {
                const v = e.target.value === '' ? undefined : parseFloat(e.target.value) || 0
                onChange(index, 'actual_cost', v)
              }}
            />
          </div>
        </label>
        <div className="flex flex-col gap-1">
          <span className="text-[10px] text-muted font-medium uppercase tracking-wide">Left</span>
          <div className="flex items-center h-[38px]">
            <span className={cn('text-sm font-bold', isDone ? 'text-primary' : est > 0 ? 'text-warning' : 'text-muted')}>
              {isDone ? '✓ Paid' : est > 0 ? formatCurrency(remaining) : '—'}
            </span>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {est > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', isDone ? 'bg-primary' : 'bg-warning')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted w-8 text-right shrink-0">{pct.toFixed(0)}%</span>
        </div>
      )}

      {/* Notes */}
      <input
        className="w-full bg-transparent text-xs text-muted focus:outline-none border-b border-transparent focus:border-border/50 pb-0.5 placeholder:text-muted/40 transition-colors"
        value={item.notes ?? ''}
        onChange={e => onChange(index, 'notes', e.target.value)}
        placeholder="Notes (use YYYY-MM to schedule a payment)"
      />
    </div>
  )
}

// ── Category section header ───────────────────────────────────────────────────

function CategorySection({
  name, estimated, actual, collapsed, onToggle, onAddItem, children,
}: {
  name: string
  estimated: number
  actual: number
  collapsed: boolean
  onToggle: () => void
  onAddItem: () => void
  children?: React.ReactNode
}) {
  const remaining = estimated - actual
  const pct = estimated > 0 ? Math.min(100, (actual / estimated) * 100) : 0
  const isDone = estimated > 0 && remaining <= 0

  return (
    <div className={cn(
      'rounded-xl overflow-hidden border',
      collapsed ? 'border-border/40' : 'border-primary/20',
    )}>
      {/* Header tap area */}
      <button
        onClick={onToggle}
        className={cn(
          'w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors',
          collapsed ? 'bg-surface-2/80 hover:bg-surface-2' : 'bg-primary/10',
        )}
      >
        {/* Chevron */}
        <span className="shrink-0 text-text-secondary">
          {collapsed
            ? <ChevronRight size={18} />
            : <ChevronDown size={18} className="text-primary" />}
        </span>

        {/* Name + stats */}
        <div className="flex-1 min-w-0">
          <p className={cn(
            'text-sm font-semibold truncate',
            collapsed ? 'text-text-primary' : 'text-primary',
          )}>
            {name}
          </p>
          {collapsed ? (
            <p className="text-xs text-muted mt-0.5">
              {formatCurrency(estimated)}
              {actual > 0 && <span className="text-primary"> · {formatCurrency(actual)} paid</span>}
              {remaining > 0 && estimated > 0 && <span className="text-warning"> · {formatCurrency(remaining)} left</span>}
            </p>
          ) : (
            estimated > 0 && (
              <div className="flex items-center gap-2 mt-1">
                <div className="flex-1 h-1 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={cn('h-full rounded-full', isDone ? 'bg-primary' : 'bg-warning')}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-[10px] text-muted shrink-0">{formatCurrency(remaining)} left</span>
              </div>
            )
          )}
        </div>

        {/* Right: amount badge */}
        <span className={cn(
          'shrink-0 text-sm font-bold',
          isDone ? 'text-primary' : 'text-text-primary',
        )}>
          {formatCurrency(estimated)}
        </span>
      </button>

      {/* Expanded content */}
      {!collapsed && (
        <div className="flex flex-col gap-2 p-3 pt-2">
          {children}
          <button
            onClick={onAddItem}
            className="w-full py-2.5 rounded-xl border border-dashed border-primary/30 text-xs text-primary/70 hover:text-primary hover:border-primary/60 hover:bg-primary/5 active:bg-primary/10 transition-colors flex items-center justify-center gap-1.5"
          >
            <Plus size={13} /> Add item to {name}
          </button>
        </div>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

interface WeddingBreakdownProps {
  event: LifeEvent
  isOpen: boolean
  onClose: () => void
  onSaved: (updatedItems: EventLineItem[]) => void
}

export default function WeddingBreakdown({ event, isOpen, onClose, onSaved }: WeddingBreakdownProps) {
  const [items, setItems] = useState<DraftItem[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Lock body scroll when open
  useEffect(() => {
    if (isOpen) document.body.style.overflow = 'hidden'
    else document.body.style.overflow = ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Esc to close
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    if (event.line_items && event.line_items.length > 0) {
      setItems(event.line_items.map(({ id, event_id, ...rest }) => rest))
    } else {
      setItems(STARTER_ITEMS)
    }
    setDirty(false)
  }, [isOpen, event.line_items])

  const grouped = useMemo(() => {
    const map: Record<string, DraftItem[]> = {}
    for (const item of items) {
      const cat = item.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push(item)
    }
    const order = WEDDING_CATEGORIES
    return order
      .filter(c => map[c])
      .map(c => ({ category: c, items: map[c] }))
      .concat(Object.keys(map).filter(c => !order.includes(c)).map(c => ({ category: c, items: map[c] })))
  }, [items])

  // ── Totals ──────────────────────────────────────────────────────────────────
  const totalEstimated = items.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const totalPaid = items.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const totalRemaining = totalEstimated - totalPaid
  const overallPct = totalEstimated > 0 ? Math.min(100, (totalPaid / totalEstimated) * 100) : 0

  const today = new Date()
  const weddingDate = event.end_date ? new Date(event.end_date) : new Date(event.start_date)
  const monthsLeft = monthsBetween(today, weddingDate)
  const monthlySavingsNeeded = monthsLeft > 0 ? totalRemaining / monthsLeft : totalRemaining

  // ── Mutations ────────────────────────────────────────────────────────────────
  function handleChange(index: number, field: keyof DraftItem, value: string | number | undefined) {
    setItems(prev => { const next = [...prev]; next[index] = { ...next[index], [field]: value }; return next })
    setDirty(true)
  }

  function handleDelete(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  function handleAddItem(category: string) {
    const maxOrder = items.filter(i => i.category === category).reduce((m, i) => Math.max(m, i.sort_order), 0)
    setItems(prev => [...prev, { name: '', category, estimated_cost: 0, actual_cost: undefined, notes: undefined, sort_order: maxOrder + 1 }])
    setCollapsed(prev => { const next = new Set(prev); next.delete(category); return next })
    setDirty(true)
  }

  function handleAddCategory() {
    const name = prompt('New category name:')
    if (!name) return
    setItems(prev => [...prev, { name: 'New item', category: name, estimated_cost: 0, actual_cost: undefined, notes: undefined, sort_order: 0 }])
    setDirty(true)
  }

  async function handleSave() {
    setSaving(true)
    try {
      const saved = await bulkSaveEventLineItems(event.id, items)
      onSaved(saved)
      setDirty(false)
    } finally {
      setSaving(false)
    }
  }

  function globalIndex(category: string, localIndex: number) {
    let count = 0
    for (let i = 0; i < items.length; i++) {
      if (items[i].category === category || (!items[i].category && category === 'Other')) {
        if (count === localIndex) return i
        count++
      }
    }
    return -1
  }

  const monthlyView = useMemo(() => {
    const map: Record<string, number> = {}
    for (const item of items) {
      const match = item.notes?.match(/^(\d{4}-\d{2})/)
      if (match) map[match[1]] = (map[match[1]] || 0) + (item.estimated_cost || 0)
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface">
      {/* ── Sticky header ── */}
      <div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border bg-surface-2/80 backdrop-blur-sm">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-text-primary truncate">{event.name}</h2>
          <p className="text-xs text-muted">Budget Breakdown</p>
        </div>
        <button
          onClick={onClose}
          className="ml-3 shrink-0 w-9 h-9 flex items-center justify-center rounded-full bg-surface border border-border text-text-secondary hover:text-text-primary hover:bg-surface-2 active:scale-95 transition-all"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* ── Scrollable body ── */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-3 py-4 flex flex-col gap-4">

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-2 rounded-xl p-3">
              <p className="text-[11px] text-muted mb-0.5">Total Budget</p>
              <p className="text-lg font-bold text-text-primary">{formatCurrency(totalEstimated)}</p>
            </div>
            <div className="bg-surface-2 rounded-xl p-3">
              <p className="text-[11px] text-muted mb-0.5">Paid So Far</p>
              <p className="text-lg font-bold text-primary">{formatCurrency(totalPaid)}</p>
            </div>
            <div className="bg-surface-2 rounded-xl p-3">
              <p className="text-[11px] text-muted mb-0.5">Still Owed</p>
              <p className={cn('text-lg font-bold', totalRemaining > 0 ? 'text-warning' : 'text-primary')}>
                {formatCurrency(totalRemaining)}
              </p>
            </div>
            <div className="bg-surface-2 rounded-xl p-3">
              <p className="text-[11px] text-muted mb-0.5 flex items-center gap-1">
                <CalendarDays size={10} />
                {monthsLeft > 0 ? `${monthsLeft} months left` : 'Date passed'}
              </p>
              <p className="text-lg font-bold text-text-primary">
                {monthsLeft > 0 ? `${formatCurrency(monthlySavingsNeeded)}/mo` : '—'}
              </p>
            </div>
          </div>

          {/* Overall progress */}
          <div className="bg-surface-2 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-text-secondary font-medium">Overall Progress</span>
              <span className="text-xs text-muted">{overallPct.toFixed(1)}% paid</span>
            </div>
            <div className="h-3 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${overallPct}%` }}
              />
            </div>
            <p className="text-xs text-muted mt-1.5">{formatCurrency(totalPaid)} of {formatCurrency(totalEstimated)}</p>
          </div>

          {/* Category sections */}
          <div className="flex flex-col gap-3">
            {grouped.map(({ category, items: catItems }) => {
              const catEst = catItems.reduce((s, i) => s + (i.estimated_cost || 0), 0)
              const catPaid = catItems.reduce((s, i) => s + (i.actual_cost || 0), 0)
              const isCollapsed = collapsed.has(category)
              return (
                <CategorySection
                  key={category}
                  name={category}
                  estimated={catEst}
                  actual={catPaid}
                  collapsed={isCollapsed}
                  onToggle={() => setCollapsed(prev => {
                    const next = new Set(prev)
                    next.has(category) ? next.delete(category) : next.add(category)
                    return next
                  })}
                  onAddItem={() => handleAddItem(category)}
                >
                  {catItems.map((item, localIdx) => {
                    const gi = globalIndex(category, localIdx)
                    return (
                      <ItemCard
                        key={`${category}-${localIdx}`}
                        item={item}
                        index={gi}
                        onChange={handleChange}
                        onDelete={handleDelete}
                      />
                    )
                  })}
                </CategorySection>
              )
            })}
          </div>

          {/* Add category */}
          <button
            onClick={handleAddCategory}
            className="w-full py-3 rounded-xl border border-dashed border-border text-sm text-muted hover:text-text-primary hover:border-primary/40 hover:bg-primary/5 active:bg-primary/10 transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={14} /> Add new category
          </button>

          {/* Scheduled payments */}
          {monthlyView.length > 0 && (
            <div className="border border-border/40 rounded-xl p-4">
              <p className="text-xs font-semibold text-text-secondary mb-3 flex items-center gap-1.5">
                <TrendingDown size={13} /> Scheduled Payments
              </p>
              <div className="flex flex-wrap gap-2">
                {monthlyView.map(([month, amount]) => (
                  <div key={month} className="bg-surface-2 rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-muted">{month}</span>
                    <span className="ml-2 font-semibold text-text-primary">{formatCurrency(amount)}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-muted mt-2">
                Add &quot;YYYY-MM&quot; to the start of a note to schedule a cost to a month.
              </p>
            </div>
          )}

          {/* Bottom padding so content clears the sticky footer */}
          <div className="h-4" />
        </div>
      </div>

      {/* ── Sticky footer ── */}
      <div className="shrink-0 border-t border-border bg-surface-2/80 backdrop-blur-sm px-4 py-3">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          {dirty
            ? <p className="text-xs text-warning">Unsaved changes</p>
            : <p className="text-xs text-muted">All changes saved</p>
          }
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Discard</Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving} disabled={!dirty}>
              <Check size={14} /> Save
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
