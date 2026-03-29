'use client'

import { useState, useRef, useCallback } from 'react'
import {
  importTransactions,
  previewWideImport,
  commitWideImport,
  getAccounts,
} from '@/lib/api'
import type { WidePreviewRow } from '@/lib/api'
import type { Account } from '@/lib/types'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import { Upload, CheckCircle2, AlertCircle, ChevronDown, ChevronUp, TableProperties } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ImportModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

type Kind = 'income' | 'expense' | 'unknown'

// Group preview rows by description label
interface RowGroup {
  label: string
  kind: Kind
  rows: WidePreviewRow[]
  total: number
  dateRange: string
}

function groupRows(rows: WidePreviewRow[], overrides: Record<string, Kind>): RowGroup[] {
  const map: Record<string, WidePreviewRow[]> = {}
  for (const r of rows) {
    if (!map[r.description]) map[r.description] = []
    map[r.description].push(r)
  }
  return Object.entries(map).map(([label, items]) => {
    const kind: Kind = overrides[label] ?? (items[0].inferred_kind as Kind)
    const sorted = [...items].sort((a, b) => a.date.localeCompare(b.date))
    const total = items.reduce((s, r) => s + r.amount, 0)
    const first = sorted[0].month_label
    const last = sorted[sorted.length - 1].month_label
    const dateRange = first === last ? first : `${first} – ${last}`
    return { label, kind, rows: sorted, total, dateRange }
  })
}

function fmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

// ── Wide preview: one card per row group ──────────────────────────────────────

