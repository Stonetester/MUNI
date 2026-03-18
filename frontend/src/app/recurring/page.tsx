'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getRecurringRules, createRecurringRule, updateRecurringRule, deleteRecurringRule, getRecurringSuggestions } from '@/lib/api'
import { RecurringRule, Frequency } from '@/lib/types'
import { formatCurrency, frequencyLabel } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { Plus, Edit2, Trash2, RefreshCw, AlertTriangle, Check, X, Sparkles } from 'lucide-react'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'

interface Suggestion {
  description: string
  amount: number
  frequency: string
  occurrences: number
  last_date: string
  category_id?: number
  median_gap_days: number
}

const SUBSCRIPTION_KEYWORDS = ['netflix', 'spotify', 'hulu', 'disney', 'amazon prime', 'apple', 'youtube', 'hbo', 'peacock', 'paramount', 'insurance', 'geico', 'allstate', 'state farm', 'electric', 'utility', 'internet', 'comcast', 'verizon', 'at&t', 't-mobile', 'phone', 'xfinity']

function isSubscription(rule: RecurringRule): boolean {
  const amt = Math.abs(rule.amount)
  const name = rule.name.toLowerCase()
  const isSmallMonthlyOrAnnual = (rule.frequency === 'monthly' || rule.frequency === 'annual') && amt <= 600
  const hasKeyword = SUBSCRIPTION_KEYWORDS.some(k => name.includes(k))
  return isSmallMonthlyOrAnnual || hasKeyword
}

function isStale(rule: RecurringRule): boolean {
  if (!rule.next_date) return false
  const next = new Date(rule.next_date)
  const daysAgo = (Date.now() - next.getTime()) / (1000 * 60 * 60 * 24)
  return daysAgo > 60
}

function RuleRow({ rule, onEdit, onDelete, onToggleActive }: {
  rule: RecurringRule
  onEdit: (r: RecurringRule) => void
  onDelete: (r: RecurringRule) => void
  onToggleActive: (r: RecurringRule) => void
}) {
  const stale = isStale(rule)
  return (
    <div className={cn('rounded-xl border p-4 flex flex-col gap-2', stale ? 'border-yellow-500/30 bg-yellow-500/5' : 'border-[#2d3748] bg-surface')}>
      <div className="flex items-center gap-3">
        <div className="flex-1 min-w-0">
          <p className={cn('text-sm font-medium', rule.is_active ? 'text-text-primary' : 'text-text-secondary line-through')}>{rule.name}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className="text-xs text-text-secondary">{frequencyLabel(rule.frequency)}</span>
            {rule.category_name && <><span className="text-muted text-xs">·</span><span className="text-xs text-text-secondary">{rule.category_name}</span></>}
            {rule.next_date && <><span className="text-muted text-xs">·</span><span className="text-xs text-text-secondary">next {rule.next_date}</span></>}
          </div>
        </div>
        <span className={cn('text-sm font-bold flex-shrink-0', rule.amount >= 0 ? 'text-green-400' : 'text-red-400')}>
          {rule.amount >= 0 ? '+' : ''}{formatCurrency(rule.amount)}
        </span>
        <div className="flex items-center gap-1">
          <button onClick={() => onToggleActive(rule)} title={rule.is_active ? 'Deactivate' : 'Activate'}
            className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors text-xs">
            {rule.is_active ? '●' : '○'}
          </button>
          <button onClick={() => onEdit(rule)} className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors">
            <Edit2 size={13} />
          </button>
          <button onClick={() => onDelete(rule)} className="p-1.5 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors">
            <Trash2 size={13} />
          </button>
        </div>
      </div>
      {stale && (
        <div className="flex items-center gap-2 text-xs text-yellow-400">
          <AlertTriangle size={12} />
          No matching transaction since {rule.next_date} — still recurring?
          <button onClick={() => onToggleActive(rule)} className="ml-auto text-xs text-text-secondary hover:text-yellow-400 underline">deactivate</button>
        </div>
      )}
    </div>
  )
}

function RuleFormModal({ rule, onSuccess, onClose }: { rule?: RecurringRule; onSuccess: () => void; onClose: () => void }) {
  const [name, setName] = useState(rule?.name || '')
  const [amount, setAmount] = useState(rule?.amount?.toString() || '')
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency || 'monthly')
  const [startDate, setStartDate] = useState(rule?.start_date || '')
  const [loading, setLoading] = useState(false)
  const freqOptions: { value: Frequency; label: string }[] = [
    { value: 'weekly', label: 'Weekly' }, { value: 'biweekly', label: 'Biweekly' },
    { value: 'monthly', label: 'Monthly' }, { value: 'bimonthly', label: 'Bimonthly' },
    { value: 'quarterly', label: 'Quarterly' }, { value: 'annual', label: 'Annual' },
    { value: 'one_time', label: 'One Time' },
  ]
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true)
    try {
      const payload = { name, amount: parseFloat(amount), frequency, start_date: startDate, is_active: true }
      if (rule) await updateRecurringRule(rule.id, payload)
      else await createRecurringRule(payload)
      onSuccess()
    } catch { alert('Failed to save.') } finally { setLoading(false) }
  }
  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <Input label="Name" value={name} onChange={e => setName(e.target.value)} required />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount" type="number" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} required hint="Positive=income, negative=expense" />
        <Select label="Frequency" options={freqOptions} value={frequency} onChange={e => setFrequency(e.target.value as Frequency)} />
      </div>
      <Input label="Start Date" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} required />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
        <Button type="submit" variant="primary" loading={loading} className="flex-1">{rule ? 'Update' : 'Add'}</Button>
      </div>
    </form>
  )
}

