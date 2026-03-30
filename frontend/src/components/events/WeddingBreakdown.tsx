'use client'

import { useState, useEffect, useMemo } from 'react'
import { bulkSaveEventLineItems } from '@/lib/api'
import { LifeEvent, EventLineItem } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { cn } from '@/lib/utils'
import {
  Plus, Trash2, ChevronDown, ChevronUp, Check, X, DollarSign, CalendarDays, TrendingDown,
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

// ── Editable row ──────────────────────────────────────────────────────────────

interface RowProps {
  item: Omit<EventLineItem, 'id' | 'event_id'>
  index: number
  onChange: (index: number, field: keyof Omit<EventLineItem, 'id' | 'event_id'>, value: string | number | undefined) => void
  onDelete: (index: number) => void
}

function ItemRow({ item, index, onChange, onDelete }: RowProps) {
  const pct = paidPct(item.estimated_cost, item.actual_cost)
  const remaining = item.estimated_cost - (item.actual_cost ?? 0)

  return (
    <tr className="group border-b border-border/50 hover:bg-surface-2/40 transition-colors">
      <td className="py-1.5 pl-2 pr-1">
        <input
          className="w-full bg-transparent text-sm text-text-primary focus:outline-none focus:bg-surface-2 rounded px-1 py-0.5"
          value={item.name}
          onChange={e => onChange(index, 'name', e.target.value)}
          placeholder="Item name"
        />
      </td>
      <td className="py-1.5 px-1">
        <select
          className="bg-transparent text-xs text-text-secondary focus:outline-none focus:bg-surface-2 rounded px-1 py-0.5 w-full"
          value={item.category ?? ''}
          onChange={e => onChange(index, 'category', e.target.value)}
        >
          {WEDDING_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </td>
      <td className="py-1.5 px-1">
        <div className="relative">
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
          <input
            type="number"
            min="0"
            step="50"
            className="w-24 bg-transparent text-sm text-right focus:outline-none focus:bg-surface-2 rounded pl-3 pr-1 py-0.5"
            value={item.estimated_cost || ''}
            onChange={e => onChange(index, 'estimated_cost', parseFloat(e.target.value) || 0)}
          />
        </div>
      </td>
      <td className="py-1.5 px-1">
        <div className="relative">
          <span className="absolute left-1 top-1/2 -translate-y-1/2 text-muted text-xs">$</span>
          <input
            type="number"
            min="0"
            step="50"
            className="w-24 bg-transparent text-sm text-right focus:outline-none focus:bg-surface-2 rounded pl-3 pr-1 py-0.5"
            value={item.actual_cost ?? ''}
            placeholder="—"
            onChange={e => {
              const v = e.target.value === '' ? undefined : parseFloat(e.target.value) || 0
              onChange(index, 'actual_cost', v)
            }}
          />
        </div>
      </td>
      <td className="py-1.5 px-1 text-right text-sm">
        <span className={cn(remaining > 0 ? 'text-warning' : 'text-primary', 'font-medium')}>
          {remaining > 0 ? formatCurrency(remaining) : '✓'}
        </span>
      </td>
      <td className="py-1.5 px-1">
        <div className="flex items-center gap-1">
          <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden min-w-[40px]">
            <div
              className={cn('h-full rounded-full', pct >= 100 ? 'bg-primary' : 'bg-warning')}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </td>
      <td className="py-1.5 px-1">
        <input
          className="w-full bg-transparent text-xs text-muted focus:outline-none focus:bg-surface-2 rounded px-1 py-0.5"
          value={item.notes ?? ''}
          onChange={e => onChange(index, 'notes', e.target.value)}
          placeholder="notes"
        />
      </td>
      <td className="py-1.5 pr-2 pl-1">
        <button
          onClick={() => onDelete(index)}
          className="p-1 rounded text-muted hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100"
        >
          <Trash2 size={12} />
        </button>
      </td>
    </tr>
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
    <tr className="bg-surface-2/60">
      <td colSpan={5} className="py-2 pl-3 pr-1">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 text-xs font-semibold text-text-secondary uppercase tracking-wider hover:text-text-primary transition-colors"
        >
          {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
          {name}
          <span className="font-normal normal-case text-muted">
            {formatCurrency(estimated)}
            {actual > 0 && <span className="text-primary"> · paid {formatCurrency(actual)}</span>}
            {remaining > 0 && estimated > 0 && <span className="text-warning"> · {formatCurrency(remaining)} left</span>}
          </span>
        </button>
      </td>
      <td colSpan={3} className="py-2 pr-2 text-right">
        <button
          onClick={onAddItem}
          className="text-xs text-primary/70 hover:text-primary flex items-center gap-0.5 ml-auto"
        >
          <Plus size={11} /> Add
        </button>
      </td>
    </tr>
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
  // Working copy of line items (unsaved until user clicks Save)
  type DraftItem = Omit<EventLineItem, 'id' | 'event_id'>
  const [items, setItems] = useState<DraftItem[]>([])
  const [saving, setSaving] = useState(false)
  const [dirty, setDirty] = useState(false)
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())

  // Initialise from event.line_items
  useEffect(() => {
    if (!isOpen) return
    if (event.line_items && event.line_items.length > 0) {
      setItems(event.line_items.map(({ id, event_id, ...rest }) => rest))
    } else {
      // Pre-fill with starter items from the CSV template
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
    // Sort groups in canonical order
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

  const today = new Date()
  const weddingDate = event.end_date
    ? new Date(event.end_date)
    : new Date(event.start_date)
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

  // Global index mapping (needed because items array isn't split by group)
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

  // ── Monthly breakdown (costs that have a specific month set via notes "YYYY-MM") ──
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
    <Modal isOpen={isOpen} onClose={onClose} title={`${event.name} — Budget Breakdown`} size="xl">
      <div className="flex flex-col gap-4">

        {/* ── Summary bar ── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary">Total Estimated</p>
            <p className="text-lg font-bold text-text-primary">{formatCurrency(totalEstimated)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary">Paid So Far</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(totalPaid)}</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary">Remaining</p>
            <p className={cn('text-lg font-bold', totalRemaining > 0 ? 'text-warning' : 'text-primary')}>
              {formatCurrency(totalRemaining)}
            </p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary flex items-center gap-1">
              <CalendarDays size={10} />
              {monthsLeft > 0 ? `${monthsLeft}mo left · Save/mo` : 'Date passed'}
            </p>
            <p className="text-lg font-bold text-text-primary">
              {monthsLeft > 0 ? formatCurrency(monthlySavingsNeeded) : '—'}
            </p>
          </div>
        </div>

        {/* ── Progress bar ── */}
        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
          <div
            className="h-full bg-primary rounded-full transition-all"
            style={{ width: `${totalEstimated > 0 ? Math.min(100, (totalPaid / totalEstimated) * 100) : 0}%` }}
          />
        </div>
        <p className="text-xs text-muted -mt-2">
          {totalEstimated > 0
            ? `${((totalPaid / totalEstimated) * 100).toFixed(1)}% paid`
            : 'Enter estimated costs to track progress'}
        </p>

        {/* ── Line items table ── */}
        <div className="overflow-auto max-h-[50vh] border border-border rounded-xl">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-2">
                <th className="text-left py-2 pl-3 text-xs text-text-secondary font-medium">Item</th>
                <th className="text-left py-2 px-1 text-xs text-text-secondary font-medium">Category</th>
                <th className="text-right py-2 px-1 text-xs text-text-secondary font-medium">Estimated</th>
                <th className="text-right py-2 px-1 text-xs text-text-secondary font-medium">Paid</th>
                <th className="text-right py-2 px-1 text-xs text-text-secondary font-medium">Remaining</th>
                <th className="py-2 px-1 text-xs text-text-secondary font-medium w-16">%</th>
                <th className="text-left py-2 px-1 text-xs text-text-secondary font-medium">Notes</th>
                <th className="py-2 pr-2 w-6" />
              </tr>
            </thead>
            <tbody>
              {grouped.map(({ category, items: catItems }) => {
                const catEst = catItems.reduce((s, i) => s + (i.estimated_cost || 0), 0)
                const catPaid = catItems.reduce((s, i) => s + (i.actual_cost || 0), 0)
                const isCollapsed = collapsed.has(category)
                return (
                  <>
                    <CategoryHeader
                      key={`hdr-${category}`}
                      name={category}
                      estimated={catEst}
                      actual={catPaid}
                      collapsed={isCollapsed}
                      onToggle={() => toggleCollapse(category)}
                      onAddItem={() => handleAddItem(category)}
                    />
                    {!isCollapsed && catItems.map((item, localIdx) => {
                      const gi = globalIndex(category, localIdx)
                      return (
                        <ItemRow
                          key={`${category}-${localIdx}`}
                          item={item}
                          index={gi}
                          onChange={handleChange}
                          onDelete={handleDelete}
                        />
                      )
                    })}
                  </>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Add category + save ── */}
        <div className="flex items-center justify-between pt-1">
          <button
            onClick={handleAddCategory}
            className="text-xs text-primary/70 hover:text-primary flex items-center gap-1"
          >
            <Plus size={12} /> Add category
          </button>

          <div className="flex items-center gap-2">
            {dirty && (
              <span className="text-xs text-muted">Unsaved changes</span>
            )}
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave} loading={saving}>
              <Check size={14} />
              Save
            </Button>
          </div>
        </div>

        {/* ── Monthly savings needed breakdown (if items have "YYYY-MM" notes) ── */}
        {monthlyView.length > 0 && (
          <div className="border-t border-border pt-3">
            <p className="text-xs font-medium text-text-secondary mb-2 flex items-center gap-1">
              <TrendingDown size={12} /> Scheduled monthly payments (from notes)
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
              Tip: add a month like "2026-10" at the start of a note to schedule that cost.
            </p>
          </div>
        )}

      </div>
    </Modal>
  )
}
