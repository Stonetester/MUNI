'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout, { showToast } from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { parseStatement, createBalanceSnapshot, getAccounts } from '@/lib/api'
import type { ParsedStatement } from '@/lib/api'
import type { Account } from '@/lib/types'
import {
  Upload, CheckCircle, AlertCircle, Loader2, FileText, X, Receipt,
} from 'lucide-react'
import { cn } from '@/lib/utils'

// ─── Types ────────────────────────────────────────────────────────────────────

type ItemStatus = 'queued' | 'parsing' | 'ready' | 'saving' | 'saved' | 'error'

interface QueueItem {
  id: string
  filename: string
  status: ItemStatus
  parsed?: ParsedStatement
  error?: string
  // editable fields
  selectedAccountId?: number
  editedDate?: string
  editedBalance?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(s: string) {
  return new Date(s + 'T00:00:00').toLocaleDateString('en-US', {
    year: 'numeric', month: 'short', day: 'numeric',
  })
}

const ACCOUNT_TYPE_LABELS: Record<string, string> = {
  checking: 'Checking',
  savings: 'Savings',
  hysa: 'HYSA',
  brokerage: 'Brokerage',
  ira: 'IRA',
  retirement_401k: '401(k)',
  hsa: 'HSA',
  credit_card: 'Credit Card',
  student_loan: 'Student Loan',
  car_loan: 'Car Loan',
  mortgage: 'Mortgage',
  other: 'Other',
}

// Map institution type hint to likely account types
const TYPE_HINT_MAP: Record<string, string[]> = {
  hysa: ['hysa', 'savings'],
  retirement_401k: ['retirement_401k'],
  ira: ['ira'],
  brokerage: ['brokerage', 'ira'],
}

function bestAccountMatch(accounts: Account[], typeHint: string): number | undefined {
  const preferred = TYPE_HINT_MAP[typeHint] ?? [typeHint]
  for (const t of preferred) {
    const match = accounts.find(a => a.account_type === t)
    if (match) return match.id
  }
  return accounts[0]?.id
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, error }: { status: ItemStatus; error?: string }) {
  if (status === 'parsing') return (
    <span className="flex items-center gap-1 text-xs text-text-secondary">
      <Loader2 size={12} className="animate-spin" /> Parsing…
    </span>
  )
  if (status === 'saving') return (
    <span className="flex items-center gap-1 text-xs text-text-secondary">
      <Loader2 size={12} className="animate-spin" /> Saving…
    </span>
  )
  if (status === 'saved') return (
    <span className="flex items-center gap-1 text-xs text-green-400">
      <CheckCircle size={12} /> Saved
    </span>
  )
  if (status === 'error') return (
    <span className="flex items-center gap-1 text-xs text-red-400" title={error}>
      <AlertCircle size={12} /> {error ? error.slice(0, 60) : 'Error'}
    </span>
  )
  return null
}

// ─── Single review card ───────────────────────────────────────────────────────