export default function RecurringPage() {
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'subscriptions' | 'recurring'>('subscriptions')
  const [editRule, setEditRule] = useState<RecurringRule | undefined>()
  const [showAdd, setShowAdd] = useState(false)
  const [confirmingSuggestion, setConfirmingSuggestion] = useState<Suggestion | null>(null)
  const [suggestionDate, setSuggestionDate] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [r, s] = await Promise.all([getRecurringRules(), getRecurringSuggestions()])
      setRules(r)
      setSuggestions(s)
    } catch { } finally { setLoading(false) }
  }, [])

  useEffect(() => { load() }, [load])

  const handleDelete = async (rule: RecurringRule) => {
    if (!confirm(`Delete "${rule.name}"?`)) return
    try { await deleteRecurringRule(rule.id); load() } catch { alert('Failed to delete.') }
  }

  const handleToggleActive = async (rule: RecurringRule) => {
    try { await updateRecurringRule(rule.id, { is_active: !rule.is_active }); load() } catch { alert('Failed to update.') }
  }

  const handleConfirmSuggestion = async (s: Suggestion) => {
    if (!suggestionDate) return
    try {
      await createRecurringRule({ name: s.description, amount: -Math.abs(s.amount), frequency: s.frequency as Frequency, start_date: suggestionDate, is_active: true })
      setDismissed(prev => new Set(prev).add(s.description))
      setConfirmingSuggestion(null); setSuggestionDate(''); load()
    } catch { alert('Failed to create rule.') }
  }

  const subscriptions = rules.filter(isSubscription)
  const recurring = rules.filter(r => !isSubscription(r))
  const current = tab === 'subscriptions' ? subscriptions : recurring
  const visibleSuggestions = suggestions.filter(s => !dismissed.has(s.description))

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 bg-surface border border-[#2d3748] rounded-xl p-1 w-fit">
            {(['subscriptions', 'recurring'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                className={cn('px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                  tab === t ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary')}>
                {t === 'subscriptions' ? 'Subscriptions & Bills' : 'Recurring Rules'}
              </button>
            ))}
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} /> Add Rule
          </Button>
        </div>

        {loading ? <div className="flex items-center justify-center h-48"><LoadingSpinner size="lg" /></div> : (
          <div className="flex flex-col gap-3">
            {current.length === 0 && (
              <div className="text-center py-12 text-text-secondary">
                <RefreshCw size={40} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No {tab === 'subscriptions' ? 'subscriptions' : 'recurring rules'} yet</p>
                <Button variant="primary" className="mt-4" onClick={() => setShowAdd(true)}><Plus size={14} /> Add one</Button>
              </div>
            )}
            {current.map(rule => (
              <RuleRow key={rule.id} rule={rule} onEdit={setEditRule} onDelete={handleDelete} onToggleActive={handleToggleActive} />
            ))}

            {/* Detected patterns */}
            {visibleSuggestions.length > 0 && (
              <div className="flex flex-col gap-2 mt-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                  <Sparkles size={14} className="text-primary" />
                  Detected patterns from your last 90 days
                </div>
                {visibleSuggestions.map(s => {
                  const isConfirming = confirmingSuggestion?.description === s.description
                  return (
                    <div key={s.description} className="bg-surface border border-primary/20 rounded-xl p-4 flex flex-col gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-text-primary truncate">{s.description}</p>
                          <p className="text-xs text-text-secondary mt-0.5">
                            {s.occurrences}x · every ~{s.median_gap_days} days · <span className="capitalize">{s.frequency}</span> · last {s.last_date}
                          </p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-sm font-bold text-red-400">-{formatCurrency(Math.abs(s.amount))}</span>
                          <button onClick={() => setDismissed(prev => new Set(prev).add(s.description))}
                            className="p-1 rounded-lg text-text-secondary hover:text-red-400 hover:bg-red-500/10 transition-colors">
                            <X size={13} />
                          </button>
                        </div>
                      </div>
                      {!isConfirming ? (
                        <div className="flex items-center gap-2">
                          <p className="text-xs text-text-secondary flex-1">Is this a recurring expense?</p>
                          <Button variant="primary" size="sm" onClick={() => { setConfirmingSuggestion(s); setSuggestionDate(s.last_date) }}>
                            <Check size={13} /> Yes, add rule
                          </Button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <label className="text-xs text-text-secondary whitespace-nowrap">Start date:</label>
                          <input type="date" value={suggestionDate} onChange={e => setSuggestionDate(e.target.value)}
                            className="flex-1 text-xs bg-surface-2 border border-[#2d3748] rounded-lg px-2 py-1.5 text-text-primary focus:outline-none focus:border-primary" />
                          <Button variant="primary" size="sm" onClick={() => handleConfirmSuggestion(s)}>Confirm</Button>
                          <Button variant="secondary" size="sm" onClick={() => setConfirmingSuggestion(null)}>Cancel</Button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </div>

      <Modal isOpen={showAdd || !!editRule} onClose={() => { setShowAdd(false); setEditRule(undefined) }}
        title={editRule ? 'Edit Rule' : 'Add Recurring Rule'} size="md">
        <RuleFormModal rule={editRule} onSuccess={() => { setShowAdd(false); setEditRule(undefined); load() }} onClose={() => { setShowAdd(false); setEditRule(undefined) }} />
      </Modal>
    </AppLayout>
  )
}
