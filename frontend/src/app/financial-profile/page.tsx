'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Input from '@/components/ui/Input'
import {
  getFinancialProfile, updateFinancialProfile,
  getStudentLoans, createStudentLoan, updateStudentLoan, deleteStudentLoan,
  getHoldings, createHolding, updateHolding, deleteHolding,
  getCompensationEvents, createCompensationEvent, deleteCompensationEvent,
  getAccounts,
} from '@/lib/api'
import type { FinancialProfile, StudentLoan, InvestmentHolding, CompensationEvent, Account } from '@/lib/types'
import {
  UserCircle, DollarSign, BookOpen, TrendingUp, Trophy, ChevronDown, ChevronUp,
  Plus, Trash2, Save, Edit2, X, CheckCircle,
} from 'lucide-react'
import { cn } from '@/lib/utils'

function fmt(n?: number | null) {
  if (n == null) return '—'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
}

function fmtPct(n?: number | null) {
  if (n == null) return '—'
  return `${n}%`
}

// ─── Collapsible section wrapper ────────────────────────────────────────────
function Section({ title, icon: Icon, color, children, defaultOpen = true }: {
  title: string
  icon: React.ElementType
  color: string
  children: React.ReactNode
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="bg-surface rounded-xl border border-[#2d3748] overflow-hidden">
      <button
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-surface-2 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <div className="flex items-center gap-3">
          <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', color)}>
            <Icon size={16} className="text-white" />
          </div>
          <span className="text-sm font-semibold text-text-primary">{title}</span>
        </div>
        {open ? <ChevronUp size={16} className="text-muted" /> : <ChevronDown size={16} className="text-muted" />}
      </button>
      {open && <div className="px-5 pb-5 border-t border-[#2d3748]">{children}</div>}
    </div>
  )
}