function GroupCard({
  group,
  onKindChange,
}: {
  group: RowGroup
  onKindChange: (label: string, kind: Kind) => void
}) {
  const [expanded, setExpanded] = useState(false)
  const kindColor = group.kind === 'income'
    ? 'text-green-400'
    : group.kind === 'expense'
    ? 'text-red-400'
    : 'text-yellow-400'

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 bg-surface-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-text-primary truncate">{group.label}</p>
          <p className="text-xs text-text-secondary">
            {group.rows.length} months &nbsp;·&nbsp; {group.dateRange}
          </p>
        </div>

        {/* Kind selector */}
        <select
          value={group.kind}
          onChange={e => onKindChange(group.label, e.target.value as Kind)}
          className={cn(
            'bg-surface border border-border rounded-lg px-2 py-1 text-xs font-medium focus:outline-none focus:border-primary',
            kindColor,
          )}
        >
          <option value="income">Income (+)</option>
          <option value="expense">Expense (–)</option>
          <option value="unknown">Unknown</option>
        </select>

        <span className={cn('text-sm font-semibold shrink-0', kindColor)}>
          {fmt(group.total)}
        </span>

        <button
          onClick={() => setExpanded(v => !v)}
          className="text-text-secondary hover:text-text-primary"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {/* Expanded month rows */}
      {expanded && (
        <div className="divide-y divide-border/50">
          {group.rows.map(r => (
            <div key={r.date} className="flex items-center justify-between px-4 py-2">
              <span className="text-xs text-text-secondary w-20">{r.month_label}</span>
              <span className={cn('text-xs font-medium', kindColor)}>
                {group.kind === 'expense' ? '–' : '+'}{fmt(r.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Tab: Standard CSV import ──────────────────────────────────────────────────

function StandardTab({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<{ imported: number; errors: string[] } | null>(null)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleImport = async () => {
    if (!file) return
    setLoading(true)
    setError('')
    try {
      const res = await importTransactions(file)
      setResult(res)
      onSuccess()
    } catch {
      setError('Import failed. Please check your file format.')
    } finally {
      setLoading(false)
    }
  }

  if (result) {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <CheckCircle2 size={48} className="text-primary" />
        <div className="text-center">
          <p className="text-lg font-semibold text-text-primary">Import Complete!</p>
          <p className="text-text-secondary text-sm">{result.imported} transactions imported</p>
        </div>
        {result.errors.length > 0 && (
          <div className="w-full max-h-32 overflow-y-auto bg-surface-2 rounded-xl p-3">
            {result.errors.map((e, i) => <p key={i} className="text-xs text-danger mb-1">{e}</p>)}
          </div>
        )}
        <Button variant="primary" onClick={onClose} className="w-full">Done</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-text-secondary">
        Upload a CSV with columns: date, description, amount, account, category.
      </p>
      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2">
          <AlertCircle size={16} />{error}
        </div>
      )}
      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-[#2d3748] rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary transition-colors"
      >
        <Upload size={32} className="text-muted" />
        {file ? (
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">{file.name}</p>
            <p className="text-xs text-text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <div className="text-center">
            <p className="text-sm text-text-primary">Click to select a CSV file</p>
            <p className="text-xs text-text-secondary">or drag and drop</p>
          </div>
        )}
        <input ref={inputRef} type="file" accept=".csv,.xlsx" onChange={e => { if (e.target.files?.[0]) setFile(e.target.files[0]) }} className="hidden" />
      </div>
      <div className="flex gap-3">
        <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
        <Button variant="primary" onClick={handleImport} loading={loading} disabled={!file} className="flex-1">Import</Button>
      </div>
    </div>
  )
}

// ── Tab: Wide-format (monthly summary) ───────────────────────────────────────

function WideTab({ onSuccess, onClose }: { onSuccess: () => void; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rows, setRows] = useState<WidePreviewRow[]>([])
  const [overrides, setOverrides] = useState<Record<string, Kind>>({})
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountId, setAccountId] = useState<number | undefined>()
  const [result, setResult] = useState<{ imported: number; duplicates: number } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(async (f: File) => {
    setFile(f)
    setLoading(true)
    setError('')
    try {
      const [preview, accs] = await Promise.all([
        previewWideImport(f),
        getAccounts(),
      ])
      if (preview.errors.length && !preview.rows.length) {
        setError(preview.errors.join(' · '))
        setLoading(false)
        return
      }
      setRows(preview.rows)
      setAccounts(accs)
      if (preview.errors.length) {
        setError('Some rows were skipped: ' + preview.errors.join(' · '))
      }
      setStep('preview')
    } catch {
      setError('Could not parse file. Check it matches the expected format.')
    } finally {
      setLoading(false)
    }
  }, [])

  const groups = groupRows(rows, overrides)
  const totalTxns = rows.length

  const handleCommit = async () => {
    setLoading(true)
    setError('')
    try {
      // Apply user's kind overrides and sign amounts
      const txns = rows.map(r => {
        const kind: Kind = overrides[r.description] ?? (r.inferred_kind as Kind)
        const amount = kind === 'expense' ? -Math.abs(r.amount) : Math.abs(r.amount)
        return { description: r.description, date: r.date, amount, kind }
      })
      const res = await commitWideImport(txns, accountId)
      setResult({ imported: res.imported, duplicates: res.duplicates })
      if (res.errors.length) setError(res.errors.join(' · '))
      setStep('done')
      onSuccess()
    } catch {
      setError('Import failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  if (step === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-4">
        <CheckCircle2 size={48} className="text-primary" />
        <div className="text-center">
          <p className="text-lg font-semibold text-text-primary">Import Complete!</p>
          <p className="text-text-secondary text-sm">{result?.imported} transactions imported</p>
          {(result?.duplicates ?? 0) > 0 && (
            <p className="text-xs text-text-secondary mt-1">{result?.duplicates} duplicates skipped</p>
          )}
        </div>
        {error && <p className="text-xs text-yellow-400 text-center">{error}</p>}
        <Button variant="primary" onClick={onClose} className="w-full">Done</Button>
      </div>
    )
  }

  if (step === 'preview') {
    return (
      <div className="flex flex-col gap-4">
        {/* File info */}
        <div className="flex items-center justify-between text-sm">
          <span className="text-text-secondary">
            <span className="text-text-primary font-medium">{file?.name}</span>
            &nbsp;·&nbsp;{totalTxns} transactions across {groups.length} row{groups.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => { setStep('upload'); setFile(null); setRows([]); setOverrides({}); setError('') }}
            className="text-xs text-text-secondary hover:text-primary"
          >
            Change file
          </button>
        </div>

        {error && (
          <div className="p-2 rounded-lg bg-yellow-900/20 border border-yellow-700/40 text-yellow-400 text-xs">
            {error}
          </div>
        )}

        {/* Row groups */}
        <div className="flex flex-col gap-2 max-h-72 overflow-y-auto pr-1">
          {groups.map(g => (
            <GroupCard
              key={g.label}
              group={g}
              onKindChange={(label, kind) => setOverrides(prev => ({ ...prev, [label]: kind }))}
            />
          ))}
        </div>

        {/* Account picker */}
        <div className="flex items-center gap-3">
          <label className="text-xs text-text-secondary w-20 shrink-0">Account</label>
          <select
            value={accountId ?? ''}
            onChange={e => setAccountId(e.target.value ? Number(e.target.value) : undefined)}
            className="flex-1 bg-surface border border-border rounded-lg px-3 py-1.5 text-sm text-text-primary focus:outline-none focus:border-primary"
          >
            <option value="">— none (unlinked) —</option>
            {accounts.map(a => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>
        </div>

        <div className="flex gap-3 pt-1">
          <Button variant="secondary" onClick={onClose} className="flex-1">Cancel</Button>
          <Button variant="primary" onClick={handleCommit} loading={loading} className="flex-1">
            Import {totalTxns} Transaction{totalTxns !== 1 ? 's' : ''}
          </Button>
        </div>
      </div>
    )
  }

  // Upload step
  return (
    <div className="flex flex-col gap-4">
      <div className="p-3 rounded-xl bg-surface-2 border border-border text-xs text-text-secondary space-y-1">
        <p className="font-medium text-text-primary">Expected format</p>
        <p>First row: <span className="text-text-primary">Months</span>, September2024, October2024, …</p>
        <p>Data rows: <span className="text-text-primary">Row label</span>, value, value, …</p>
        <p>Row labels with "Income" are imported as positive; "Expense" as negative. You can override per row in the preview.</p>
      </div>

      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm flex items-center gap-2">
          <AlertCircle size={16} />{error}
        </div>
      )}

      <div
        onClick={() => inputRef.current?.click()}
        className="border-2 border-dashed border-[#2d3748] rounded-xl p-8 flex flex-col items-center gap-3 cursor-pointer hover:border-primary transition-colors"
      >
        {loading ? (
          <p className="text-sm text-text-secondary">Parsing…</p>
        ) : file ? (
          <div className="text-center">
            <p className="text-sm font-medium text-text-primary">{file.name}</p>
            <p className="text-xs text-text-secondary">{(file.size / 1024).toFixed(1)} KB</p>
          </div>
        ) : (
          <>
            <TableProperties size={32} className="text-muted" />
            <div className="text-center">
              <p className="text-sm text-text-primary">Click to select a monthly summary CSV</p>
              <p className="text-xs text-text-secondary">Columns = months, rows = income/expense categories</p>
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]) }}
          className="hidden"
        />
      </div>

      <Button variant="secondary" onClick={onClose} className="w-full">Cancel</Button>
    </div>
  )
}

// ── Main modal ────────────────────────────────────────────────────────────────

export default function ImportModal({ isOpen, onClose, onSuccess }: ImportModalProps) {
  const [tab, setTab] = useState<'standard' | 'wide'>('standard')

  const handleClose = () => {
    setTab('standard')
    onClose()
  }

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Import Transactions" size="lg">
      {/* Tab bar */}
      <div className="flex gap-1 p-1 bg-surface-2 rounded-xl mb-5">
        {(['standard', 'wide'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors',
              tab === t
                ? 'bg-surface text-text-primary shadow-sm'
                : 'text-text-secondary hover:text-text-primary',
            )}
          >
            {t === 'standard' ? 'Standard CSV' : 'Monthly Summary'}
          </button>
        ))}
      </div>

      {tab === 'standard'
        ? <StandardTab onSuccess={onSuccess} onClose={handleClose} />
        : <WideTab onSuccess={onSuccess} onClose={handleClose} />
      }
    </Modal>
  )
}
