'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import { parsePaystub, savePaystub, getPaystubs, deletePaystub } from '@/lib/api'
import type { Paystub, ParsedPaystub } from '@/lib/types'
import { FileText, Upload, CheckCircle, Trash2, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react'
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

// ─── Upload zone ──────────────────────────────────────────────────────────────
function UploadZone({ onParsed }: { onParsed: (result: ParsedPaystub) => void }) {
  const [dragging, setDragging] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.pdf')) {
      setError('Please upload a PDF file.')
      return
    }
    setLoading(true)
    setError('')
    try {
      const result = await parsePaystub(file)
      onParsed(result)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to parse PDF. Check that it is a digital (not scanned) paystub.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className={cn(
        'border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center gap-4 cursor-pointer transition-colors',
        dragging ? 'border-primary bg-primary/5' : 'border-[#2d3748] hover:border-primary/50 hover:bg-surface-2'
      )}
      onDragOver={e => { e.preventDefault(); setDragging(true) }}
      onDragLeave={() => setDragging(false)}
      onDrop={e => { e.preventDefault(); setDragging(false); const f = e.dataTransfer.files[0]; if (f) handleFile(f) }}
      onClick={() => inputRef.current?.click()}
    >
      <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f) }} />
      <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center">
        <Upload size={24} className="text-primary" />
      </div>
      <div className="text-center">
        <p className="text-sm font-semibold text-text-primary">Drop a paystub PDF here</p>
        <p className="text-xs text-text-secondary mt-1">or click to browse · Paylocity format supported</p>
      </div>
      {loading && <p className="text-xs text-primary animate-pulse">Parsing PDF…</p>}
      {error && (
        <div className="flex items-center gap-2 text-danger text-xs">
          <AlertCircle size={14} /> {error}
        </div>
      )}
    </div>
  )
}

// ─── Parsed review form ───────────────────────────────────────────────────────
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
    if (!form.pay_date) {
      setError('Pay date is required.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await savePaystub(form)
      setSaved(true)
      setTimeout(() => { setSaved(false); onSaved() }, 1000)
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail
      setError(msg || 'Failed to save paystub. Check that all required fields are filled in.')
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
        <div className="grid grid-cols-2 gap-3">
          <Input label="Gross Pay ($)" type="number" step="0.01" value={form.gross_pay?.toString() ?? ''} onChange={f('gross_pay')} />
          <Input label="Regular Pay ($)" type="number" step="0.01" value={form.regular_pay?.toString() ?? ''} onChange={f('regular_pay')} />
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

// ─── Paystub row ──────────────────────────────────────────────────────────────
function PaystubRow({ stub, onDelete }: { stub: Paystub; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(false)

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
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <FileText size={14} className="text-primary" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-text-primary">{fmtDate(stub.pay_date)}</p>
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
          <div className="mt-3 flex justify-end">
            <button onClick={onDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs text-danger hover:bg-danger/10 transition-colors">
              <Trash2 size={13} /> Delete
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function PaystubsPage() {
  const [stubs, setStubs] = useState<Paystub[]>([])
  const [parsed, setParsed] = useState<ParsedPaystub | null>(null)

  const load = useCallback(async () => {
    const data = await getPaystubs()
    setStubs(data)
  }, [])

  useEffect(() => { load() }, [load])

  // Summary stats
  const latestYtdGross = stubs[0]?.ytd_gross
  const latestYtdNet = stubs[0]?.ytd_net
  const avgNet = stubs.length > 0 ? stubs.reduce((s, p) => s + (p.net_pay ?? 0), 0) / stubs.length : null

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
              { label: 'Avg Net/Check', value: fmt(avgNet), color: 'text-primary' },
            ].map(({ label, value, color }) => (
              <Card key={label} className="text-center">
                <p className="text-xs text-muted mb-1">{label}</p>
                <p className={cn('text-xl font-bold', color)}>{value}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Upload or review */}
        {parsed ? (
          <ReviewForm parsed={parsed} onSaved={() => { setParsed(null); load() }} onCancel={() => setParsed(null)} />
        ) : (
          <Card title="Upload Paystub">
            <UploadZone onParsed={setParsed} />
            <p className="mt-3 text-xs text-muted text-center">
              The app will extract all fields automatically. You can review and correct before saving.
            </p>
          </Card>
        )}

        {/* History */}
        {stubs.length > 0 && (
          <Card title={`History (${stubs.length} paystub${stubs.length !== 1 ? 's' : ''})`}>
            <div className="flex flex-col gap-2">
              {stubs.map(stub => (
                <PaystubRow
                  key={stub.id}
                  stub={stub}
                  onDelete={async () => { await deletePaystub(stub.id); load() }}
                />
              ))}
            </div>
          </Card>
        )}

        {stubs.length === 0 && !parsed && (
          <p className="text-sm text-muted text-center py-6">No paystubs saved yet. Upload your first PDF above.</p>
        )}
      </div>
    </AppLayout>
  )
}