// ─── Income & Salary section ─────────────────────────────────────────────────
function IncomeSection({ profile, onSaved }: { profile: FinancialProfile | null; onSaved: () => void }) {
  const [salary, setSalary] = useState(profile?.salary?.toString() ?? '')
  const [payFreq, setPayFreq] = useState(profile?.pay_frequency ?? 'biweekly')
  const [netPer, setNetPer] = useState(profile?.net_per_paycheck?.toString() ?? '')
  const [emp401k, setEmp401k] = useState(profile?.employer_401k_percent?.toString() ?? '')
  const [ee401k, setEe401k] = useState(profile?.employee_401k_per_paycheck?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSalary(profile?.salary?.toString() ?? '')
    setPayFreq(profile?.pay_frequency ?? 'biweekly')
    setNetPer(profile?.net_per_paycheck?.toString() ?? '')
    setEmp401k(profile?.employer_401k_percent?.toString() ?? '')
    setEe401k(profile?.employee_401k_per_paycheck?.toString() ?? '')
  }, [profile])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateFinancialProfile({
        salary: salary ? parseFloat(salary) : undefined,
        pay_frequency: payFreq,
        net_per_paycheck: netPer ? parseFloat(netPer) : undefined,
        employer_401k_percent: emp401k ? parseFloat(emp401k) : undefined,
        employee_401k_per_paycheck: ee401k ? parseFloat(ee401k) : undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  const annual = salary ? parseFloat(salary) : null
  const perPeriod = annual && payFreq === 'biweekly' ? annual / 26 : annual ? annual / 24 : null

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="Annual Salary ($)" type="number" value={salary} onChange={e => setSalary(e.target.value)} placeholder="130935" />
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Pay Frequency</label>
          <select
            value={payFreq}
            onChange={e => setPayFreq(e.target.value)}
            className="h-10 px-3 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary text-sm"
          >
            <option value="biweekly">Biweekly (26×/yr)</option>
            <option value="semimonthly">Semi-monthly (24×/yr)</option>
            <option value="monthly">Monthly (12×/yr)</option>
          </select>
        </div>
        <Input label="Net Pay per Paycheck ($)" type="number" value={netPer} onChange={e => setNetPer(e.target.value)} placeholder="3800" />
        <Input label="Employer 401k Match (%)" type="number" value={emp401k} onChange={e => setEmp401k(e.target.value)} placeholder="6" />
        <Input label="Employee 401k per Paycheck ($)" type="number" value={ee401k} onChange={e => setEe401k(e.target.value)} placeholder="327" />
      </div>
      {perPeriod && (
        <div className="p-3 rounded-xl bg-surface-2 text-xs text-text-secondary flex gap-6">
          <span>Gross/period: <strong className="text-text-primary">{fmt(perPeriod)}</strong></span>
          <span>Annual: <strong className="text-text-primary">{fmt(annual)}</strong></span>
        </div>
      )}
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
          <Save size={14} /> Save
        </Button>
        {saved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
      </div>
    </div>
  )
}

// ─── HYSA & IRA section ───────────────────────────────────────────────────────
function SavingsSection({ profile, onSaved }: { profile: FinancialProfile | null; onSaved: () => void }) {
  const [hysaApy, setHysaApy] = useState(profile?.hysa_apy?.toString() ?? '')
  const [hysaContrib, setHysaContrib] = useState(profile?.hysa_monthly_contribution?.toString() ?? '')
  const [iraContrib, setIraContrib] = useState(profile?.ira_monthly_contribution?.toString() ?? '')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setHysaApy(profile?.hysa_apy?.toString() ?? '')
    setHysaContrib(profile?.hysa_monthly_contribution?.toString() ?? '')
    setIraContrib(profile?.ira_monthly_contribution?.toString() ?? '')
  }, [profile])

  const handleSave = async () => {
    setSaving(true)
    try {
      await updateFinancialProfile({
        hysa_apy: hysaApy ? parseFloat(hysaApy) : undefined,
        hysa_monthly_contribution: hysaContrib ? parseFloat(hysaContrib) : undefined,
        ira_monthly_contribution: iraContrib ? parseFloat(iraContrib) : undefined,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-4">
        <Input label="HYSA APY (%)" type="number" step="0.01" value={hysaApy} onChange={e => setHysaApy(e.target.value)} placeholder="3.9" />
        <Input label="Monthly HYSA Contribution ($)" type="number" value={hysaContrib} onChange={e => setHysaContrib(e.target.value)} placeholder="1600" />
        <Input label="Monthly IRA Contribution ($)" type="number" value={iraContrib} onChange={e => setIraContrib(e.target.value)} placeholder="583" />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="primary" size="sm" loading={saving} onClick={handleSave}>
          <Save size={14} /> Save
        </Button>
        {saved && <span className="text-xs text-green-400 flex items-center gap-1"><CheckCircle size={12} /> Saved</span>}
      </div>
    </div>
  )
}

// ─── Student Loans section ────────────────────────────────────────────────────
function LoansSection() {
  const [loans, setLoans] = useState<StudentLoan[]>([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ loan_name: '', servicer: '', original_balance: '', current_balance: '', interest_rate: '', minimum_payment: '' })

  const load = useCallback(async () => {
    const data = await getStudentLoans()
    setLoans(data)
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => setForm({ loan_name: '', servicer: '', original_balance: '', current_balance: '', interest_rate: '', minimum_payment: '' })

  const handleSave = async () => {
    const payload = {
      loan_name: form.loan_name,
      servicer: form.servicer || undefined,
      original_balance: parseFloat(form.original_balance),
      current_balance: parseFloat(form.current_balance),
      interest_rate: parseFloat(form.interest_rate),
      minimum_payment: parseFloat(form.minimum_payment),
    }
    if (editId) {
      await updateStudentLoan(editId, payload)
      setEditId(null)
    } else {
      await createStudentLoan(payload)
      setAdding(false)
    }
    resetForm()
    load()
  }

  const startEdit = (loan: StudentLoan) => {
    setEditId(loan.id)
    setForm({
      loan_name: loan.loan_name,
      servicer: loan.servicer ?? '',
      original_balance: loan.original_balance.toString(),
      current_balance: loan.current_balance.toString(),
      interest_rate: loan.interest_rate.toString(),
      minimum_payment: loan.minimum_payment.toString(),
    })
    setAdding(false)
  }

  const totalBalance = loans.filter(l => l.is_active).reduce((s, l) => s + l.current_balance, 0)

  return (
    <div className="mt-4 flex flex-col gap-3">
      {loans.length > 0 && (
        <div className="p-3 rounded-xl bg-surface-2 text-xs text-text-secondary">
          Total remaining: <strong className="text-text-primary">{fmt(totalBalance)}</strong>
          {' '}across {loans.filter(l => l.is_active).length} active loan{loans.filter(l => l.is_active).length !== 1 ? 's' : ''}
        </div>
      )}
      <div className="flex flex-col gap-2">
        {loans.map(loan => (
          editId === loan.id ? (
            <LoanForm key={loan.id} form={form} setForm={setForm} onSave={handleSave} onCancel={() => { setEditId(null); resetForm() }} />
          ) : (
            <div key={loan.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-2">
              <div className="flex flex-col gap-0.5">
                <span className="text-sm font-medium text-text-primary">{loan.loan_name}</span>
                <span className="text-xs text-text-secondary">{loan.servicer ?? 'No servicer'} · {fmtPct(loan.interest_rate)} · Min {fmt(loan.minimum_payment)}/mo</span>
              </div>
              <div className="flex items-center gap-4">
                <div className="text-right">
                  <p className="text-sm font-semibold text-danger">{fmt(loan.current_balance)}</p>
                  <p className="text-[10px] text-muted">of {fmt(loan.original_balance)}</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(loan)} className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-surface transition-colors"><Edit2 size={14} /></button>
                  <button onClick={async () => { await deleteStudentLoan(loan.id); load() }} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-surface transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          )
        ))}
      </div>
      {adding && !editId && (
        <LoanForm form={form} setForm={setForm} onSave={handleSave} onCancel={() => { setAdding(false); resetForm() }} />
      )}
      {!adding && !editId && (
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add Loan
        </Button>
      )}
    </div>
  )
}

function LoanForm({ form, setForm, onSave, onCancel }: {
  form: Record<string, string>
  setForm: (f: Record<string, string>) => void
  onSave: () => void
  onCancel: () => void
}) {
  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: e.target.value })
  return (
    <div className="p-4 rounded-xl border border-[#2d3748] bg-surface flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Input label="Loan Name" value={form.loan_name} onChange={f('loan_name')} placeholder="Navient Sub 1" />
        <Input label="Servicer" value={form.servicer} onChange={f('servicer')} placeholder="Navient" />
        <Input label="Original Balance ($)" type="number" value={form.original_balance} onChange={f('original_balance')} placeholder="15000" />
        <Input label="Current Balance ($)" type="number" value={form.current_balance} onChange={f('current_balance')} placeholder="12400" />
        <Input label="Interest Rate (%)" type="number" step="0.01" value={form.interest_rate} onChange={f('interest_rate')} placeholder="5.05" />
        <Input label="Min Payment ($/mo)" type="number" value={form.minimum_payment} onChange={f('minimum_payment')} placeholder="120" />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={14} /> Cancel</Button>
      </div>
    </div>
  )
}

// ─── Investment Holdings section ──────────────────────────────────────────────
function HoldingsSection({ accounts }: { accounts: Account[] }) {
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([])
  const [adding, setAdding] = useState(false)
  const [editId, setEditId] = useState<number | null>(null)
  const [form, setForm] = useState<Record<string, string>>({ account_id: '', ticker: '', fund_name: '', current_value: '', monthly_contribution: '', assumed_annual_return: '', weight_percent: '' })

  const investmentAccounts = accounts.filter(a => ['brokerage', 'ira', '401k', 'hsa'].includes(a.account_type))

  const load = useCallback(async () => {
    const data = await getHoldings()
    setHoldings(data)
  }, [])

  useEffect(() => { load() }, [load])

  const resetForm = () => setForm({ account_id: '', ticker: '', fund_name: '', current_value: '', monthly_contribution: '', assumed_annual_return: '', weight_percent: '' })

  const handleSave = async () => {
    const payload = {
      account_id: parseInt(form.account_id),
      ticker: form.ticker || undefined,
      fund_name: form.fund_name,
      current_value: parseFloat(form.current_value),
      monthly_contribution: parseFloat(form.monthly_contribution || '0'),
      assumed_annual_return: parseFloat(form.assumed_annual_return || '7'),
      weight_percent: form.weight_percent ? parseFloat(form.weight_percent) : undefined,
    }
    if (editId) {
      await updateHolding(editId, payload)
      setEditId(null)
    } else {
      await createHolding(payload)
      setAdding(false)
    }
    resetForm()
    load()
  }

  const startEdit = (h: InvestmentHolding) => {
    setEditId(h.id)
    setForm({
      account_id: h.account_id.toString(),
      ticker: h.ticker ?? '',
      fund_name: h.fund_name,
      current_value: h.current_value.toString(),
      monthly_contribution: h.monthly_contribution.toString(),
      assumed_annual_return: h.assumed_annual_return.toString(),
      weight_percent: h.weight_percent?.toString() ?? '',
    })
    setAdding(false)
  }

  const totalValue = holdings.reduce((s, h) => s + h.current_value, 0)
  const accountName = (id: number) => accounts.find(a => a.id === id)?.name ?? `Account #${id}`

  return (
    <div className="mt-4 flex flex-col gap-3">
      {holdings.length > 0 && (
        <div className="p-3 rounded-xl bg-surface-2 text-xs text-text-secondary">
          Total investment holdings: <strong className="text-text-primary">{fmt(totalValue)}</strong>
        </div>
      )}
      <div className="flex flex-col gap-2">
        {holdings.map(h => (
          editId === h.id ? (
            <HoldingForm key={h.id} form={form} setForm={setForm} accounts={investmentAccounts} onSave={handleSave} onCancel={() => { setEditId(null); resetForm() }} />
          ) : (
            <div key={h.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-2">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  {h.ticker && <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-primary/10 text-primary">{h.ticker}</span>}
                  <span className="text-sm font-medium text-text-primary">{h.fund_name}</span>
                </div>
                <span className="text-xs text-text-secondary">{accountName(h.account_id)} · +{fmt(h.monthly_contribution)}/mo · {h.assumed_annual_return}% return</span>
              </div>
              <div className="flex items-center gap-4">
                <span className="text-sm font-semibold text-green-400">{fmt(h.current_value)}</span>
                <div className="flex gap-1">
                  <button onClick={() => startEdit(h)} className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-surface transition-colors"><Edit2 size={14} /></button>
                  <button onClick={async () => { await deleteHolding(h.id); load() }} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-surface transition-colors"><Trash2 size={14} /></button>
                </div>
              </div>
            </div>
          )
        ))}
      </div>
      {adding && !editId && (
        <HoldingForm form={form} setForm={setForm} accounts={investmentAccounts} onSave={handleSave} onCancel={() => { setAdding(false); resetForm() }} />
      )}
      {!adding && !editId && (
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add Holding
        </Button>
      )}
    </div>
  )
}

function HoldingForm({ form, setForm, accounts, onSave, onCancel }: {
  form: Record<string, string>
  setForm: (f: Record<string, string>) => void
  accounts: Account[]
  onSave: () => void
  onCancel: () => void
}) {
  const f = (key: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm({ ...form, [key]: e.target.value })
  return (
    <div className="p-4 rounded-xl border border-[#2d3748] bg-surface flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-text-secondary">Account</label>
          <select value={form.account_id} onChange={f('account_id')} className="h-10 px-3 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary text-sm">
            <option value="">Select account</option>
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </div>
        <Input label="Ticker (optional)" value={form.ticker} onChange={f('ticker') as React.ChangeEventHandler<HTMLInputElement>} placeholder="SWPPX" />
        <Input label="Fund Name" value={form.fund_name} onChange={f('fund_name') as React.ChangeEventHandler<HTMLInputElement>} placeholder="S&P 500 Index" />
        <Input label="Current Value ($)" type="number" value={form.current_value} onChange={f('current_value') as React.ChangeEventHandler<HTMLInputElement>} placeholder="25000" />
        <Input label="Monthly Contribution ($)" type="number" value={form.monthly_contribution} onChange={f('monthly_contribution') as React.ChangeEventHandler<HTMLInputElement>} placeholder="500" />
        <Input label="Assumed Annual Return (%)" type="number" step="0.1" value={form.assumed_annual_return} onChange={f('assumed_annual_return') as React.ChangeEventHandler<HTMLInputElement>} placeholder="7" />
      </div>
      <div className="flex gap-2">
        <Button variant="primary" size="sm" onClick={onSave}><Save size={14} /> Save</Button>
        <Button variant="ghost" size="sm" onClick={onCancel}><X size={14} /> Cancel</Button>
      </div>
    </div>
  )
}

// ─── Compensation History section ─────────────────────────────────────────────
const EVENT_LABELS: Record<string, string> = {
  raise: 'Raise',
  bonus: 'Bonus',
  spot_award: 'Spot Award',
  stipend: 'Stipend',
  other: 'Other',
}

const EVENT_COLORS: Record<string, string> = {
  raise: 'bg-blue-500',
  bonus: 'bg-green-500',
  spot_award: 'bg-yellow-500',
  stipend: 'bg-purple-500',
  other: 'bg-gray-500',
}

function CompensationSection() {
  const [events, setEvents] = useState<CompensationEvent[]>([])
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({
    event_type: 'bonus' as string,
    effective_date: '',
    old_salary: '',
    new_salary: '',
    gross_amount: '',
    net_amount: '',
    description: '',
    notes: '',
  })

  const load = useCallback(async () => {
    const data = await getCompensationEvents()
    setEvents(data)
  }, [])

  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    await createCompensationEvent({
      event_type: form.event_type as CompensationEvent['event_type'],
      effective_date: form.effective_date,
      old_salary: form.old_salary ? parseFloat(form.old_salary) : undefined,
      new_salary: form.new_salary ? parseFloat(form.new_salary) : undefined,
      gross_amount: form.gross_amount ? parseFloat(form.gross_amount) : undefined,
      net_amount: form.net_amount ? parseFloat(form.net_amount) : undefined,
      description: form.description || undefined,
      notes: form.notes || undefined,
    })
    setAdding(false)
    setForm({ event_type: 'bonus', effective_date: '', old_salary: '', new_salary: '', gross_amount: '', net_amount: '', description: '', notes: '' })
    load()
  }

  return (
    <div className="mt-4 flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {events.map(ev => (
          <div key={ev.id} className="flex items-center justify-between p-3 rounded-xl bg-surface-2">
            <div className="flex items-center gap-3">
              <div className={cn('w-2 h-8 rounded-full', EVENT_COLORS[ev.event_type] ?? 'bg-gray-500')} />
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-text-primary">{ev.description || EVENT_LABELS[ev.event_type]}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-surface border border-[#2d3748] text-text-secondary">{EVENT_LABELS[ev.event_type]}</span>
                </div>
                <span className="text-xs text-muted">{ev.effective_date}</span>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-right text-sm">
                {ev.event_type === 'raise' && ev.new_salary != null && (
                  <span className="text-green-400 font-semibold">{fmt(ev.new_salary)}/yr</span>
                )}
                {ev.gross_amount != null && (
                  <div className="flex flex-col">
                    <span className="text-green-400 font-semibold">{fmt(ev.gross_amount)} gross</span>
                    {ev.net_amount != null && <span className="text-xs text-muted">{fmt(ev.net_amount)} net</span>}
                  </div>
                )}
              </div>
              <button onClick={async () => { await deleteCompensationEvent(ev.id); load() }} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-surface transition-colors"><Trash2 size={14} /></button>
            </div>
          </div>
        ))}
      </div>

      {adding ? (
        <div className="p-4 rounded-xl border border-[#2d3748] bg-surface flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <label className="text-xs font-medium text-text-secondary">Event Type</label>
              <select value={form.event_type} onChange={e => setForm({ ...form, event_type: e.target.value })} className="h-10 px-3 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary text-sm">
                {Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <Input label="Effective Date" type="date" value={form.effective_date} onChange={e => setForm({ ...form, effective_date: e.target.value })} />
            <Input label="Description" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} placeholder="Q1 Performance Bonus" />
            {form.event_type === 'raise' ? (
              <>
                <Input label="Old Salary ($)" type="number" value={form.old_salary} onChange={e => setForm({ ...form, old_salary: e.target.value })} placeholder="125000" />
                <Input label="New Salary ($)" type="number" value={form.new_salary} onChange={e => setForm({ ...form, new_salary: e.target.value })} placeholder="130935" />
              </>
            ) : (
              <>
                <Input label="Gross Amount ($)" type="number" value={form.gross_amount} onChange={e => setForm({ ...form, gross_amount: e.target.value })} placeholder="5000" />
                <Input label="Net Amount ($)" type="number" value={form.net_amount} onChange={e => setForm({ ...form, net_amount: e.target.value })} placeholder="3500" />
              </>
            )}
            <Input label="Notes (optional)" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes" />
          </div>
          <div className="flex gap-2">
            <Button variant="primary" size="sm" onClick={handleSave}><Save size={14} /> Save</Button>
            <Button variant="ghost" size="sm" onClick={() => setAdding(false)}><X size={14} /> Cancel</Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" size="sm" className="w-fit" onClick={() => setAdding(true)}>
          <Plus size={14} /> Add Event
        </Button>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FinancialProfilePage() {
  const [profile, setProfile] = useState<FinancialProfile | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])

  const loadProfile = useCallback(async () => {
    const data = await getFinancialProfile()
    setProfile(data)
  }, [])

  useEffect(() => {
    loadProfile()
    getAccounts().then(setAccounts)
  }, [loadProfile])

  return (
    <AppLayout>
      <div className="flex flex-col gap-6 max-w-2xl">
        <div className="flex items-center gap-3">
          <UserCircle size={22} className="text-primary" />
          <h1 className="text-xl font-bold text-text-primary">Financial Profile</h1>
        </div>
        <p className="text-sm text-text-secondary -mt-4">
          Track your salary, savings goals, loans, investments, and compensation history in one place.
        </p>

        <Section title="Income & Salary" icon={DollarSign} color="bg-primary">
          <IncomeSection profile={profile} onSaved={loadProfile} />
        </Section>

        <Section title="HYSA & IRA Contributions" icon={TrendingUp} color="bg-green-600">
          <SavingsSection profile={profile} onSaved={loadProfile} />
        </Section>

        <Section title="Student Loans" icon={BookOpen} color="bg-orange-500">
          <LoansSection />
        </Section>

        <Section title="Investment Holdings" icon={TrendingUp} color="bg-blue-600" defaultOpen={false}>
          <HoldingsSection accounts={accounts} />
        </Section>

        <Section title="Compensation History" icon={Trophy} color="bg-yellow-600" defaultOpen={false}>
          <CompensationSection />
        </Section>
      </div>
    </AppLayout>
  )
}
