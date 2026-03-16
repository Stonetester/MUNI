'use client'

import { LifeEvent } from '@/lib/types'
import { formatCurrency, formatDate, getDaysUntil, eventTypeEmoji } from '@/lib/utils'
import Card from '@/components/ui/Card'
import Link from 'next/link'
import { Calendar } from 'lucide-react'

interface UpcomingEventsCardProps {
  events: LifeEvent[]
}

export default function UpcomingEventsCard({ events }: UpcomingEventsCardProps) {
  const upcoming = events
    .filter((e) => e.is_active)
    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
    .slice(0, 4)

  return (
    <Card
      title="Upcoming Events"
      className="col-span-full md:col-span-1"
      action={
        <Link href="/events" className="text-xs text-primary hover:underline">
          View all
        </Link>
      }
    >
      {upcoming.length === 0 ? (
        <div className="text-center py-6 text-text-secondary">
          <Calendar size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No upcoming events</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {upcoming.map((event) => {
            const daysUntil = getDaysUntil(event.start_date)
            return (
              <div
                key={event.id}
                className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl border border-[#2d3748]"
              >
                <div className="text-2xl flex-shrink-0">{eventTypeEmoji(event.event_type)}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{event.name}</p>
                  <p className="text-xs text-text-secondary">{formatDate(event.start_date)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-sm font-semibold text-warning">{formatCurrency(event.total_cost)}</p>
                  <p className="text-xs text-text-secondary">
                    {daysUntil > 0 ? `${daysUntil}d away` : daysUntil === 0 ? 'Today' : 'Past'}
                  </p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}
