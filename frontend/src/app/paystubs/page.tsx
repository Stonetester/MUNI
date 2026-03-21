'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { parsePaystub, savePaystub, getPaystubs, deletePaystub, updatePaystub, deleteAllPaystubs } from '@/lib/api'
import type { Paystub, ParsedPaystub } from '@/lib/types'
import {
  FileText, Upload, CheckCircle, Trash2, ChevronDown, ChevronUp,
  AlertCircle, FolderOpen, Clock, Loader2, SkipForward, Save,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function fmt(n?: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n)
}

function fmtDate(s?: string | null) {
  if (!s) return '—'
  return new Date(s).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

// ─── Batch queue types ─────────────────────────────────────────────────────────
type BatchStatus = 'queued' | 'parsing' | 'done' | 'error' | 'saving' | 'saved' | 'skipped' | 'duplicate'

interface BatchItem {
  id: string
  filename: string
  status: BatchStatus
  result?: ParsedPaystub
  error?: string
  edited?: Partial<Paystub>  // user overrides before save
}

// ─── Collect PDFs from a dropped folder (FileSystem API) ──────────────────────
async function collectPDFs(items: DataTransferItemList): Promise<File[]> {
  const files: File[] = []

  function getFile(entry: FileSystemFileEntry): Promise<File> {
    return new Promise(resolve => entry.file(resolve))
  }

  async function readDir(entry: FileSystemDirectoryEntry): Promise<void> {
    const reader = entry.createReader()
    await new Promise<void>(resolve => {
      reader.readEntries(async (entries) => {
        for (const e of entries) {
          if (e.isFile) {
            const fe = e as FileSystemFileEntry
            const f = await getFile(fe)
            if (f.name.toLowerCase().endsWith('.pdf')) files.push(f)
          } else if (e.isDirectory) {
            await readDir(e as FileSystemDirectoryEntry)
          }
        }
        resolve()
      })
    })
  }

  for (let i = 0; i < items.length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const entry = (items[i] as any).webkitGetAsEntry?.()
    if (!entry) continue
    if (entry.isFile) {
      const f = await getFile(entry as FileSystemFileEntry)
      if (f.name.toLowerCase().endsWith('.pdf')) files.push(f)
    } else if (entry.isDirectory) {
      await readDir(entry as FileSystemDirectoryEntry)
    }
  }

  return files
}

// ─── Upload zone (single + multi) ─────────────────────────────────────────────
function UploadZone({
  onSingle,
  onMultiple,
}: {
  onSingle: (result: ParsedPaystub) => void
  onMultiple: (files: File[]) => void
}) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const folderRef = useRef<HTMLInputElement>(null)

  const processFiles = async (files: File[]) => {
    if (files.length === 0) return
    if (files.length === 1) {
      setLoading(true)
      setError('')
      try {
        const result = await parsePaystub(files[0])
        onSingle(result)
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
        setError(msg || 'Failed to parse PDF. Check that it is a digital (not scanned) paystub.')
      } finally {
        setLoading(false)
      }
    } else {
      onMultiple(files)
    }
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    setError('')
    const items = e.dataTransfer.items
    if (items && items.length > 0) {
      const pdfs = await collectPDFs(items)
      if (pdfs.length === 0) {
        setError('No PDF files found. Drop a PDF file or a folder containing PDFs.')
        return
      }
      await processFiles(pdfs)
    }
  }

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => f.name.toLowerCase().endsWith('.pdf'))
    e.target.value = ''
    await processFiles(files)
  }

  return (
    <div className="flex flex-col gap-3">
      <div
        className={cn(
          'border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-[#2d3748] hover:border-primary/50 hover:bg-surface-2'
        )}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => inputRef.current?.click()}
      >
        {/* single or multiple files */}
        <input ref={inputRef} type="file" accept=".pdf" multiple className="hidden" onChange={handleFileInput} />
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Upload size={24} className="text-primary" />
        </div>
        <div className="text-center">
          <p className="text-sm font-semibold text-text-primary">Drop paystub PDFs here</p>
          <p className="text-xs text-text-secondary mt-1">Single file, multiple files, or an entire folder · Paylocity format</p>
        </div>
        {loading && <p className="text-xs text-primary animate-pulse">Parsing PDF…</p>}
        {error && (
          <div className="flex items-center gap-2 text-danger text-xs">
            <AlertCircle size={14} /> {error}
          </div>
        )}
      </div>

      {/* Folder picker button */}
      <button
        className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-[#2d3748] text-xs text-text-secondary hover:border-primary/40 hover:text-text-primary transition-colors"
        onClick={() => folderRef.current?.click()}
        type="button"
      >
        <input
          ref={folderRef}
          type="file"
          // @ts-expect-error webkitdirectory is not in typedefs but works in all browsers
          webkitdirectory=""
          multiple
          className="hidden"
          onChange={handleFileInput}
        />
        <FolderOpen size={14} />
        Choose folder of paystubs
      </button>
    </div>
  )
}

