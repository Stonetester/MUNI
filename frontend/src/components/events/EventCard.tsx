'use client'

import { useState } from 'react'
import { LifeEvent, EventLineItem } from '@/lib/types'
import { formatCurrency, formatDate, getDaysUntil, eventTypeEmoji } from '@/lib/utils'
import { deleteLifeEvent } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Edit2, Trash2, LayoutList } from 'lucide-react'
import WeddingBreakdown from './WeddingBreakdown'

interface EventCardProps {
  event: LifeEvent & { owner?: string }
  onEdit: (event: LifeEvent) => void
  onDeleted: () => void
  onUpdated?: (event: LifeEvent) => void
  readOnly?: boolean
}

export default function EventCard({ event, onEdit, onDeleted, onUpdated, readOnly = false }: EventCardProps) {
  const daysUntil = getDaysUntil(event.start_date)
  // Joint events are always editable regardless of view mode
  const canEdit = !readOnly || event.is_joint
  const isPast = daysUntil < 0
  const isToday = daysUntil === 0
  const [showBreakdown, setShowBreakdown] = useState(false)

  // Line item totals for the card summary
  const lineItems = event.line_items ?? []
  const hasItems = lineItems.length > 0
  const itemsEstimated = lineItems.reduce((s, i) => s + (i.estimated_cost || 0), 0)
  const itemsPaid = lineItems.reduce((s, i) => s + (i.actual_cost || 0), 0)
  const itemsRemaining = itemsEstimated - itemsPaid
  const paidPct = itemsEstimated > 0 ? Math.min(100, (itemsPaid / itemsEstimated) * 100) : 0

  const isWedding = ['wedding', 'marriage'].includes(event.event_type)

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${event.name}"?`)) return
    try {
      await deleteLifeEvent(event.id)
      onDeleted()
    } catch {
      alert('Failed to delete event.')
    }
  }

  function handleBreakdownSaved(savedItems: EventLineItem[]) {
    setShowBreakdown(false)
    if (onUpdated) {
      onUpdated({ ...event, line_items: savedItems })
    }
  }

  return (
    <>
      <div className="bg-surface-2 border border-[#2d3748] rounded-xl p-4 hover:border-primary/30 transition-all group">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{eventTypeEmoji(event.event_type)}</span>
            <div>
              <h3 className="text-sm font-semibold text-text-primary">{event.name}</h3>
              <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                {event.is_active ? (
                  <Badge label="Active" variant="success" />
                ) : (
                  <Badge label="Inactive" variant="gray" />
                )}
                {isPast && <Badge label="Past" variant="gray" />}
                {isToday && <Badge label="Today!" variant="warning" />}
                {!isPast && !isToday && daysUntil <= 30 && (
                  <Badge label={`${daysUntil}d away`} variant="warning" />
                )}
                {event.is_joint && (
                  <Badge label="Joint" variant="info" />
                )}
                {event.owner && (
                  <span className="text-xs px-2 py-0.5 rounded-full bg-surface-2 text-text-secondary border border-border">
                    {event.owner}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Budget breakdown button for all events that support it */}
            {canEdit && (
              <button
                onClick={() => setShowBreakdown(true)}
                title="Budget breakdown"
                className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
              >
                <LayoutList size={14} />
              </button>
            )}
            {canEdit && (
              <>
                <button
                  onClick={() => onEdit(event)}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Edit2 size={14} />
                </button>
                <button
                  onClick={handleDelete}
                  className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors opacity-0 group-hover:opacity-100"
                >
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-text-secondary mb-0.5">Start Date</p>
            <p className="text-sm text-text-primary">{formatDate(event.start_date)}</p>
          </div>
          {event.end_date && (
            <div>
              <p className="text-xs text-text-secondary mb-0.5">End Date</p>
              <p className="text-sm text-text-primary">{formatDate(event.end_date)}</p>
            </div>
          )}
          <div>
            <p className="text-xs text-text-secondary mb-0.5">Total Cost</p>
            <p className="text-lg font-bold text-warning">{formatCurrency(event.total_cost)}</p>
          </div>
          {!isPast && !isToday && (
            <div>
              <p className="text-xs text-text-secondary mb-0.5">Countdown</p>
              <p className="text-sm text-text-primary font-medium">{daysUntil} days</p>
            </div>
          )}
        </div>

        {/* Line items mini-summary — shown when items exist */}
        {hasItems && (
          <div className="mt-3 border-t border-[#2d3748] pt-3">
            <div className="flex items-center justify-between mb-1.5">
              <p className="text-xs text-text-secondary font-medium">Budget Breakdown</p>
              <button
                onClick={() => setShowBreakdown(true)}
                className="text-xs text-primary hover:text-primary/80"
              >
                {lineItems.length} items →
              </button>
            </div>
            <div className="flex items-center gap-3 text-xs mb-1.5">
              <span className="text-muted">Estimated <span className="text-text-primary font-medium">{formatCurrency(itemsEstimated)}</span></span>
              <span className="text-muted">Paid <span className="text-primary font-medium">{formatCurrency(itemsPaid)}</span></span>
              {itemsRemaining > 0 && (
                <span className="text-muted">Left <span className="text-warning font-medium">{formatCurrency(itemsRemaining)}</span></span>
              )}
            </div>
            <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all"
                style={{ width: `${paidPct}%` }}
              />
            </div>
            <p className="text-[11px] text-muted mt-1">{paidPct.toFixed(0)}% paid</p>
          </div>
        )}

        {/* Wedding CTA if no items yet */}
        {!hasItems && isWedding && canEdit && (
          <div className="mt-3 border-t border-[#2d3748] pt-3">
            <button
              onClick={() => setShowBreakdown(true)}
              className="w-full text-xs text-primary/70 hover:text-primary border border-dashed border-primary/30 hover:border-primary/60 rounded-lg py-2 transition-colors flex items-center justify-center gap-1"
            >
              <LayoutList size={12} /> Set up wedding budget breakdown
            </button>
          </div>
        )}

        {event.description && (
          <p className="text-xs text-text-secondary mt-3 border-t border-[#2d3748] pt-3">
            {event.description}
          </p>
        )}

        {event.monthly_breakdown && event.monthly_breakdown.length > 0 && (
          <div className="mt-3 border-t border-[#2d3748] pt-3">
            <p className="text-xs text-text-secondary font-medium mb-2">Monthly Breakdown</p>
            <div className="grid grid-cols-3 gap-1">
              {event.monthly_breakdown.slice(0, 6).map((m, i) => (
                <div key={i} className="text-xs">
                  <span className="text-muted">{m.month}: </span>
                  <span className="text-text-primary font-medium">{formatCurrency(m.amount)}</span>
                </div>
              ))}
              {event.monthly_breakdown.length > 6 && (
                <p className="text-xs text-muted">+{event.monthly_breakdown.length - 6} more</p>
              )}
            </div>
          </div>
        )}
      </div>

      {showBreakdown && (
        <WeddingBreakdown
          event={event}
          isOpen={showBreakdown}
          onClose={() => setShowBreakdown(false)}
          onSaved={handleBreakdownSaved}
        />
      )}
    </>
  )
}
