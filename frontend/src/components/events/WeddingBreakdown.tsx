'use client'

import { useState, useEffect, useMemo } from 'react'
import { bulkSaveEventLineItems } from '@/lib/api'
import { LifeEvent, EventLineItem } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Plus, Trash2, ChevronDown, ChevronUp, Check, CalendarDays, TrendingDown,
} from 'lucide-react'

// ── Default wedding categories with pre-filled starter items ─────────────────

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

function paidPct(estimated: number, actual?: number) {
  if (!estimated || !actual) return 0
  return Math.min(100, (actual / estimated) * 100)
}

// ── Item card (mobile-first) ──────────────────────────────────────────────────

interface CardProps {
  item: Omit<EventLineItem, 'id' | 'event_id'>
  index: number
  onChange: (index: number, field: keyof Omit<EventLineItem, 'id' | 'event_id'>, value: string | number | undefined) => void
  onDelete: (index: number) => void
}

function ItemCard({ item, index, onChange, onDelete }: CardProps) {
  const pct = paidPct(item.estimated_cost, item.actual_cost)
  const remaining = item.estimated_cost - (item.actual_cost ?? 0)
  const isPaid = remaining <= 0 && item.estimated_cost > 0

  return (
    <div className="bg-surface-2/40 border border-border/40 rounded-xl p-3 flex flex-col gap-2">
      {/* Name row */}
      <div className="flex items-center gap-2">
        <input
          className="flex-1 bg-transparent text-sm font-medium text-text-primary focus:outline-none placeholder:text-muted/50 min-w-0"
          value={item.name}
          onChange={e => onChange(index, 'name', e.target.value)}
          placeholder="Item name"
        />
        <button
          onClick={() => onDelete(index)}
          className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-danger/10 transition-colors shrink-0"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* Est / Paid / Remaining */}
      <div className="grid grid-cols-3 gap-2">
        <div>
          <p className="text-[10px] text-muted mb-1">Estimated</p>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">$</span>
            <input
              type="number"
              min="0"
              step="50"
              inputMode="decimal"
              className="w-full bg-surface-2 border border-border/60 text-sm text-right focus:outline-none focus:border-primary/50 rounded-lg pl-5 pr-2 py-1.5"
              value={item.estimated_cost || ''}
              onChange={e => onChange(index, 'estimated_cost', parseFloat(e.target.value) || 0)}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted mb-1">Paid</p>
          <div className="relative">
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted text-xs pointer-events-none">$</span>
            <input
              type="number"
              min="0"
              step="50"
              inputMode="decimal"
              className="w-full bg-surface-2 border border-border/60 text-sm text-right focus:outline-none focus:border-primary/50 rounded-lg pl-5 pr-2 py-1.5"
              value={item.actual_cost ?? ''}
              placeholder="0"
              onChange={e => {
                const v = e.target.value === '' ? undefined : parseFloat(e.target.value) || 0
                onChange(index, 'actual_cost', v)
              }}
            />
          </div>
        </div>
        <div>
          <p className="text-[10px] text-muted mb-1">Remaining</p>
          <div className="flex items-center h-[34px] justify-end">
            {isPaid ? (
              <span className="text-xs font-semibold text-primary flex items-center gap-1">
                <Check size={11} /> Done
              </span>
            ) : (
              <span className={cn('text-sm font-semibold', remaining > 0 ? 'text-warning' : 'text-muted')}>
                {item.estimated_cost > 0 ? formatCurrency(remaining) : '—'}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {item.estimated_cost > 0 && (
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className={cn('h-full rounded-full transition-all', isPaid ? 'bg-primary' : 'bg-warning')}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] text-muted shrink-0">{pct.toFixed(0)}%</span>
        </div>
      )}

      {/* Notes */}
      <input
        className="w-full bg-transparent text-xs text-muted focus:outline-none rounded px-0 py-0.5 border-b border-transparent focus:border-border/50 placeholder:text-muted/40 transition-colors"
        value={item.notes ?? ''}
        onChange={e => onChange(index, 'notes', e.target.value)}
        placeholder="Notes (use YYYY-MM to schedule a payment)"
      />
    </div>
  )
}

// ── Category group header ─────────────────────────────────────────────────────

function CategoryHeader({ name, estimated, actual, collapsed, onToggle, onAddItem }: {
  name: string
  estimated: number
  actual: number
  collapsed: boolean
  onToggle: () => void
  onAddItem: () => void
}) {
  const remaining = estimated - actual
  return (
    <div className="flex items-center justify-between px-3 py-2.5 bg-surface-2/70">
      <button
        onClick={onToggle}
        className="flex items-center gap-2 text-xs font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors min-w-0"
      >
        {collapsed ? <ChevronDown size={12} className="shrink-0" /> : <ChevronUp size={12} className="shrink-0" />}
        <span className="truncate">{name}</span>
      </button>
      <div className="flex items-center gap-3 shrink-0 ml-2">
        <div className="text-right text-xs hidden sm:block">
          <span className="text-muted">{formatCurrency(estimated)}</span>
          {actual > 0 && <span className="text-primary ml-1">· {formatCurrency(actual)} paid</span>}
          {remaining > 0 && estimated > 0 && <span className="text-warning ml-1">· {formatCurrency(remaining)} left</span>}
        </div>
        {/* Mobile: just show the estimated */}
        <span className="text-xs text-muted sm:hidden">{formatCurrency(estimated)}</span>
        <button
          onClick={onAddItem}
          className="text-xs text-primary/70 hover:text-primary flex items-center gap-0.5 py-1 px-2 rounded-lg hover:bg-primary/10 transition-colors"
        >
          <Plus size={11} /> Add
        </button>
      </div>
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
  type DraftItem = Omit<EventLineItem, 'id' | 'event_id'>
  const [items, setItems] = useState<DraftItem[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

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
      .concat(
        Object.keys(map)
          .filter(c => !order.includes(c))
          .map(c => ({ category: c, items: map[c] })),
      )
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
    setItems(prev => {
      const next = [...prev]
      next[index] = { ...next[index], [field]: value }
      return next
    })
    setDirty(true)
  }

  function handleDelete(index: number) {
    setItems(prev => prev.filter((_, i) => i !== index))
    setDirty(true)
  }

  function handleAddItem(category: string) {
    const maxOrder = items.filter(i => i.category === category).reduce((m, i) => Math.max(m, i.sort_order), 0)
    setItems(prev => [
      ...prev,
      { name: '', category, estimated_cost: 0, actual_cost: undefined, notes: undefined, sort_order: maxOrder + 1 },
    ])
    setDirty(true)
    // Ensure the category is expanded
    setCollapsed(prev => {
      const next = new Set(prev)
      next.delete(category)
      return next
    })
  }

  function handleAddCategory() {
    const name = prompt('New category name:')
    if (!name) return
    setItems(prev => [
      ...prev,
      { name: 'New item', category: name, estimated_cost: 0, actual_cost: undefined, notes: undefined, sort_order: 0 },
    ])
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

  function toggleCollapse(cat: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      next.has(cat) ? next.delete(cat) : next.add(cat)
      return next
    })
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
      if (match) {
        map[match[1]] = (map[match[1]] || 0) + (item.estimated_cost || 0)
      }
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b))
  }, [items])

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${event.name} — Budget`} size="xl">
      <div className="flex flex-col gap-4">

        {/* ── Summary cards ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-[11px] text-text-secondary mb-0.5">Total Budget</p>
            <p className="text-base font-bold text-text-primary">{formatCurrency(totalEstimated)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-[11px] text-text-secondary mb-0.5">Paid</p>
            <p className="text-base font-bold text-primary">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-[11px] text-text-secondary mb-0.5">Remaining</p>
            <p className={cn('text-base font-bold', totalRemaining > 0 ? 'text-warning' : 'text-primary')}>
              {formatCurrency(totalRemaining)}
            </p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-[11px] text-text-secondary mb-0.5 flex items-center gap-1">
              <CalendarDays size={10} />
              {monthsLeft > 0 ? `${monthsLeft}mo · Save/mo` : 'Date passed'}
            </p>
            <p className="text-base font-bold text-text-primary">
              {monthsLeft > 0 ? formatCurrency(monthlySavingsNeeded) : '—'}
            </p>
          </div>
        </div>

        {/* ── Overall progress ── */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs text-muted">{overallPct.toFixed(1)}% paid</span>
            <span className="text-xs text-muted">{formatCurrency(totalPaid)} of {formatCurrency(totalEstimated)}</span>
          </div>
          <div className="h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all"
              style={{ width: `${overallPct}%` }}
            />
          </div>
        </div>

        {/* ── Category sections ── */}
        <div className="flex flex-col gap-2 max-h-[55vh] overflow-y-auto -mx-1 px-1">
          {grouped.map(({ category, items: catItems }) => {
            const catEst = catItems.reduce((s, i) => s + (i.estimated_cost || 0), 0)
            const catPaid = catItems.reduce((s, i) => s + (i.actual_cost || 0), 0)
            const isCollapsed = collapsed.has(category)
            return (
              <div key={category} className="border border-border/40 rounded-xl overflow-hidden">
                <CategoryHeader
                  name={category}
                  estimated={catEst}
                  actual={catPaid}
                  collapsed={isCollapsed}
                  onToggle={() => toggleCollapse(category)}
                  onAddItem={() => handleAddItem(category)}
                />
                {!isCollapsed && (
                  <div className="flex flex-col gap-2 p-2">
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
                  </div>
                )}
              </div>
            )
          })}
        </div>

        {/* ── Footer ── */}
        <div className="flex items-center justify-between pt-1 border-t border-border/30">
          <button
            onClick={handleAddCategory}
            className="text-xs text-primary/70 hover:text-primary flex items-center gap-1 py-1.5 px-2 rounded-lg hover:bg-primary/10 transition-colors"
          >
            <Plus size={12} /> Add category
          </button>
          <div className="flex items-center gap-2">
            {dirty && <span className="text-xs text-muted hidden sm:inline">Unsaved changes</span>}
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              <Check size={14} />
              Save
            </Button>
          </div>
        </div>

        {/* ── Scheduled payments ── */}
        {monthlyView.length > 0 && (
          <div className="border-t border-border/30 pt-3">
            <p className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
              <TrendingDown size={12} /> Scheduled payments
            </p>
            <div className="flex flex-wrap gap-2">
              {monthlyView.map(([month, amount]) => (
                <div key={month} className="bg-surface-2 rounded-lg px-3 py-1.5 text-xs">
                  <span className="text-muted">{month}</span>
                  <span className="ml-2 font-semibold text-text-primary">{formatCurrency(amount)}</span>
                </div>
              ))}
            </div>
            <p className="text-[11px] text-muted mt-1">
              Add &quot;YYYY-MM&quot; to the start of a note to schedule that cost.
            </p>
          </div>
        )}

      </div>
    </Modal>
  )
}
