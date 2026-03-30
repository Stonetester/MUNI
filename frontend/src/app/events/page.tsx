'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import EventCard from '@/components/events/EventCard'
import EventForm from '@/components/events/EventForm'
import { getLifeEvents, deleteAllLifeEvents, getJointEvents } from '@/lib/api'
import { LifeEvent } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2, Calendar } from 'lucide-react'
import { useViewMode } from '@/lib/viewMode'

export default function EventsPage() {
  const { mode } = useViewMode()
  const [events, setEvents] = useState<(LifeEvent & { owner?: string })[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editEvent, setEditEvent] = useState<LifeEvent | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const data = mode === 'joint' ? await getJointEvents() : await getLifeEvents()
      setEvents(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [mode])

  useEffect(() => { load() }, [load])

  const handleSuccess = () => {
    setShowAdd(false)
    setEditEvent(undefined)
    load()
  }

  const active = events.filter((e) => e.is_active)
  const inactive = events.filter((e) => !e.is_active)
  const totalCost = active.reduce((s, e) => s + e.total_cost, 0)

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            {active.length > 0 && (
              <p className="text-text-secondary text-sm">
                {active.length} active events · {formatCurrency(totalCost)} total
              </p>
            )}
          </div>
          {mode !== 'joint' && (
            <div className="flex items-center gap-2">
              {events.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={async () => {
                    if (!window.confirm('Delete all life events? This cannot be undone.')) return
                    await deleteAllLifeEvents()
                    load()
                  }}
                >
                  <Trash2 size={14} />
                  Clear All
                </Button>
              )}
              <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
                <Plus size={14} />
                Add Event
              </Button>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : events.length === 0 ? (
          <div className="text-center py-16 text-text-secondary">
            <Calendar size={48} className="mx-auto mb-3 opacity-30" />
            <p className="font-medium">No life events yet</p>
            <p className="text-sm mt-1">Add upcoming events like your wedding, a move, or a vacation</p>
            <Button variant="primary" className="mt-4" onClick={() => setShowAdd(true)}>
              <Plus size={16} /> Add First Event
            </Button>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <div>
                <h3 className="text-xs text-text-secondary font-semibold uppercase tracking-wider mb-3">Active Events</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {active
                    .sort((a, b) => new Date(a.start_date).getTime() - new Date(b.start_date).getTime())
                    .map((event) => (
                      <EventCard
                        key={event.id}
                        event={event}
                        onEdit={setEditEvent}
                        onDeleted={load}
                        readOnly={mode === 'joint'}
                      />
                    ))}
                </div>
              </div>
            )}

            {inactive.length > 0 && (
              <div>
                <h3 className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Inactive Events</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 opacity-50">
                  {inactive.map((event) => (
                    <EventCard
                      key={event.id}
                      event={event}
                      onEdit={setEditEvent}
                      onDeleted={load}
                      readOnly={mode === 'joint'}
                    />
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {mode !== 'joint' && (
        <Modal
          isOpen={showAdd || !!editEvent}
          onClose={() => { setShowAdd(false); setEditEvent(undefined) }}
          title={editEvent ? 'Edit Event' : 'Add Life Event'}
          size="lg"
        >
          <EventForm
            event={editEvent}
            onSuccess={handleSuccess}
            onCancel={() => { setShowAdd(false); setEditEvent(undefined) }}
          />
        </Modal>
      )}
    </AppLayout>
  )
}
