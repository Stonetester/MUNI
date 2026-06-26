'use client'

import { useState, useCallback } from 'react'
import { showToast } from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { parseStatementFull, applyStatement } from '@/lib/api'
import type { ParsedStatementFull } from '@/lib/api'
import type { Account } from '@/lib/types'
import { formatCurrency, accountTypeLabel } from '@/lib/utils'
import {
  Upload, CheckCircle, AlertCircle, Loader2, FileText, X,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type ItemStatus = 'parsing' | 'ready' | 'saving' | 'saved' | 'error'

interface QueueItem {
  id: string
  filename: string
  status: ItemStatus
  parsed?: ParsedStatementFull
  error?: string
  selectedAccountId?: number
  editedDate?: string
  editedBalance?: string
  result?: { holdings_created: number; holdings_upserted: number; holdings_removed: number }
}

// institution type hint → likely account types (preference order)
const TYPE_HINT_MAP: Record<string, string[]> = {
  hysa: ['hysa', 'savings'],
  retirement_401k: ['401k'],
  '401k': ['401k'],
  ira: ['ira', 'brokerage'],
  brokerage: ['brokerage', 'ira'],
}

function bestAccountMatch(accounts: Account[], typeHint: string): number | undefined {
  const preferred = TYPE_HINT_MAP[typeHint] ?? [typeHint]
  for (const t of preferred) {
    const match = accounts.find((a) => a.account_type === t)
    if (match) return match.id
  }
  return undefined
}

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
      <AlertCircle size={12} /> {error ? error.slice(0, 50) : 'Error'}
    </span>
  )
  return null
}

function DropZone({ onFiles }: { onFiles: (files: File[]) => void }) {
  const [dragging, setDragging] = useState(false)
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const pdfs = Array.from(e.dataTransfer.files).filter((f) => f.name.toLowerCase().endsWith('.pdf'))
    if (pdfs.length) onFiles(pdfs)
  }, [onFiles])
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      className={cn(
        'border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors',
        dragging ? 'border-primary bg-primary/10' : 'border-[#2d3748] hover:border-primary/50',
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
      <Upload size={26} className="mx-auto mb-2 text-text-secondary" />
      <p className="text-sm font-medium text-text-primary">Drop investment statements here or click to browse</p>
      <p className="text-xs text-text-secondary mt-1">
        Schwab · John Hancock · Fidelity NetBenefits — parses holdings &amp; contributions
      </p>
    </div>
  )
}

