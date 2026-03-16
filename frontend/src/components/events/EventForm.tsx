'use client'

import { useState } from 'react'
import { LifeEvent, EventType } from '@/lib/types'
import { createLifeEvent, updateLifeEvent } from '@/lib/api'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { formatCurrency } from '@/lib/utils'
import { Plus, Trash2 } from 'lucide-react'

interface EventFormProps {
  event?: LifeEvent
  onSuccess: () => void
  onCancel: () => void
}

const eventTypeOptions: { value: EventType; label: string }[] = [
  { value: 'wedding', label: '💍 Wedding' },
  { value: 'marriage', label: '💒 Marriage' },
  { value: 'move', label: '📦 Moving' },
  { value: 'new_job', label: '💼 New Job' },
  { value: 'baby', label: '👶 Baby' },
  { value: 'home_purchase', label: '🏠 Home Purchase' },
  { value: 'vacation', label: '✈️ Vacation' },
  { value: 'loan_payoff', label: '🎉 Loan Payoff' },
  { value: 'other', label: '📌 Other' },
]

interface MonthBreakdown {
  month: string
  amount: number
}

export default function EventForm({ event, onSuccess, onCancel }: EventFormProps) {
  const [formData, setFormData] = useState({
    name: event?.name || '',
    event_type: (event?.event_type || 'other') as EventType,
    start_date: event?.start_date || '',
    end_date: event?.end_date || '',
    total_cost: event?.total_cost?.toString() || '0',
    description: event?.description || '',
    is_active: event?.is_active ?? true,
  })
  const [breakdown, setBreakdown] = useState<MonthBreakdown[]>(
    event?.monthly_breakdown || []
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const addBreakdownRow = () => {
    const nextMonth = breakdown.length > 0
      ? breakdown[breakdown.length - 1].month
      : formData.start_date.substring(0, 7)
    setBreakdown([...breakdown, { month: nextMonth, amount: 0 }])
  }

  const removeBreakdownRow = (i: number) => {
    setBreakdown(breakdown.filter((_, idx) => idx !== i))
  }

  const updateBreakdown = (i: number, field: 'month' | 'amount', value: string) => {
    const updated = [...breakdown]
    if (field === 'amount') {
      updated[i] = { ...updated[i], amount: parseFloat(value) || 0 }
    } else {
      updated[i] = { ...updated[i], month: value }
    }
    setBreakdown(updated)
  }

  const totalBreakdown = breakdown.reduce((s, b) => s + b.amount, 0)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload: Partial<LifeEvent> = {
        name: formData.name,
        event_type: formData.event_type,
        start_date: formData.start_date,
        end_date: formData.end_date || undefined,
        total_cost: parseFloat(formData.total_cost),
        description: formData.description || undefined,
        is_active: formData.is_active,
        monthly_breakdown: breakdown.length > 0 ? breakdown : undefined,
      }
      if (event) {
        await updateLifeEvent(event.id, payload)
      } else {
        await createLifeEvent(payload)
      }
      onSuccess()
    } catch {
      setError('Failed to save event.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      <Input
        label="Event Name"
        type="text"
        placeholder="e.g. Our Wedding"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />

      <Select
        label="Event Type"
        options={eventTypeOptions}
        value={formData.event_type}
        onChange={(e) => setFormData({ ...formData, event_type: e.target.value as EventType })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Start Date"
          type="date"
          value={formData.start_date}
          onChange={(e) => setFormData({ ...formData, start_date: e.target.value })}
          required
        />
        <Input
          label="End Date (optional)"
          type="date"
          value={formData.end_date}
          onChange={(e) => setFormData({ ...formData, end_date: e.target.value })}
        />
      </div>

      <Input
        label="Total Cost"
        type="number"
        step="0.01"
        value={formData.total_cost}
        onChange={(e) => setFormData({ ...formData, total_cost: e.target.value })}
        hint="Total expected cost for this event"
        required
      />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary">Description (optional)</label>
        <textarea
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={2}
          placeholder="Details about this event..."
          className="px-3 py-2 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary placeholder:text-muted text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>

      {/* Monthly Breakdown */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium text-text-secondary">Monthly Breakdown (optional)</label>
          <Button type="button" variant="ghost" size="sm" onClick={addBreakdownRow}>
            <Plus size={14} /> Add Month
          </Button>
        </div>
        {breakdown.length > 0 ? (
          <div className="flex flex-col gap-2">
            {breakdown.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  type="month"
                  value={row.month}
                  onChange={(e) => updateBreakdown(i, 'month', e.target.value)}
                  className="flex-1 h-9 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm focus:outline-none focus:border-primary"
                />
                <input
                  type="number"
                  step="0.01"
                  value={row.amount}
                  onChange={(e) => updateBreakdown(i, 'amount', e.target.value)}
                  placeholder="Amount"
                  className="w-32 h-9 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm focus:outline-none focus:border-primary"
                />
                <button type="button" onClick={() => removeBreakdownRow(i)} className="p-1.5 text-text-secondary hover:text-danger">
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
            <div className="text-right text-xs text-text-secondary mt-1">
              Breakdown total: <span className={totalBreakdown !== parseFloat(formData.total_cost) ? 'text-warning' : 'text-primary'}>{formatCurrency(totalBreakdown)}</span>
              {totalBreakdown !== parseFloat(formData.total_cost) && ' (≠ total cost)'}
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted">No monthly breakdown — cost will be distributed evenly</p>
        )}
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.is_active}
          onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-sm text-text-secondary">Active (include in forecast)</span>
      </label>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" variant="primary" loading={loading} className="flex-1">
          {event ? 'Update' : 'Add'} Event
        </Button>
      </div>
    </form>
  )
}