function ReviewCard({
  item,
  accounts,
  onChange,
  onSave,
  onRemove,
}: {
  item: QueueItem
  accounts: Account[]
  onChange: (id: string, patch: Partial<QueueItem>) => void
  onSave: (id: string) => void
  onRemove: (id: string) => void
}) {
  const isDone = item.status === 'saved'
  const isWorking = item.status === 'parsing' || item.status === 'saving'

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3 transition-opacity',
      isDone ? 'border-green-700/40 bg-green-900/10 opacity-70' : 'border-border bg-surface-2',
    )}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={15} className="text-text-secondary shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate">{item.filename}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={item.status} error={item.error} />
          {!isDone && !isWorking && (
            <button
              onClick={() => onRemove(item.id)}
              className="text-text-secondary hover:text-red-400 transition-colors"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {item.status === 'queued' && (
        <p className="text-xs text-text-secondary">Waiting to parse…</p>
      )}

      {item.parsed && item.status !== 'saved' && (
        <>
          {/* Institution row */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-text-secondary w-24 shrink-0">Institution</span>
            <span className="text-sm font-medium text-primary">{item.parsed.account_label}</span>
            {item.parsed.account_number_hint && (
              <span className="text-xs text-text-secondary">···{item.parsed.account_number_hint}</span>
            )}
          </div>

          {/* Account selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary w-24 shrink-0">Account</label>
            <select
              value={item.selectedAccountId ?? ''}
              onChange={e => onChange(item.id, { selectedAccountId: Number(e.target.value) })}
              disabled={isDone || isWorking}
              className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="">— select account —</option>
              {accounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} ({ACCOUNT_TYPE_LABELS[a.account_type] ?? a.account_type})
                </option>
              ))}
            </select>
          </div>

          {/* Date */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary w-24 shrink-0">Date</label>
            <Input
              type="date"
              value={item.editedDate ?? item.parsed.statement_date ?? ''}
              onChange={e => onChange(item.id, { editedDate: e.target.value })}
              disabled={isDone || isWorking}
              className="flex-1 py-1.5 text-sm"
            />
          </div>

          {/* Balance */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary w-24 shrink-0">Balance</label>
            <Input
              type="number"
              step="0.01"
              value={item.editedBalance ?? (item.parsed.ending_balance != null ? String(item.parsed.ending_balance) : '')}
              onChange={e => onChange(item.id, { editedBalance: e.target.value })}
              disabled={isDone || isWorking}
              placeholder="0.00"
              className="flex-1 py-1.5 text-sm"
            />
            {item.parsed.ending_balance != null && !item.editedBalance && (
              <span className="text-sm font-semibold text-green-400 shrink-0">
                {fmt(item.parsed.ending_balance)}
              </span>
            )}
          </div>

          <div className="pt-1">
            <Button
              onClick={() => onSave(item.id)}
              disabled={!item.selectedAccountId || isWorking}
              size="sm"
            >
              Save Snapshot
            </Button>
          </div>
        </>
      )}

      {item.status === 'saved' && item.parsed && (
        <p className="text-sm text-text-secondary">
          Snapshot saved:{' '}
          <span className="text-text-primary font-medium">
            {fmt(parseFloat(item.editedBalance ?? String(item.parsed.ending_balance ?? 0)))}
          </span>
          {' '}as of{' '}
          <span className="text-text-primary font-medium">
            {fmtDate(item.editedDate ?? item.parsed.statement_date ?? '')}
          </span>
        </p>
      )}
    </div>
  )
}

// ─── Drop zone ────────────────────────────────────────────────────────────────

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false)

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const pdfs = Array.from(e.dataTransfer.files).filter(f =>
      f.name.toLowerCase().endsWith('.pdf')
    )
    if (pdfs.length) onFiles(pdfs)
  }, [onFiles])

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors',
        dragging ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50',
      )}
      onClick={() => {
        const input = document.createElement('input')
        input.type = 'file'
        input.accept = '.pdf'
        input.multiple = true
        input.onchange = () => {
          const files = Array.from(input.files ?? [])
          if (files.length) onFiles(files)
        }
        input.click()
      }}
    >
      <Upload size={28} className="mx-auto mb-3 text-text-secondary" />
      <p className="text-sm font-medium text-text-primary">Drop PDFs here or click to browse</p>
      <p className="text-xs text-text-secondary mt-1">
        EverBank · John Hancock · Charles Schwab · Fidelity NetBenefits
      </p>
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatementsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [queue, setQueue] = useState<QueueItem[]>([])

  useEffect(() => {
    getAccounts().then(setAccounts).catch(console.error)
  }, [])

  const addFiles = useCallback(async (files: File[]) => {
    const newItems: QueueItem[] = files.map(f => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      filename: f.name,
      status: 'parsing',
    }))
    setQueue(prev => [...prev, ...newItems])

    // Parse each file
    for (let i = 0; i < files.length; i++) {
      const item = newItems[i]
      try {
        const parsed = await parseStatement(files[i])
        const autoAccount = bestAccountMatch(accounts, parsed.account_type_hint)
        setQueue(prev => prev.map(q =>
          q.id === item.id
            ? { ...q, status: 'ready', parsed, selectedAccountId: autoAccount }
            : q
        ))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Parse failed'
        setQueue(prev => prev.map(q =>
          q.id === item.id ? { ...q, status: 'error', error: msg } : q
        ))
      }
    }
  }, [accounts])

  const handleChange = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q))
  }, [])

  const handleSave = useCallback(async (id: string) => {
    const item = queue.find(q => q.id === id)
    if (!item || !item.parsed || !item.selectedAccountId) return

    const balance = parseFloat(item.editedBalance ?? String(item.parsed.ending_balance ?? 0))
    const dateStr = item.editedDate ?? item.parsed.statement_date ?? ''

    if (!dateStr) {
      showToast('Please enter a date for this snapshot', 'error')
      return
    }
    if (isNaN(balance)) {
      showToast('Please enter a valid balance', 'error')
      return
    }

    setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'saving' } : q))
    try {
      await createBalanceSnapshot({
        account_id: item.selectedAccountId!,
        date: dateStr,
        balance,
        notes: `Imported from ${item.parsed.institution} statement`,
      })
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'saved' } : q))
      showToast('Snapshot saved', 'success')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Save failed'
      setQueue(prev => prev.map(q => q.id === id ? { ...q, status: 'error', error: msg } : q))
      showToast('Failed to save snapshot', 'error')
    }
  }, [queue])

  const handleRemove = useCallback((id: string) => {
    setQueue(prev => prev.filter(q => q.id !== id))
  }, [])

  const pendingCount = queue.filter(q => q.status === 'ready').length
  const savedCount = queue.filter(q => q.status === 'saved').length

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <Receipt size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Statement Import</h1>
            <p className="text-sm text-text-secondary">
              Upload account statements to create balance snapshots
            </p>
          </div>
        </div>

        {/* Supported formats */}
        <Card className="p-4">
          <p className="text-xs text-text-secondary font-medium uppercase tracking-wide mb-2">Supported formats</p>
          <div className="flex flex-wrap gap-3 text-sm text-text-secondary">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              EverBank (HYSA)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-purple-400 shrink-0" />
              John Hancock (401k)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-green-400 shrink-0" />
              Schwab (IRA / Brokerage)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-yellow-400 shrink-0" />
              Fidelity NetBenefits (401k)
            </span>
          </div>
        </Card>

        {/* Drop zone */}
        <DropZone onFiles={addFiles} />

        {/* Stats */}
        {queue.length > 0 && (
          <div className="flex items-center justify-between text-sm text-text-secondary">
            <span>{queue.length} file{queue.length !== 1 ? 's' : ''} uploaded</span>
            <div className="flex gap-3">
              {pendingCount > 0 && <span className="text-yellow-400">{pendingCount} pending</span>}
              {savedCount > 0 && <span className="text-green-400">{savedCount} saved</span>}
            </div>
          </div>
        )}

        {/* Review queue */}
        {queue.length > 0 && (
          <div className="space-y-3">
            {queue.map(item => (
              <ReviewCard
                key={item.id}
                item={item}
                accounts={accounts}
                onChange={handleChange}
                onSave={handleSave}
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {queue.length === 0 && (
          <div className="text-center py-8 text-text-secondary text-sm">
            Upload one or more statement PDFs to get started.
          </div>
        )}
      </div>
    </AppLayout>
  )
}