// ─── Batch queue view ──────────────────────────────────────────────────────────
function BatchQueueView({
  queue,
  onQueueChange,
  onDone,
}: {
  queue: BatchItem[]
  onQueueChange: (q: BatchItem[]) => void
  onDone: () => void
}) {
  const [expanded, setExpanded] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  // Always reflects the latest queue in async callbacks (avoids stale-closure overwrites)
  const queueRef = useRef(queue)
  queueRef.current = queue

  const update = (id: string, changes: Partial<BatchItem>) =>
    onQueueChange(queueRef.current.map(item => item.id === id ? { ...item, ...changes } : item))

  const saveItem = async (item: BatchItem) => {
    if (!item.result) return
    update(item.id, { status: 'saving' })
    const data: Partial<Paystub> = { pay_date: todayISO(), ...item.result.parsed, ...item.edited }
    try {
      await savePaystub(data)
      update(item.id, { status: 'saved' })
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 409) {
        update(item.id, { status: 'duplicate', error: 'Already saved — pay date exists in history' })
      } else {
        update(item.id, { status: 'error', error: 'Save failed' })
      }
    }
  }

  const saveAll = async () => {
    setSavingAll(true)
    try {
      // Snapshot the items to save at click-time; update reads fresh state via queueRef
      const toSave = queueRef.current.filter(i => i.status === 'done')
      for (const item of toSave) {
        await saveItem(item)
      }
    } finally {
      setSavingAll(false)
    }
  }

  const pending = queue.filter(i => i.status === 'done').length
  const saved = queue.filter(i => i.status === 'saved').length
  const errors = queue.filter(i => i.status === 'error').length
  const duplicates = queue.filter(i => i.status === 'duplicate').length
  const skipped = queue.filter(i => i.status === 'skipped').length
  const parsing = queue.filter(i => i.status === 'queued' || i.status === 'parsing').length

  return (
    <Card title={`Batch Upload — ${queue.length} file${queue.length !== 1 ? 's' : ''}`}>
      {/* Progress summary */}
      <div className="flex items-center gap-4 text-xs mb-4 flex-wrap">
        {parsing > 0 && <span className="flex items-center gap-1 text-primary"><Loader2 size={12} className="animate-spin" /> {parsing} parsing</span>}
        {pending > 0 && <span className="flex items-center gap-1 text-text-secondary"><Clock size={12} /> {pending} ready to save</span>}
        {saved > 0 && <span className="flex items-center gap-1 text-green-400"><CheckCircle size={12} /> {saved} saved</span>}
        {skipped > 0 && <span className="text-muted">{skipped} skipped</span>}
        {duplicates > 0 && <span className="flex items-center gap-1 text-yellow-400"><AlertCircle size={12} /> {duplicates} duplicate{duplicates !== 1 ? 's' : ''}</span>}
        {errors > 0 && <span className="flex items-center gap-1 text-danger"><AlertCircle size={12} /> {errors} error{errors !== 1 ? 's' : ''}</span>}
      </div>

      {/* Item list */}
      <div className="flex flex-col gap-2 mb-4">
        {queue.map(item => (
          <div key={item.id} className={cn(
            'rounded-xl border overflow-hidden transition-colors',
            item.status === 'saved' ? 'border-green-500/20 bg-green-500/5' :
            item.status === 'error' ? 'border-danger/20 bg-danger/5' :
            item.status === 'duplicate' ? 'border-yellow-500/20 bg-yellow-500/5' :
            item.status === 'skipped' ? 'border-[#2d3748] opacity-40' :
            'border-[#2d3748] bg-surface'
          )}>
            {/* Row header */}
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="shrink-0">
                {item.status === 'queued' && <Clock size={16} className="text-muted" />}
                {item.status === 'parsing' && <Loader2 size={16} className="text-primary animate-spin" />}
                {item.status === 'done' && <FileText size={16} className={item.result?.parsed.pay_type === 'bonus' ? 'text-yellow-400' : 'text-primary'} />}
                {item.status === 'saving' && <Loader2 size={16} className="text-primary animate-spin" />}
                {item.status === 'saved' && <CheckCircle size={16} className="text-green-400" />}
                {item.status === 'error' && <AlertCircle size={16} className="text-danger" />}
                {item.status === 'duplicate' && <AlertCircle size={16} className="text-yellow-400" />}
                {item.status === 'skipped' && <SkipForward size={16} className="text-muted" />}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-sm font-medium text-text-primary truncate">{item.filename}</p>
                  {item.result?.parsed.pay_type === 'bonus' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-semibold uppercase tracking-wider shrink-0">Bonus</span>
                  )}
                  {item.error && <p className="text-xs text-danger">{item.error}</p>}
                </div>
                {item.status === 'done' || item.status === 'saving' || item.status === 'saved' ? (
                  <p className="text-xs text-text-secondary">
                    {fmtDate(item.result?.parsed.pay_date as string | undefined)} · Net {fmt(item.result?.parsed.net_pay)} · {item.result?.parse_method}
                  </p>
                ) : null}
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 shrink-0">
                {item.status === 'done' && (
                  <>
                    <button
                      onClick={() => setExpanded(expanded === item.id ? null : item.id)}
                      className="text-xs text-text-secondary hover:text-text-primary px-2 py-1 rounded hover:bg-surface-2 transition-colors"
                    >
                      Edit {expanded === item.id ? <ChevronUp size={12} className="inline" /> : <ChevronDown size={12} className="inline" />}
                    </button>
                    <button
                      onClick={() => update(item.id, { status: 'skipped' })}
                      className="text-xs text-muted hover:text-text-secondary px-2 py-1 rounded hover:bg-surface-2 transition-colors"
                    >
                      Skip
                    </button>
                    <button
                      onClick={() => saveItem(item)}
                      className="text-xs text-primary hover:text-primary/80 px-2 py-1 rounded hover:bg-primary/10 transition-colors font-semibold"
                    >
                      Save
                    </button>
                  </>
                )}
                {item.status === 'skipped' && (
                  <button
                    onClick={() => update(item.id, { status: 'done' })}
                    className="text-xs text-muted hover:text-text-secondary px-2 py-1 rounded hover:bg-surface-2 transition-colors"
                  >
                    Restore
                  </button>
                )}
              </div>
            </div>

            {/* Inline edit form (collapsed by default) */}
            {expanded === item.id && item.result && (
              <div className="border-t border-[#2d3748] px-4 py-3 grid grid-cols-2 gap-3">
                {[
                  { key: 'pay_date', label: 'Pay Date', type: 'date' },
                  { key: 'net_pay', label: 'Net Pay ($)', type: 'number' },
                  { key: 'gross_pay', label: 'Gross Pay ($)', type: 'number' },
                  { key: 'employer_401k', label: 'Employer 401k ($)', type: 'number' },
                ].map(({ key, label, type }) => {
                  const raw = { ...item.result!.parsed, ...item.edited }[key as keyof Paystub]
                  return (
                    <Input
                      key={key}
                      label={label}
                      type={type}
                      step={type === 'number' ? '0.01' : undefined}
                      value={raw?.toString() ?? ''}
                      onChange={e => {
                        const val = type === 'number' ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value
                        update(item.id, { edited: { ...item.edited, [key]: val } })
                      }}
                    />
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-3 flex-wrap">
        {(pending > 0 || savingAll) && (
          <Button variant="primary" onClick={saveAll} disabled={savingAll} loading={savingAll}>
            {savingAll
              ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
              : <><Save size={14} /> Save All ({pending})</>
            }
          </Button>
        )}
        <Button variant="ghost" onClick={onDone} disabled={savingAll}>
          {parsing > 0 ? 'Processing…' : 'Done'}
        </Button>
      </div>
    </Card>
  )
}

// ─── Batch processor — parses files one by one ────────────────────────────────
function useBatchProcessor(queue: BatchItem[], onQueueChange: (q: BatchItem[]) => void) {
  const processingRef = useRef(false)
  const queueRef = useRef(queue)
  queueRef.current = queue

  useEffect(() => {
    if (processingRef.current) return
    const nextQueued = queueRef.current.find(i => i.status === 'queued')
    if (!nextQueued) return

    processingRef.current = true
    ;(async () => {
      try {
        // We store the file on the item temporarily — need a file map
        // The file is passed via a data attribute workaround: we store it on window
        const fileMap = (window as unknown as Record<string, Map<string, File>>)['__paystubFiles__']
        const file = fileMap?.get(nextQueued.id)
        if (!file) {
          onQueueChange(queueRef.current.map(i => i.id === nextQueued.id ? { ...i, status: 'error', error: 'File reference lost' } : i))
          return
        }
        onQueueChange(queueRef.current.map(i => i.id === nextQueued.id ? { ...i, status: 'parsing' } : i))
        const result = await parsePaystub(file)
        onQueueChange(queueRef.current.map(i => i.id === nextQueued.id ? { ...i, status: 'done', result } : i))
      } catch {
        onQueueChange(queueRef.current.map(i => i.id === nextQueued.id ? { ...i, status: 'error', error: 'Parse failed — check PDF is digital (not scanned)' } : i))
      } finally {
        processingRef.current = false
      }
    })()
  })
}

// ─── Parsed review form (single file) ────────────────────────────────────────
function ReviewForm({ parsed, onSaved, onCancel }: { parsed: ParsedPaystub; onSaved: () => void; onCancel: () => void }) {
  const [form, setForm] = useState<Partial<Paystub>>({
    pay_date: todayISO(),
    ...parsed.parsed,
  })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  const f = (key: keyof Paystub) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.type === 'number' ? (e.target.value ? parseFloat(e.target.value) : undefined) : e.target.value
    setForm(prev => ({ ...prev, [key]: val }))
  }

  const handleSave = async () => {
    if (!form.pay_date) { setError('Pay date is required.'); return }
    setSaving(true)
    setError('')
    try {
      await savePaystub(form)
      setSaved(true)
      setTimeout(() => { setSaved(false); onSaved() }, 1000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to save paystub.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card title="Review Parsed Paystub" action={
      <span className="text-xs px-2 py-1 rounded-lg bg-primary/10 text-primary">
        via {parsed.parse_method}
      </span>
    }>
      <div className="flex flex-col gap-4">
        {error && (
          <div className="flex items-center gap-2 p-3 rounded-xl bg-danger/10 border border-danger/20 text-danger text-sm">
            <AlertCircle size={14} className="shrink-0" /> {error}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Input label="Employer" value={form.employer ?? ''} onChange={f('employer')} />
          <Input label="Pay Date *" type="date" value={form.pay_date ?? ''} onChange={f('pay_date')} />
          <Input label="Period Start" type="date" value={form.period_start ?? ''} onChange={f('period_start')} />
          <Input label="Period End" type="date" value={form.period_end ?? ''} onChange={f('period_end')} />
        </div>

        <div className="h-px bg-[#2d3748]" />
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Earnings</p>

        <div className="flex items-center gap-3">
          <p className="text-xs text-muted">Pay Type:</p>
          {(['regular', 'bonus'] as const).map(type => (
            <button
              key={type}
              onClick={() => setForm(prev => ({ ...prev, pay_type: type }))}
              className={cn(
                'px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors',
                form.pay_type === type
                  ? type === 'bonus' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-primary/20 text-primary'
                  : 'bg-surface text-muted hover:text-text-secondary'
              )}
            >
              {type}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Input label="Gross Pay ($)" type="number" step="0.01" value={form.gross_pay?.toString() ?? ''} onChange={f('gross_pay')} />
          <Input label="Regular Pay ($)" type="number" step="0.01" value={form.regular_pay?.toString() ?? ''} onChange={f('regular_pay')} />
          {form.pay_type === 'bonus' && (
            <Input label="Bonus Pay ($)" type="number" step="0.01" value={form.bonus_pay?.toString() ?? ''} onChange={f('bonus_pay')} />
          )}
          <Input label="Net Pay ($)" type="number" step="0.01" value={form.net_pay?.toString() ?? ''} onChange={f('net_pay')} />
          <Input label="Employer 401k ($)" type="number" step="0.01" value={form.employer_401k?.toString() ?? ''} onChange={f('employer_401k')} />
        </div>

        <div className="h-px bg-[#2d3748]" />
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Taxes</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Federal Tax ($)" type="number" step="0.01" value={form.tax_federal?.toString() ?? ''} onChange={f('tax_federal')} />
          <Input label="MD State ($)" type="number" step="0.01" value={form.tax_state?.toString() ?? ''} onChange={f('tax_state')} />
          <Input label="MD County ($)" type="number" step="0.01" value={form.tax_county?.toString() ?? ''} onChange={f('tax_county')} />
          <Input label="Social Security ($)" type="number" step="0.01" value={form.tax_social_security?.toString() ?? ''} onChange={f('tax_social_security')} />
          <Input label="Medicare ($)" type="number" step="0.01" value={form.tax_medicare?.toString() ?? ''} onChange={f('tax_medicare')} />
        </div>

        <div className="h-px bg-[#2d3748]" />
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Deductions</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="401k Employee ($)" type="number" step="0.01" value={form.deduction_401k?.toString() ?? ''} onChange={f('deduction_401k')} />
          <Input label="Vision ($)" type="number" step="0.01" value={form.deduction_vision?.toString() ?? ''} onChange={f('deduction_vision')} />
        </div>

        <div className="h-px bg-[#2d3748]" />
        <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Year-to-Date</p>
        <div className="grid grid-cols-2 gap-3">
          <Input label="YTD Gross ($)" type="number" step="0.01" value={form.ytd_gross?.toString() ?? ''} onChange={f('ytd_gross')} />
          <Input label="YTD Net ($)" type="number" step="0.01" value={form.ytd_net?.toString() ?? ''} onChange={f('ytd_net')} />
          <Input label="YTD Federal ($)" type="number" step="0.01" value={form.ytd_federal_tax?.toString() ?? ''} onChange={f('ytd_federal_tax')} />
          <Input label="YTD 401k Employee ($)" type="number" step="0.01" value={form.ytd_401k_employee?.toString() ?? ''} onChange={f('ytd_401k_employee')} />
          <Input label="YTD 401k Employer ($)" type="number" step="0.01" value={form.ytd_401k_employer?.toString() ?? ''} onChange={f('ytd_401k_employer')} />
        </div>

        <div className="flex gap-3 mt-2">
          <Button variant="primary" loading={saving} onClick={handleSave}>
            {saved ? <CheckCircle size={14} /> : <FileText size={14} />}
            {saved ? 'Saved!' : 'Save Paystub'}
          </Button>
          <Button variant="ghost" onClick={onCancel}>Discard</Button>
        </div>
      </div>
    </Card>
  )
}

// ─── Paystub row (history) ────────────────────────────────────────────────────
function PaystubRow({ stub, onDelete, onUpdate }: { stub: Paystub; onDelete: () => void; onUpdate: (updated: Paystub) => void }) {
  const [expanded, setExpanded] = useState(false)
  const [togglingType, setTogglingType] = useState(false)

  const handleTypeToggle = async (newType: 'regular' | 'bonus') => {
    if (newType === stub.pay_type || togglingType) return
    setTogglingType(true)
    try {
      const updated = await updatePaystub(stub.id, { ...stub, pay_type: newType })
      onUpdate(updated)
    } finally {
      setTogglingType(false)
    }
  }

  const effectiveTaxRate = stub.gross_pay && stub.tax_federal != null && stub.tax_state != null
    ? ((stub.tax_federal + stub.tax_state + (stub.tax_county ?? 0) + (stub.tax_social_security ?? 0) + (stub.tax_medicare ?? 0)) / stub.gross_pay * 100).toFixed(1)
    : null

  return (
    <div className="bg-surface-2 rounded-xl overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-surface transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', stub.pay_type === 'bonus' ? 'bg-yellow-500/10' : 'bg-primary/10')}>
            <FileText size={14} className={stub.pay_type === 'bonus' ? 'text-yellow-400' : 'text-primary'} />
          </div>
          <div className="text-left">
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold text-text-primary">{fmtDate(stub.pay_date)}</p>
              {stub.pay_type === 'bonus' && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-yellow-500/15 text-yellow-400 font-semibold uppercase tracking-wider">Bonus</span>
              )}
            </div>
            <p className="text-xs text-text-secondary">{stub.employer ?? 'Unknown employer'}</p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted">Gross</p>
            <p className="text-sm font-semibold text-text-primary">{fmt(stub.gross_pay)}</p>
          </div>
          <div className="text-right hidden sm:block">
            <p className="text-xs text-muted">Net</p>
            <p className="text-sm font-semibold text-green-400">{fmt(stub.net_pay)}</p>
          </div>
          {effectiveTaxRate && (
            <div className="text-right hidden md:block">
              <p className="text-xs text-muted">Eff. Tax</p>
              <p className="text-sm text-orange-400">{effectiveTaxRate}%</p>
            </div>
          )}
          <div className="flex items-center gap-1">
            {expanded ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
          </div>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 border-t border-[#2d3748]">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 mt-3">
            {[
              { label: 'Pay Period', value: stub.period_start && stub.period_end ? `${fmtDate(stub.period_start)} – ${fmtDate(stub.period_end)}` : '—' },
              { label: 'Gross Pay', value: fmt(stub.gross_pay) },
              ...(stub.bonus_pay ? [{ label: 'Bonus Pay', value: fmt(stub.bonus_pay) }] : []),
              { label: 'Net Pay', value: fmt(stub.net_pay) },
              { label: 'Federal Tax', value: fmt(stub.tax_federal) },
              { label: 'MD State Tax', value: fmt(stub.tax_state) },
              { label: 'MD County Tax', value: fmt(stub.tax_county) },
              { label: 'Social Security', value: fmt(stub.tax_social_security) },
              { label: 'Medicare', value: fmt(stub.tax_medicare) },
              { label: '401k (Employee)', value: fmt(stub.deduction_401k) },
              { label: '401k (Employer)', value: fmt(stub.employer_401k) },
              { label: 'Vision', value: fmt(stub.deduction_vision) },
              { label: 'YTD Gross', value: fmt(stub.ytd_gross) },
              { label: 'YTD Net', value: fmt(stub.ytd_net) },
              { label: 'YTD Federal', value: fmt(stub.ytd_federal_tax) },
              { label: 'YTD 401k (EE)', value: fmt(stub.ytd_401k_employee) },
              { label: 'YTD 401k (ER)', value: fmt(stub.ytd_401k_employer) },
            ].map(({ label, value }) => (
              <div key={label} className="flex flex-col gap-0.5">
                <p className="text-[10px] text-muted uppercase tracking-wider">{label}</p>
                <p className="text-sm text-text-primary">{value}</p>
              </div>
            ))}
          </div>
          <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-3">
              <span className="text-xs text-muted">Pay type:</span>
              {(['regular', 'bonus'] as const).map(type => (
                <button
                  key={type}
                  disabled={togglingType}
                  onClick={() => handleTypeToggle(type)}
                  className={cn(
                    'px-3 py-1 rounded-lg text-xs font-semibold capitalize transition-colors disabled:opacity-50',
                    stub.pay_type === type
                      ? type === 'bonus' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-primary/20 text-primary'
                      : 'bg-surface text-muted hover:text-text-secondary hover:bg-surface-2'
                  )}
                >
                  {type}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-green-400/80">
                <CheckCircle size={12} />
                <span>Income transaction recorded</span>
              </div>
              <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-danger hover:bg-danger/10 transition-colors">
                <Trash2 size={13} /> Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PaystubsPage() {
  const [stubs, setStubs] = useState<Paystub[]>([])
  const [singleParsed, setSingleParsed] = useState<ParsedPaystub | null>(null)
  const [queue, setQueue] = useState<BatchItem[] | null>(null)
  const [clearConfirm, setClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)

  const load = useCallback(async () => {
    const data = await getPaystubs()
    setStubs(data)
  }, [])

  useEffect(() => { load() }, [load])

  // Batch processor — runs whenever queue changes (processes one queued item at a time)
  useBatchProcessor(queue ?? [], (updated) => setQueue(updated))

  const startBatch = (files: File[]) => {
    // Store file references in a window-scoped map (avoids serialization issues)
    const fileMap: Map<string, File> = new Map()
    const items: BatchItem[] = files.map(file => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      fileMap.set(id, file)
      return { id, filename: file.name, status: 'queued' }
    })
    ;(window as unknown as Record<string, unknown>)['__paystubFiles__'] = fileMap
    setQueue(items)
  }

  const handleBatchDone = () => {
    setQueue(null)
    load()
  }

  // Summary stats — exclude bonus paystubs from the avg net
  const latestYtdGross = stubs[0]?.ytd_gross
  const latestYtdNet = stubs[0]?.ytd_net
  const regularStubs = stubs.filter(p => p.pay_type !== 'bonus')
  const avgNet = regularStubs.length > 0
    ? regularStubs.reduce((s, p) => s + (p.net_pay ?? 0), 0) / regularStubs.length
    : stubs.length > 0 ? stubs.reduce((s, p) => s + (p.net_pay ?? 0), 0) / stubs.length : null
  const bonusCount = stubs.filter(p => p.pay_type === 'bonus').length

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-3xl">
        <div className="flex items-center gap-3">
          <FileText size={22} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Paystubs</h1>
        </div>

        {/* Summary strip */}
        {stubs.length > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'YTD Gross', value: fmt(latestYtdGross), color: 'text-text-primary' },
              { label: 'YTD Net', value: fmt(latestYtdNet), color: 'text-green-400' },
              { label: 'Avg Net/Check', value: fmt(avgNet), sub: bonusCount > 0 ? `excl. ${bonusCount} bonus` : undefined, color: 'text-primary' },
            ].map(({ label, value, sub, color }) => (
              <Card key={label} className="text-center">
                <p className="text-xs text-muted mb-1">{label}</p>
                <p className={cn('text-xl font-bold', color)}>{value}</p>
                {sub && <p className="text-[10px] text-muted mt-0.5">{sub}</p>}
              </Card>
            ))}
          </div>
        )}

        {/* Mode: single review, batch queue, or upload zone */}
        {singleParsed ? (
          <ReviewForm
            parsed={singleParsed}
            onSaved={() => { setSingleParsed(null); load() }}
            onCancel={() => setSingleParsed(null)}
          />
        ) : queue ? (
          <BatchQueueView
            queue={queue}
            onQueueChange={setQueue}
            onDone={handleBatchDone}
          />
        ) : (
          <Card title="Upload Paystub">
            <UploadZone
              onSingle={setSingleParsed}
              onMultiple={startBatch}
            />
            <p className="mt-3 text-xs text-muted text-center">
              Drop a single file to review fields before saving · Drop multiple files or a folder to batch process
            </p>
          </Card>
        )}

        {/* History */}
        {stubs.length > 0 && !singleParsed && !queue && (
          <Card
            title={`History (${stubs.length} paystub${stubs.length !== 1 ? 's' : ''})`}
            action={
              clearConfirm ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-danger">Delete all {stubs.length} paystubs?</span>
                  <button
                    disabled={clearing}
                    onClick={async () => {
                      setClearing(true)
                      try {
                        await deleteAllPaystubs()
                        setStubs([])
                      } finally {
                        setClearing(false)
                        setClearConfirm(false)
                      }
                    }}
                    className="px-3 py-1 rounded-lg text-xs font-semibold bg-danger text-white hover:bg-danger/80 transition-colors disabled:opacity-50"
                  >
                    {clearing ? 'Deleting…' : 'Yes, delete all'}
                  </button>
                  <button
                    onClick={() => setClearConfirm(false)}
                    className="px-3 py-1 rounded-lg text-xs text-muted hover:text-text-secondary transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setClearConfirm(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                >
                  <Trash2 size={13} /> Clear All
                </button>
              )
            }
          >
            <div className="flex flex-col gap-2">
              {stubs.map(stub => (
                <PaystubRow
                  key={stub.id}
                  stub={stub}
                  onDelete={async () => { await deletePaystub(stub.id); load() }}
                  onUpdate={(updated) => setStubs(prev => prev.map(s => s.id === updated.id ? updated : s))}
                />
              ))}
            </div>
          </Card>
        )}

        {stubs.length === 0 && !singleParsed && !queue && (
          <p className="text-sm text-muted text-center py-6">No paystubs saved yet. Upload your first PDF above.</p>
        )}
      </div>
    </AppLayout>
  )
}