function ReviewCard({
  item, accounts, onChange, onApply, onRemove,
}: {
  item: QueueItem
  accounts: Account[]
  onChange: (id: string, patch: Partial<QueueItem>) => void
  onApply: (id: string) => void
  onRemove: (id: string) => void
}) {
  const isDone = item.status === 'saved'
  const isWorking = item.status === 'parsing' || item.status === 'saving'
  const p = item.parsed

  return (
    <div className={cn(
      'rounded-xl border p-4 space-y-3',
      isDone ? 'border-green-700/40 bg-green-900/10' : 'border-[#2d3748] bg-surface-2',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={15} className="text-text-secondary shrink-0" />
          <span className="text-sm font-medium text-text-primary truncate">{item.filename}</span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <StatusBadge status={item.status} error={item.error} />
          {!isDone && !isWorking && (
            <button onClick={() => onRemove(item.id)} className="text-text-secondary hover:text-red-400">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {p && item.status !== 'saved' && (
        <>
          {/* Institution + PRR */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-primary">{p.account_label}</span>
            {p.personal_rate_of_return != null && (
              <span className="text-xs text-text-secondary">
                stated rate of return: <span className="text-text-primary font-medium">{p.personal_rate_of_return.toFixed(1)}%</span>
              </span>
            )}
          </div>

          {/* Account selector */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-text-secondary w-20 shrink-0">Account</label>
            <select
              value={item.selectedAccountId ?? ''}
              onChange={(e) => onChange(item.id, { selectedAccountId: Number(e.target.value) })}
              disabled={isWorking}
              className="flex-1 bg-surface border border-[#2d3748] rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary"
            >
              <option value="">— select account —</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} ({accountTypeLabel(a.account_type)})
                </option>
              ))}
            </select>
          </div>

          {/* Date + balance */}
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">Statement date</label>
              <Input
                type="date"
                value={item.editedDate ?? p.statement_date ?? ''}
                onChange={(e) => onChange(item.id, { editedDate: e.target.value })}
                disabled={isWorking}
                className="py-1.5 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-xs text-text-secondary">Ending balance</label>
              <Input
                type="number"
                step="0.01"
                value={item.editedBalance ?? (p.ending_balance != null ? String(p.ending_balance) : '')}
                onChange={(e) => onChange(item.id, { editedBalance: e.target.value })}
                disabled={isWorking}
                placeholder="0.00"
                className="py-1.5 text-sm"
              />
            </div>
          </div>

          {/* Parsed holdings */}
          {p.holdings.length > 0 ? (
            <div className="rounded-lg border border-[#2d3748] overflow-hidden">
              <div className="px-3 py-1.5 bg-surface text-[11px] font-semibold text-text-secondary uppercase tracking-wider flex justify-between">
                <span>{p.holdings.length} holdings parsed</span>
                <span>{formatCurrency(p.holdings.reduce((s, h) => s + (h.value ?? 0), 0))}</span>
              </div>
              <div className="max-h-44 overflow-y-auto divide-y divide-[#2d3748]/40">
                {p.holdings.map((h, i) => (
                  <div key={i} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="text-text-primary truncate">{h.fund_name || h.ticker}</span>
                    <span className="text-text-secondary shrink-0">
                      {h.value != null ? formatCurrency(h.value) : '—'}
                      {h.weight_percent != null && <span className="ml-1.5 text-[11px]">{h.weight_percent.toFixed(1)}%</span>}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-xs text-text-secondary">
              No holdings table found in this statement — only the balance snapshot will be saved.
            </p>
          )}

          <div className="flex items-center gap-2 pt-1">
            <Button onClick={() => onApply(item.id)} disabled={!item.selectedAccountId || isWorking} size="sm">
              Apply to Account
            </Button>
            <span className="text-[11px] text-text-secondary">
              Saves a balance snapshot{p.holdings.length > 0 ? ' + updates holdings' : ''}.
            </span>
          </div>
        </>
      )}

      {item.status === 'saved' && item.result && (
        <p className="text-sm text-text-secondary">
          Applied:{' '}
          <span className="text-text-primary font-medium">
            {item.result.holdings_created} new
          </span>
          {' · '}{item.result.holdings_upserted} updated
          {item.result.holdings_removed > 0 && <> · {item.result.holdings_removed} sold-position{item.result.holdings_removed !== 1 ? 's' : ''} pruned</>}
          {' holdings'}
        </p>
      )}
    </div>
  )
}

export default function StatementReviewPanel({
  accounts, onApplied,
}: {
  accounts: Account[]
  onApplied: () => void
}) {
  const [queue, setQueue] = useState<QueueItem[]>([])

  const addFiles = useCallback(async (files: File[]) => {
    const newItems: QueueItem[] = files.map((f) => ({
      id: `${f.name}-${Date.now()}-${Math.random()}`,
      filename: f.name,
      status: 'parsing',
    }))
    setQueue((prev) => [...prev, ...newItems])

    for (let i = 0; i < files.length; i++) {
      const item = newItems[i]
      try {
        const parsed = await parseStatementFull(files[i])
        const autoAccount = bestAccountMatch(accounts, parsed.account_type_hint)
        setQueue((prev) => prev.map((q) =>
          q.id === item.id ? { ...q, status: 'ready', parsed, selectedAccountId: autoAccount } : q,
        ))
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Parse failed'
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'error', error: msg } : q))
      }
    }
  }, [accounts])

  const handleChange = useCallback((id: string, patch: Partial<QueueItem>) => {
    setQueue((prev) => prev.map((q) => q.id === id ? { ...q, ...patch } : q))
  }, [])

  const handleApply = useCallback(async (id: string) => {
    let target: QueueItem | undefined
    setQueue((prev) => { target = prev.find((q) => q.id === id); return prev })
    const item = target
    if (!item || !item.parsed || !item.selectedAccountId) return

    const balanceStr = item.editedBalance ?? (item.parsed.ending_balance != null ? String(item.parsed.ending_balance) : '')
    const balance = balanceStr === '' ? null : parseFloat(balanceStr)
    const dateStr = item.editedDate ?? item.parsed.statement_date ?? ''

    if (!dateStr) { showToast('Please enter a statement date', 'error'); return }
    if (balance !== null && isNaN(balance)) { showToast('Invalid balance', 'error'); return }

    setQueue((prev) => prev.map((q) => q.id === id ? { ...q, status: 'saving' } : q))
    try {
      const result = await applyStatement({
        account_id: item.selectedAccountId,
        statement_date: dateStr,
        ending_balance: balance,
        holdings: item.parsed.holdings
          .filter((h) => h.value != null)
          .map((h) => ({ ticker: h.ticker, fund_name: h.fund_name, value: h.value as number, weight_percent: h.weight_percent })),
      })
      setQueue((prev) => prev.map((q) => q.id === id ? { ...q, status: 'saved', result } : q))
      showToast('Statement applied', 'success')
      onApplied()
    } catch (err: unknown) {
      const axiosDetail = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      const msg = axiosDetail ?? (err instanceof Error ? err.message : 'Apply failed')
      setQueue((prev) => prev.map((q) => q.id === id ? { ...q, status: 'error', error: msg } : q))
      showToast(msg, 'error')
    }
  }, [onApplied])

  const handleRemove = useCallback((id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id))
  }, [])

  return (
    <Card className="space-y-4">
      <DropZone onFiles={addFiles} />
      {queue.length > 0 && (
        <div className="space-y-3">
          {queue.map((item) => (
            <ReviewCard
              key={item.id}
              item={item}
              accounts={accounts}
              onChange={handleChange}
              onApply={handleApply}
              onRemove={handleRemove}
            />
          ))}
        </div>
      )}
    </Card>
  )
}
