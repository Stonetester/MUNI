'use client'

import { LifeEvent } from '@/lib/types'
import { formatCurrency, formatDate, getDaysUntil, eventTypeEmoji } from '@/lib/utils'
import { deleteLifeEvent } from '@/lib/api'
import { Badge } from '@/components/ui/Badge'
import { Edit2, Trash2 } from 'lucide-react'

interface EventCardProps {
  event: LifeEvent
  onEdit: (event: LifeEvent) => void
  onDeleted: () => void
}

export default function EventCard({ event, onEdit, onDeleted }: EventCardProps) {
  const daysUntil = getDaysUntil(event.start_date)
  const isPast = daysUntil < 0
  const isToday = daysUntil === 0

  const handleDelete = async () => {
    if (!window.confirm(`Delete "${event.name}"?`)) return
    try {
      await deleteLifeEvent(event.id)
      onDeleted()
    } catch {
      alert('Failed to delete event.')
    }
  }

  return (
    <div className="bg-surface-2 border border-[#2d3748] rounded-xl p-4 hover:border-primary/30 transition-all group">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-3xl">{eventTypeEmoji(event.event_type)}</span>
          <div>
            <h3 className="text-sm font-semibold text-text-primary">{event.name}</h3>
            <div className="flex items-center gap-2 mt-0.5">
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
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(event)}
            className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
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
  )
}
