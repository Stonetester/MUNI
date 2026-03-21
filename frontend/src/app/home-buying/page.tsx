'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import InfoTooltip from '@/components/ui/InfoTooltip'
import {
  getHomeBuyingGoals,
  updateHomeBuyingGoalById,
  createHomeBuyingGoal,
  activateHomeBuyingGoal,
  deleteHomeBuyingGoal,
} from '@/lib/api'
import { HomeBuyingGoal } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

// zero-decimal formatter for large dollar amounts
const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n)
import {
  Home, CheckCircle2, XCircle, AlertTriangle, TrendingUp,
  MapPin, DollarSign, Calendar, Pencil, X, ChevronDown, ChevronUp,
  Info, Star,
} from 'lucide-react'

// ─── Maryland Knowledge Base ────────────────────────────────────────────────

const MMP_INCOME_LIMIT_1_2 = 196680
const MMP_INCOME_LIMIT_3PLUS = 229460
const MMP_DPA = 6000
const HAP_DPA = 12000
const PARTNER_MATCH = 2500
const ESTIMATED_RATE_2027 = 0.065  // 6.5% estimated 30yr fixed in 2027-2028

const AREA_GUIDE = [
  {
    area: 'Walkersville / Woodsboro',
    min: 350000, max: 480000,
    acreage: 4,
    notes: 'Northern Frederick County, rural character, acreage common, quiet community',
    commute: '15–25 min to Frederick',
  },
  {
    area: 'Jefferson / Knoxville',
    min: 400000, max: 510000,
    acreage: 4,
    notes: 'Rural lots, mountain views, best for 1-acre+, peaceful living',
    commute: '20–35 min to Frederick',
  },
  {
    area: 'Brunswick / Burkittsville',
    min: 370000, max: 445000,
    acreage: 3,
    notes: 'Most affordable in Frederick County, some acreage, MARC train to DC',
    commute: '30–40 min to Frederick, MARC to DC',
  },
  {
    area: 'Middletown Valley',
    min: 450000, max: 620000,
    acreage: 2,
    notes: 'Highly desirable, excellent schools, competitive market, limited large lots',
    commute: '15–20 min to Frederick',
  },
  {
    area: 'Frederick City / Suburbs',
    min: 375000, max: 510000,
    acreage: 1,
    notes: 'Urban/suburban, close to amenities, smaller lots, good appreciation',
    commute: '0–10 min to Frederick',
  },
  {
    area: 'New Market / Monrovia',
    min: 500000, max: 660000,
    acreage: 3,
    notes: 'Newer construction, some acreage available, growing area near I-70',
    commute: '15–25 min to Frederick, 45 min to DC suburbs',
  },
]

const DOWN_PCT_OPTIONS = [0.05, 0.10, 0.15, 0.20]

// ─── Helpers ────────────────────────────────────────────────────────────────

function monthlyPayment(principal: number, annualRate: number, years = 30): number {
  if (principal <= 0) return 0
  const r = annualRate / 12
  const n = years * 12
  return principal * (r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1)
}

function monthsToGoal(current: number, target: number, monthly: number, apy: number): number {
  if (monthly <= 0 || target <= current) return 0
  const r = apy / 12
  if (r === 0) return Math.ceil((target - current) / monthly)
  // FV = PV*(1+r)^n + PMT*((1+r)^n - 1)/r  → solve for n numerically
  let months = 0
  let balance = current
  while (balance < target && months < 600) {
    balance = balance * (1 + r) + monthly
    months++
  }
  return months
}

function requiredMonthly(current: number, target: number, months: number, apy: number): number {
  if (months <= 0) return 0
  const r = apy / 12
  const fv = target - current * Math.pow(1 + r, months)
  if (r === 0) return fv / months
  return fv * r / (Math.pow(1 + r, months) - 1)
}

function addMonths(dateStr: string, months: number): string {
  const d = new Date(dateStr + 'T00:00:00')
  d.setMonth(d.getMonth() + months)
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

function monthsUntil(targetDate: string): number {
  const now = new Date()
  const target = new Date(targetDate + 'T00:00:00')
  return Math.max(0, (target.getFullYear() - now.getFullYear()) * 12 + (target.getMonth() - now.getMonth()))
}

function AcreageStars({ count }: { count: number }) {
  return (
    <span className="flex gap-0.5">
      {[1, 2, 3, 4].map((i) => (
        <Star key={i} size={11} className={i <= count ? 'text-yellow-400 fill-yellow-400' : 'text-[#2d3748]'} />
      ))}
    </span>
  )
}

// Inline acronym tooltip — hover (desktop) or tap (mobile)
function Tip({ children, text }: { children: React.ReactNode; text: string }) {
  return (
    <span className="group relative inline-block cursor-help">
      <span className="border-b border-dotted border-blue-400/50">{children}</span>
      <span className="pointer-events-none absolute bottom-full left-1/2 z-[60] mb-2 w-72 -translate-x-1/2 rounded-xl border border-[#2d3748] bg-[#0b1120] p-3 text-xs text-text-secondary opacity-0 shadow-2xl transition-opacity duration-150 group-hover:opacity-100">
        {text}
      </span>
    </span>
  )
}

// ─── Edit Goal Modal ─────────────────────────────────────────────────────────

function EditGoalModal({ goal, onSave, onClose }: {
  goal: HomeBuyingGoal
  onSave: (g: HomeBuyingGoal) => Promise<void>
  onClose: () => void
}) {
  const [form, setForm] = useState({ ...goal })
  const [saving, setSaving] = useState(false)

  const set = (k: keyof HomeBuyingGoal, v: string | number) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border border-[#2d3748] rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#2d3748]">
          <h2 className="text-base font-bold text-text-primary">{goal.id ? 'Edit' : 'New'} Goal Profile</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2">
            <X size={18} />
          </button>
        </div>

        <div className="px-5 py-4 flex flex-col gap-4">
          {/* Profile name */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Profile Name</label>
            <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm"
              placeholder="e.g. Conservative, Stretch, 2028 Plan" />
          </div>

          {/* Price range */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 block">Target Price Range</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Minimum ($)</label>
                <input type="number" value={form.target_price_min} onChange={(e) => set('target_price_min', +e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Maximum ($)</label>
                <input type="number" value={form.target_price_max} onChange={(e) => set('target_price_max', +e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
              </div>
            </div>
          </div>

          {/* Target date */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Target Purchase Date</label>
            <input type="date" value={form.target_date} onChange={(e) => set('target_date', e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
          </div>

          {/* Down payment */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Down Payment Target ($)</label>
              <input type="number" value={form.down_payment_target} onChange={(e) => set('down_payment_target', +e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
            </div>
            <div>
              <label className="text-xs text-text-secondary mb-1 block">Current Savings ($)</label>
              <input type="number" value={form.current_savings} onChange={(e) => set('current_savings', +e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
            </div>
          </div>

          {/* Monthly contribution */}
          <div>
            <label className="text-xs text-text-secondary mb-1 block">Monthly Savings Contribution ($)</label>
            <input type="number" value={form.monthly_savings_contribution} onChange={(e) => set('monthly_savings_contribution', +e.target.value)}
              className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
          </div>

          {/* Incomes */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 block">Annual Incomes (for program eligibility)</label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Keaton Gross ($)</label>
                <input type="number" value={form.keaton_income} onChange={(e) => set('keaton_income', +e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
              </div>
              <div>
                <label className="text-xs text-text-secondary mb-1 block">Katherine Gross ($)</label>
                <input type="number" value={form.katherine_income} onChange={(e) => set('katherine_income', +e.target.value)}
                  className="w-full h-10 px-3 rounded-lg bg-surface-2 border border-[#2d3748] text-text-primary text-sm" />
              </div>
            </div>
          </div>

          {/* Mortgage structure */}
          <div>
            <label className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-2 block">Mortgage Structure</label>
            <div className="flex flex-col gap-2">
              {([
                { value: 'keaton_only', label: 'Keaton on Mortgage, Katherine on Deed', recommended: true },
                { value: 'both', label: 'Both on Mortgage' },
                { value: 'katherine_only', label: 'Katherine on Mortgage, Keaton on Deed' },
              ] as const).map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => set('mortgage_structure', opt.value)}
                  className={[
                    'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-colors',
                    form.mortgage_structure === opt.value
                      ? 'bg-primary/10 border-primary text-text-primary'
                      : 'bg-surface-2 border-[#2d3748] text-text-secondary hover:border-[#4a5568]',
                  ].join(' ')}
                >
                  {opt.label}
                  {'recommended' in opt && opt.recommended && (
                    <span className="ml-2 text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-medium">Recommended</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-2 pt-2">
            <Button variant="primary" onClick={handleSave} disabled={saving} className="flex-1">
              {saving ? 'Saving…' : 'Save Goal'}
            </Button>
            <Button variant="ghost" onClick={onClose}>Cancel</Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Page ───────────────────────────────────────────────────────────────

const DEFAULT_GOAL: HomeBuyingGoal = {
  name: 'Default',
  is_active: true,
  target_price_min: 380000,
  target_price_max: 500000,
  target_date: '2028-01-01',
  down_payment_target: 75000,
  current_savings: 0,
  monthly_savings_contribution: 1600,
  mortgage_structure: 'keaton_only',
  keaton_income: 130935,
  katherine_income: 77000,
}

export default function HomeBuyingPage() {
  const [goals, setGoals] = useState<HomeBuyingGoal[]>([])
  const [activeId, setActiveId] = useState<number | null>(null)
  const [compareId, setCompareId] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [editingGoal, setEditingGoal] = useState<HomeBuyingGoal | null>(null)
  const [creatingNew, setCreatingNew] = useState(false)
  const [scenariosOpen, setScenariosOpen] = useState(true)
  const [areaOpen, setAreaOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const all = await getHomeBuyingGoals()
      setGoals(all)
      const active = all.find((g) => g.is_active) ?? all[0]
      if (active?.id) setActiveId(active.id)
    } catch {
      setGoals([DEFAULT_GOAL])
      setActiveId(undefined as unknown as null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const goal = goals.find((g) => g.id === activeId) ?? goals[0] ?? DEFAULT_GOAL
  const compareGoal = compareId ? goals.find((g) => g.id === compareId) ?? null : null

  const handleActivate = async (id: number) => {
    await activateHomeBuyingGoal(id)
    setActiveId(id)
    setGoals((prev) => prev.map((g) => ({ ...g, is_active: g.id === id })))
  }

  const handleSave = async (updated: HomeBuyingGoal) => {
    if (updated.id) {
      const saved = await updateHomeBuyingGoalById(updated.id, updated)
      setGoals((prev) => prev.map((g) => (g.id === saved.id ? saved : g)))
    } else {
      const saved = await createHomeBuyingGoal({ ...updated, is_active: false })
      setGoals((prev) => [...prev, saved])
    }
    setEditing(false)
    setCreatingNew(false)
    setEditingGoal(null)
  }

  const handleDelete = async (id: number) => {
    await deleteHomeBuyingGoal(id)
    const remaining = goals.filter((g) => g.id !== id)
    setGoals(remaining)
    if (activeId === id) {
      const next = remaining[0]
      setActiveId(next?.id ?? null)
    }
    if (compareId === id) setCompareId(null)
  }

  if (loading || !goal) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <LoadingSpinner size="lg" />
        </div>
      </AppLayout>
    )
  }

  // ── Derived calculations ──────────────────────────────────────────────────
  const combinedIncome = goal.keaton_income + goal.katherine_income
  const keatonEligible = goal.keaton_income <= MMP_INCOME_LIMIT_1_2
  const katherineEligible = goal.katherine_income <= MMP_INCOME_LIMIT_1_2
  const bothEligible = combinedIncome <= MMP_INCOME_LIMIT_1_2
  const isMmpEligible =
    (goal.mortgage_structure === 'keaton_only' && keatonEligible) ||
    (goal.mortgage_structure === 'katherine_only' && katherineEligible) ||
    (goal.mortgage_structure === 'both' && bothEligible)

  const totalDPA = isMmpEligible ? MMP_DPA + HAP_DPA + PARTNER_MATCH : 0
  const firstTimeTaxSavings = Math.round((goal.target_price_min + goal.target_price_max) / 2 * 0.0025 + 350)

  // Savings timeline
  const HYSA_APY = 0.039
  const progressPct = Math.min(100, (goal.current_savings / goal.down_payment_target) * 100)
  const months = monthsToGoal(goal.current_savings, goal.down_payment_target, goal.monthly_savings_contribution, HYSA_APY)
  const projectedDate = addMonths(new Date().toISOString().slice(0, 10), months)
  const targetMonths = monthsUntil(goal.target_date)
  const onTrack = months <= targetMonths
  const requiredMo = requiredMonthly(goal.current_savings, goal.down_payment_target, targetMonths, HYSA_APY)

  // Midpoint price for scenario calculations
  const midPrice = (goal.target_price_min + goal.target_price_max) / 2

  // Income for affordability based on structure
  const qualifyingIncome =
    goal.mortgage_structure === 'keaton_only' ? goal.keaton_income :
    goal.mortgage_structure === 'katherine_only' ? goal.katherine_income :
    combinedIncome
  const maxHousingPayment = qualifyingIncome / 12 * 0.28
  const maxTotalDebt = qualifyingIncome / 12 * 0.36

  // Closing cost estimate (midpoint price)
  const closingCostEstimate = Math.round(midPrice * 0.024)

  // Transfer tax savings on midpoint price
  const taxSavings = Math.round(midPrice * 0.0025 + 350)

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-500/15 rounded-xl flex items-center justify-center flex-shrink-0">
              <Home size={20} className="text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-text-primary">Home Buying</h1>
              <p className="text-xs text-text-secondary">Frederick County, MD · Single Family, ~1 acre</p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={() => { setEditingGoal(goal); setEditing(true) }} className="flex items-center gap-1.5 flex-shrink-0">
            <Pencil size={14} /> Edit Goal
          </Button>
        </div>

        {/* ── Profile Picker ──────────────────────────────────────────────── */}
        {goals.length > 0 && (
          <div className="bg-surface border border-[#2d3748] rounded-2xl p-3">
            <div className="flex items-center justify-between gap-2 mb-2.5">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Goal Profiles</p>
              <div className="flex items-center gap-1.5">
                {compareId && (
                  <button
                    onClick={() => setCompareId(null)}
                    className="text-[10px] text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
                  >
                    <X size={10} /> Exit compare
                  </button>
                )}
                <button
                  onClick={() => { setEditingGoal({ ...DEFAULT_GOAL, name: `Profile ${goals.length + 1}`, is_active: false }); setCreatingNew(true); setEditing(true) }}
                  className="text-[10px] text-blue-400 hover:text-blue-300 flex items-center gap-1 px-2 py-1 rounded-lg border border-blue-500/30 hover:bg-blue-500/10 transition-colors"
                >
                  + New Profile
                </button>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {goals.map((g) => (
                <div key={g.id} className={[
                  'flex items-center gap-1.5 rounded-xl border px-2.5 py-1.5 transition-colors',
                  g.id === activeId ? 'border-primary bg-primary/10' : 'border-[#2d3748] bg-surface-2 hover:border-[#4a5568]',
                ].join(' ')}>
                  <button
                    onClick={() => g.id && handleActivate(g.id)}
                    className="text-xs font-semibold text-text-primary truncate max-w-[120px]"
                  >
                    {g.id === activeId && <span className="text-primary mr-1">●</span>}
                    {g.name}
                  </button>
                  {/* Compare toggle */}
                  {g.id !== activeId && (
                    <button
                      onClick={() => setCompareId(compareId === g.id ? null : (g.id ?? null))}
                      className={[
                        'text-[10px] px-1.5 py-0.5 rounded font-medium border transition-colors',
                        compareId === g.id
                          ? 'border-yellow-500/50 bg-yellow-500/15 text-yellow-400'
                          : 'border-[#2d3748] text-text-secondary hover:border-yellow-500/30 hover:text-yellow-400',
                      ].join(' ')}
                    >
                      {compareId === g.id ? 'comparing' : 'compare'}
                    </button>
                  )}
                  {/* Edit */}
                  <button
                    onClick={() => { setEditingGoal(g); setEditing(true) }}
                    className="text-text-secondary hover:text-text-primary"
                  >
                    <Pencil size={11} />
                  </button>
                  {/* Delete (only if not last) */}
                  {goals.length > 1 && (
                    <button
                      onClick={() => g.id && handleDelete(g.id)}
                      className="text-text-secondary hover:text-red-400"
                    >
                      <X size={11} />
                    </button>
                  )}
                </div>
              ))}
            </div>
            {compareId && compareGoal && (
              <p className="text-[10px] text-yellow-400 mt-2 flex items-center gap-1">
                <AlertTriangle size={10} />
                Comparing <strong>{goal.name}</strong> vs <strong>{compareGoal.name}</strong> — key differences highlighted below
              </p>
            )}
          </div>
        )}

        {/* ── Goal Snapshot ───────────────────────────────────────────────── */}
        <div className="bg-surface border border-[#2d3748] rounded-2xl p-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Price Target</p>
              <p className="text-sm font-bold text-text-primary">
                {fmt(goal.target_price_min)} – {fmt(goal.target_price_max)}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Target Date</p>
              <p className="text-sm font-bold text-text-primary">
                {new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}
              </p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Down Payment</p>
              <p className="text-sm font-bold text-text-primary">{fmt(goal.down_payment_target)}</p>
            </div>
            <div>
              <p className="text-[10px] text-text-secondary uppercase tracking-wider mb-0.5">Saved So Far</p>
              <p className="text-sm font-bold text-primary">{fmt(goal.current_savings)}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="mb-3">
            <div className="flex justify-between items-center mb-1">
              <span className="text-xs text-text-secondary">Savings progress</span>
              <span className="text-xs font-semibold text-text-primary">{progressPct.toFixed(0)}%</span>
            </div>
            <div className="h-2.5 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${progressPct}%`,
                  background: progressPct >= 100 ? '#10B981' : progressPct >= 60 ? '#3B82F6' : '#6366f1',
                }}
              />
            </div>
          </div>

          {/* Timeline callout */}
          <div className={[
            'flex items-start gap-2 p-3 rounded-xl text-xs',
            onTrack ? 'bg-green-500/10 border border-green-500/20' : 'bg-yellow-500/10 border border-yellow-500/20',
          ].join(' ')}>
            {onTrack
              ? <CheckCircle2 size={14} className="text-green-400 mt-0.5 flex-shrink-0" />
              : <AlertTriangle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            }
            <div>
              {onTrack ? (
                <span className="text-green-300">
                  At {fmt(goal.monthly_savings_contribution)}/mo, you&apos;ll reach {fmt(goal.down_payment_target)} by <strong>{projectedDate}</strong> — on track for your target.
                </span>
              ) : (
                <span className="text-yellow-300">
                  At {fmt(goal.monthly_savings_contribution)}/mo, you&apos;ll reach your goal by <strong>{projectedDate}</strong>.
                  To hit {fmt(goal.down_payment_target)} by your {new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' })} target,
                  you&apos;d need to save <strong>{fmt(requiredMo)}/mo</strong> ({targetMonths} months, at 3.9% <Tip text="APY = Annual Percentage Yield — the effective yearly return on your HYSA including compound interest. Your EverBank HYSA currently earns 3.9% APY, meaning $10,000 grows to ~$10,390 after one year, with interest compounding monthly.">APY</Tip>).
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ── Compare Panel ───────────────────────────────────────────────── */}
        {compareGoal && (() => {
          const cMid = (compareGoal.target_price_min + compareGoal.target_price_max) / 2
          const cCombined = compareGoal.keaton_income + compareGoal.katherine_income
          const cEligible =
            (compareGoal.mortgage_structure === 'keaton_only' && compareGoal.keaton_income <= MMP_INCOME_LIMIT_1_2) ||
            (compareGoal.mortgage_structure === 'katherine_only' && compareGoal.katherine_income <= MMP_INCOME_LIMIT_1_2) ||
            (compareGoal.mortgage_structure === 'both' && cCombined <= MMP_INCOME_LIMIT_1_2)
          const cDPA = cEligible ? MMP_DPA + HAP_DPA + PARTNER_MATCH : 0
          const cMonths = monthsToGoal(compareGoal.current_savings, compareGoal.down_payment_target, compareGoal.monthly_savings_contribution, 0.039)
          const rows: Array<{ label: string; a: string; b: string; highlight?: boolean }> = [
            { label: 'Price range', a: `${fmt(goal.target_price_min)}–${fmt(goal.target_price_max)}`, b: `${fmt(compareGoal.target_price_min)}–${fmt(compareGoal.target_price_max)}` },
            { label: 'Down payment target', a: fmt(goal.down_payment_target), b: fmt(compareGoal.down_payment_target), highlight: goal.down_payment_target !== compareGoal.down_payment_target },
            { label: 'Monthly savings', a: `${fmt(goal.monthly_savings_contribution)}/mo`, b: `${fmt(compareGoal.monthly_savings_contribution)}/mo`, highlight: goal.monthly_savings_contribution !== compareGoal.monthly_savings_contribution },
            { label: 'Months to goal', a: `${months} mo`, b: `${cMonths} mo`, highlight: Math.abs(months - cMonths) > 2 },
            { label: 'Mortgage structure', a: goal.mortgage_structure.replace('_', ' '), b: compareGoal.mortgage_structure.replace('_', ' '), highlight: goal.mortgage_structure !== compareGoal.mortgage_structure },
            { label: 'DPA available', a: fmt(totalDPA), b: fmt(cDPA), highlight: totalDPA !== cDPA },
            { label: 'Est. P&I (20% down, mid price)', a: `${fmt(monthlyPayment(midPrice * 0.8, ESTIMATED_RATE_2027))}/mo`, b: `${fmt(monthlyPayment(cMid * 0.8, ESTIMATED_RATE_2027))}/mo` },
            { label: 'Target date', a: new Date(goal.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), b: new Date(compareGoal.target_date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', year: 'numeric' }), highlight: goal.target_date !== compareGoal.target_date },
          ]
          return (
            <div className="bg-surface border-2 border-yellow-500/30 rounded-2xl p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle size={15} className="text-yellow-400" />
                <h2 className="text-sm font-bold text-text-primary">Side-by-Side Comparison</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#2d3748]">
                      <th className="text-left py-2 pr-3 text-text-secondary font-semibold uppercase tracking-wider text-[10px] w-1/3"></th>
                      <th className="text-left py-2 px-2 text-primary font-semibold uppercase tracking-wider text-[10px]">{goal.name}</th>
                      <th className="text-left py-2 px-2 text-yellow-400 font-semibold uppercase tracking-wider text-[10px]">{compareGoal.name}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.label} className={['border-b border-[#2d3748]/40 last:border-0', row.highlight ? 'bg-yellow-500/5' : ''].join(' ')}>
                        <td className="py-1.5 pr-3 text-text-secondary">{row.label}</td>
                        <td className="py-1.5 px-2 font-semibold text-text-primary">{row.a}</td>
                        <td className={['py-1.5 px-2 font-semibold', row.highlight ? 'text-yellow-400' : 'text-text-primary'].join(' ')}>{row.b}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )
        })()}

        {/* ── 💡 Mortgage Structure ────────────────────────────────────────── */}
        <div className="bg-surface border-2 border-blue-500/30 rounded-2xl p-4">
          <div className="flex items-start gap-3 mb-3">
            <Info size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold text-text-primary">Mortgage Strategy</h2>
                <InfoTooltip
                  title="Mortgage vs. deed — why this matters"
                  content={
                    <>
                      <p><strong>The mortgage</strong> is the debt instrument — it determines whose income counts for qualification and whose credit score lenders use. <strong>The deed</strong> is ownership — it determines who legally owns the home.</p>
                      <p className="mt-2">These are completely separate documents. Katherine can be on the deed (equal co-owner) without being on the mortgage. This is legal, common, and is the recommended structure for your situation.</p>
                      <p className="mt-2"><strong>Why it matters for you:</strong> Maryland DPA programs check the income of everyone on the mortgage application. Your combined income ($207,935) exceeds the MMP limit for 1–2 persons ($196,680), costing you $20,500 in free assistance. Keaton alone ($130,935) is under the limit.</p>
                    </>
                  }
                />
              </div>
              <p className="text-xs text-text-secondary mt-0.5">This decision is worth up to $20,500 in free <Tip text="DPA = Down Payment Assistance — money from state or county programs applied directly to your down payment at closing. Maryland stacks multiple DPA sources: MMP ($6K) + Frederick County HAP ($12K) + Lender Partner Match ($2.5K) = $20,500 total. This is real money you do not have to repay (except the MMP portion, which is deferred until sale).">down payment assistance</Tip></p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Keaton only */}
            <div className={[
              'rounded-xl p-3 border-2 transition-colors',
              goal.mortgage_structure === 'keaton_only' ? 'border-green-500/60 bg-green-500/8' : 'border-[#2d3748] bg-surface-2',
            ].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-text-primary">Keaton Only</p>
                <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded font-bold">Recommended</span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />
                <span className="text-xs text-text-secondary">Income: <strong className="text-text-primary">{fmt(goal.keaton_income)}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={13} className={keatonEligible ? 'text-green-400 flex-shrink-0' : 'text-red-400 flex-shrink-0'} />
                <span className="text-xs text-text-secondary">
                  <Tip text="MMP = Maryland Mortgage Program — a state program offering below-market mortgage rates and down payment assistance to first-time buyers. Income limit for 1–2 persons in Frederick County: $196,680. Only the people on the mortgage application are counted.">MMP</Tip> limit: <strong className={keatonEligible ? 'text-green-400' : 'text-red-400'}>
                    {keatonEligible ? '✓ Eligible' : '✗ Over limit'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-green-400 flex-shrink-0" />
                <span className="text-xs text-text-secondary"><Tip text="DPA = Down Payment Assistance — free money (grant or deferred loan) applied at closing toward your down payment. The MMP $6K portion is a deferred 0% second mortgage due on sale/refi. The HAP $12K is a grant. The $2.5K Partner Match is from the lender.">DPA</Tip> available: <strong className="text-green-400">{fmt(MMP_DPA + HAP_DPA + PARTNER_MATCH)}</strong></span>
              </div>
              <p className="text-[10px] text-blue-300 mt-2">Katherine goes on the deed — she&apos;s equal owner of the home</p>
            </div>

            {/* Both */}
            <div className={[
              'rounded-xl p-3 border-2 transition-colors',
              goal.mortgage_structure === 'both' ? 'border-red-500/60 bg-red-500/5' : 'border-[#2d3748] bg-surface-2',
            ].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-text-primary">Both on Mortgage</p>
                <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded font-bold">Caution</span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-text-secondary">Combined: <strong className="text-text-primary">{fmt(combinedIncome)}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <XCircle size={13} className="text-red-400 flex-shrink-0" />
                <span className="text-xs text-red-300">
                  Exceeds <Tip text="The MMP income limit for 1–2 persons in Frederick County is $196,680/year. Your combined income of $207,935 exceeds this by $11,255 — making you ineligible for MMP, HAP, and the Partner Match if both of you are on the mortgage.">MMP limit</Tip> by {fmt(combinedIncome - MMP_INCOME_LIMIT_1_2)}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <XCircle size={13} className="text-red-400 flex-shrink-0" />
                <span className="text-xs text-text-secondary"><Tip text="DPA = Down Payment Assistance. When both of you are on the mortgage, your combined income exceeds the MMP income limit, disqualifying you from all three stacked DPA programs: MMP ($6K) + HAP ($12K) + Partner Match ($2.5K) = $20,500 forfeited.">DPA</Tip> available: <strong className="text-red-400">$0</strong></span>
              </div>
              <p className="text-[10px] text-red-300 mt-2">Forfeits ~{fmt(MMP_DPA + HAP_DPA + PARTNER_MATCH)} in free <Tip text="DPA = Down Payment Assistance — $20,500 in combined MMP, HAP, and lender match grants/deferred loans that you lose by having both incomes on the mortgage application.">DPA</Tip> money</p>
            </div>

            {/* Katherine only */}
            <div className={[
              'rounded-xl p-3 border-2 transition-colors',
              goal.mortgage_structure === 'katherine_only' ? 'border-blue-500/60 bg-blue-500/5' : 'border-[#2d3748] bg-surface-2',
            ].join(' ')}>
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-text-primary">Katherine Only</p>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <span className="text-xs text-text-secondary">Income: <strong className="text-text-primary">{fmt(goal.katherine_income)}</strong></span>
              </div>
              <div className="flex items-center gap-1.5 mb-1">
                <CheckCircle2 size={13} className={katherineEligible ? 'text-green-400 flex-shrink-0' : 'text-red-400 flex-shrink-0'} />
                <span className="text-xs text-text-secondary">
                  MMP: <strong className={katherineEligible ? 'text-green-400' : 'text-red-400'}>
                    {katherineEligible ? '✓ Eligible' : '✗ Over limit'}
                  </strong>
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <CheckCircle2 size={13} className={katherineEligible ? 'text-green-400 flex-shrink-0' : 'text-text-secondary flex-shrink-0'} />
                <span className="text-xs text-text-secondary">DPA: <strong className={katherineEligible ? 'text-green-400' : 'text-muted'}>{katherineEligible ? fmt(MMP_DPA + HAP_DPA + PARTNER_MATCH) : '$0'}</strong></span>
              </div>
              <p className="text-[10px] text-text-secondary mt-2">Lower qualifying income — smaller max loan</p>
            </div>
          </div>
        </div>

        {/* ── MD Programs ─────────────────────────────────────────────────── */}
        <Card>
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary">MD First-Time Buyer Programs</h2>
              <InfoTooltip
                title="Maryland & Frederick County DPA programs"
                content={
                  <>
                    <p><strong>MMP 1st Time Advantage 6000</strong>: A $6,000 deferred second mortgage at 0% interest with no monthly payments. The balance is due only when you sell, refinance, or fully pay off the home — effectively free for the life of ownership.</p>
                    <p className="mt-2"><strong>Frederick County HAP</strong> (Homeownership Assistance Program): $12,000 county-level grant — this is free money, not a loan. Stackable on top of MMP so you can receive both simultaneously.</p>
                    <p className="mt-2"><strong>MMP Partner Match</strong>: $2,500 additional grant from participating MMP lenders. You must use an MMP-approved lender to access this — shop rates only with lenders on the MMP approved list.</p>
                    <p className="mt-2"><strong>Income limit rule</strong>: These programs check the income of everyone on the mortgage application. Katherine being on the deed but not the mortgage does not count against you.</p>
                  </>
                }
              />
            </div>
            <div className={[
              'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold',
              isMmpEligible ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400',
            ].join(' ')}>
              {isMmpEligible ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {isMmpEligible ? 'Eligible' : 'Not Eligible'}
            </div>
          </div>

          <div className="flex flex-col gap-2 mb-4">
            {[
              {
                name: 'MMP 1st Time Advantage 6000',
                amount: MMP_DPA,
                detail: 'Deferred 0% second mortgage — no monthly payments, due on sale/refi/payoff',
                tip: 'The Maryland Mortgage Program\'s flagship DPA product. The $6,000 is structured as a second lien on the property at 0% interest with no monthly payments. It only comes due when you sell the home, refinance, or pay off the primary mortgage. You can live there 20+ years and never pay it back during ownership.',
                eligible: isMmpEligible,
              },
              {
                name: 'Frederick County HAP',
                amount: HAP_DPA,
                detail: 'County grant — not a loan, stackable on top of MMP',
                tip: 'HAP = Homeownership Assistance Program, administered by Frederick County. This $12,000 is a true grant — it does not need to be repaid. It is separate from MMP and can be combined with it. You apply through the county, not the lender. Contact Frederick County Community Development at 301-600-1704 to apply.',
                eligible: isMmpEligible,
              },
              {
                name: 'MMP Partner Match',
                amount: PARTNER_MATCH,
                detail: 'Lender grant — only from MMP-approved participating lenders',
                tip: 'Certain MMP-approved lenders offer an additional $2,500 as an incentive for using MMP financing. This is separate from the MMP and HAP programs. When comparing lenders, specifically ask: "Are you an MMP participating lender eligible for the Partner Match?" Not all MMP lenders offer it — shop the approved list.',
                eligible: isMmpEligible,
              },
              {
                name: 'First-Time Buyer Transfer Tax Savings',
                amount: taxSavings,
                detail: `MD state transfer tax exemption (0.25% of price, est. on ${fmt(midPrice)})`,
                tip: 'Maryland charges a state transfer tax of 0.5% of the purchase price, split between buyer and seller (0.25% each). First-time homebuyers are fully exempt from paying their half. On a $440K home, that saves you ~$1,100. Neither you nor Katherine has owned a home in Maryland in the past 3 years, so you both qualify as first-time buyers.',
                eligible: true,
              },
            ].map((prog) => (
              <div key={prog.name} className="flex items-center justify-between gap-3 py-2 border-b border-[#2d3748]/50 last:border-0">
                <div className="flex items-start gap-2 min-w-0">
                  {prog.eligible
                    ? <CheckCircle2 size={14} className="text-green-400 flex-shrink-0 mt-0.5" />
                    : <XCircle size={14} className="text-red-400/50 flex-shrink-0 mt-0.5" />
                  }
                  <div className="min-w-0">
                    <p className={`text-sm font-medium ${prog.eligible ? 'text-text-primary' : 'text-text-secondary/50 line-through'}`}>
                      <Tip text={prog.tip}>{prog.name}</Tip>
                    </p>
                    <p className="text-xs text-text-secondary">{prog.detail}</p>
                  </div>
                </div>
                <span className={`text-sm font-bold flex-shrink-0 ${prog.eligible ? 'text-green-400' : 'text-text-secondary/30'}`}>
                  +{fmt(prog.amount)}
                </span>
              </div>
            ))}
          </div>

          <div className={[
            'flex items-center justify-between p-3 rounded-xl',
            isMmpEligible ? 'bg-green-500/10 border border-green-500/20' : 'bg-surface-2 border border-[#2d3748]',
          ].join(' ')}>
            <div>
              <p className="text-xs text-text-secondary">Total assistance available</p>
              <p className={`text-lg font-bold ${isMmpEligible ? 'text-green-400' : 'text-text-secondary'}`}>
                {isMmpEligible ? '+' : ''}{fmt(totalDPA + taxSavings)}
              </p>
            </div>
            {isMmpEligible && (
              <div className="text-right">
                <p className="text-xs text-text-secondary">Effective down payment needed</p>
                <p className="text-base font-bold text-primary">
                  {fmt(Math.max(0, goal.down_payment_target - totalDPA))}
                </p>
                <p className="text-[10px] text-text-secondary">after DPA applied</p>
              </div>
            )}
          </div>

          {!isMmpEligible && (
            <p className="text-xs text-red-300 mt-2 flex items-start gap-1.5">
              <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
              Switch to &ldquo;Keaton Only&rdquo; mortgage structure (above) to unlock {fmt(MMP_DPA + HAP_DPA + PARTNER_MATCH)} in down payment assistance.
            </p>
          )}
        </Card>

        {/* ── Down Payment Scenarios ───────────────────────────────────────── */}
        <Card>
          <button
            onClick={() => setScenariosOpen(o => !o)}
            className="w-full flex items-center justify-between mb-0"
          >
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-text-primary">Down Payment Scenarios</h2>
              <InfoTooltip
                title="How these numbers work"
                content={
                  <>
                    <p><strong>Rate:</strong> 6.5% 30-year fixed — a conservative estimate for 2027–2028. Lower rates are possible; each 0.25% drop saves ~$60/mo on a $400K loan.</p>
                    <p className="mt-2"><strong>PMI</strong> (Private Mortgage Insurance): Required by lenders when your down payment is under 20%. Protects the lender if you default. Typically 0.5–0.8% of the loan per year. Not permanent — you can cancel it once you reach 20% equity (80% LTV), which happens around year 8–10 on most 30-year loans at 20% starting equity.</p>
                    <p className="mt-2"><strong>P&amp;I only</strong> — these payments are just principal + interest. Add ~$450–650/mo for Frederick County property taxes (~1.1% of assessed value/yr), homeowner&apos;s insurance (~$1,400–1,800/yr), and any HOA dues.</p>
                  </>
                }
              />
            </div>
            {scenariosOpen ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
          </button>

          {scenariosOpen && (
            <div className="mt-3 overflow-x-auto">
              <p className="text-xs text-text-secondary mb-3">
                At 6.5% rate (est. 2027–28) · <Tip text="P&I = Principal & Interest — the base monthly mortgage payment calculated from your loan amount, rate, and term. Does not include property taxes (~$400–500/mo in Frederick County), homeowner's insurance (~$120–150/mo), or PMI.">P&amp;I</Tip> only · add ~$450–650/mo for taxes &amp; insurance
              </p>
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[#2d3748]">
                    <th className="text-left py-2 pr-3 text-text-secondary font-semibold uppercase tracking-wider text-[10px]">Price</th>
                    {DOWN_PCT_OPTIONS.map((pct) => (
                      <th key={pct} className={[
                        'text-right py-2 px-2 font-semibold uppercase tracking-wider text-[10px]',
                        pct === 0.20 ? 'text-green-400' : 'text-text-secondary',
                      ].join(' ')}>
                        {pct * 100}% down
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[goal.target_price_min, midPrice, goal.target_price_max].map((price, pi) => (
                    <tr key={price} className={pi < 2 ? 'border-b border-[#2d3748]/40' : ''}>
                      <td className="py-2 pr-3 align-top">
                        <span className="font-semibold text-text-primary">
                          {price === midPrice ? (
                            <span className="text-blue-400">{fmt(price)} <span className="text-[10px]">mid</span></span>
                          ) : fmt(price)}
                        </span>
                      </td>
                      {DOWN_PCT_OPTIONS.map((pct) => {
                        const dp = price * pct
                        const loan = price - dp
                        const pi_payment = monthlyPayment(loan, ESTIMATED_RATE_2027)
                        const pmiMonthly = pct < 0.20 ? loan * 0.006 / 12 : 0
                        const total = pi_payment + pmiMonthly
                        return <ScenarioCell key={pct} dp={dp} loan={loan} pmt={pi_payment} pmi={pmiMonthly} total={total} highlight={pct === 0.20} />
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Legend */}
              <div className="flex flex-wrap gap-3 mt-3 pt-3 border-t border-[#2d3748]/50">
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-green-500/20 border border-green-500/40" />
                  <span className="text-[10px] text-text-secondary">20% down — no <Tip text="PMI = Private Mortgage Insurance — lender-required insurance when your down payment is under 20%. Protects the lender (not you) if you default. Typically 0.5–0.8% of the loan per year, added to your monthly payment. It is NOT permanent — once you reach 20% equity you can request cancellation, and lenders must remove it automatically at 22% equity by law (Homeowners Protection Act).">PMI</Tip></span>
                </div>
                <div className="flex items-center gap-1.5">
                  <div className="w-2.5 h-2.5 rounded bg-yellow-500/10 border border-yellow-500/30" />
                  <span className="text-[10px] text-text-secondary">&lt;20% down — <Tip text="PMI = Private Mortgage Insurance — added to your monthly payment when you put less than 20% down. Cancellable once your loan balance drops to 80% of the home's value (called 80% LTV — Loan-to-Value). You can reach 80% LTV through payments over time OR through home appreciation — you can request a new appraisal if values have risen.">PMI</Tip> included (cancellable at 80% <Tip text="LTV = Loan-to-Value ratio — your remaining loan balance divided by the home's current appraised value. Example: $320K loan on a $400K home = 80% LTV. When you cross 80% LTV (20% equity), you can legally request PMI removal. At 78% LTV, lenders must remove it automatically.">LTV</Tip>)</span>
                </div>
              </div>
            </div>
          )}
        </Card>

        {/* ── Affordability + Closing Costs (2-col on desktop) ───────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Affordability */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-text-primary">Affordability Analysis</h2>
              <InfoTooltip
                title="How lenders calculate your max loan"
                content={
                  <>
                    <p><strong>DTI = Debt-to-Income ratio</strong> — your monthly debt payments divided by gross monthly income. Lenders use two DTI thresholds to determine how much you can borrow.</p>
                    <p className="mt-2"><strong>Front-end DTI (28%):</strong> Housing costs only — P&amp;I + property taxes + homeowner&apos;s insurance + PMI. Conventional loans prefer ≤28%, but up to 31–33% is often approved.</p>
                    <p className="mt-2"><strong>Back-end DTI (36%):</strong> All monthly debts including housing + any car loans + student loans + minimum credit card payments. Conventional loans allow 45–50% with strong compensating factors (high credit score, significant cash reserves, stable employment history).</p>
                    <p className="mt-2"><strong>Your situation:</strong> You&apos;ll have no student loans at purchase, which gives you an unusually clean DTI — virtually all of your allowable debt can go toward housing.</p>
                  </>
                }
              />
            </div>

            <div className="text-xs text-text-secondary mb-3">
              Based on: <span className="font-semibold text-text-primary">
                {goal.mortgage_structure === 'both' ? 'Combined income' :
                  goal.mortgage_structure === 'keaton_only' ? "Keaton's income" : "Katherine's income"}
              </span> ({fmt(qualifyingIncome)}/yr)
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex justify-between items-center py-2 border-b border-[#2d3748]/50">
                <span className="text-xs text-text-secondary">Gross monthly income</span>
                <span className="text-sm font-semibold text-text-primary">{fmt(qualifyingIncome / 12)}</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#2d3748]/50">
                <span className="text-xs text-text-secondary">Max housing payment (<Tip text="Front-end DTI = housing costs only (P&I + taxes + insurance + PMI) as a percentage of gross monthly income. 28% is the conventional guideline. Going higher is common — lenders routinely approve 31–33% with good credit and stable income.">28% DTI</Tip>)</span>
                <span className="text-sm font-semibold text-blue-400">{fmt(maxHousingPayment)}/mo</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#2d3748]/50">
                <span className="text-xs text-text-secondary">Max all debts (<Tip text="Back-end DTI = all monthly debt payments (housing + car + student loans + credit cards) as a percentage of gross income. 36% is the traditional guideline. Conventional loans (Fannie/Freddie) allow up to 45–50% with compensating factors. Since you'll have no student loans at purchase, almost your entire back-end allowance is available for housing.">36% DTI</Tip>)</span>
                <span className="text-sm font-semibold text-text-primary">{fmt(maxTotalDebt)}/mo</span>
              </div>
              <div className="flex justify-between items-center py-2 border-b border-[#2d3748]/50">
                <span className="text-xs text-text-secondary">Est. payment on {fmt(goal.target_price_min)} (20% down)</span>
                <span className="text-sm font-semibold text-green-400">{fmt(monthlyPayment(goal.target_price_min * 0.8, ESTIMATED_RATE_2027))}/mo</span>
              </div>
              <div className="flex justify-between items-center py-2">
                <span className="text-xs text-text-secondary">Est. payment on {fmt(goal.target_price_max)} (20% down)</span>
                <span className="text-sm font-semibold text-text-primary">{fmt(monthlyPayment(goal.target_price_max * 0.8, ESTIMATED_RATE_2027))}/mo</span>
              </div>
            </div>

            <div className="mt-3 p-2.5 rounded-lg bg-green-500/10 border border-green-500/20">
              <p className="text-xs text-green-300">
                <CheckCircle2 size={12} className="inline mr-1" />
                Your target price range is well within comfortable DTI limits. Plenty of room for taxes, insurance, and savings.
              </p>
            </div>
          </Card>

          {/* Closing Costs */}
          <Card>
            <div className="flex items-center gap-2 mb-3">
              <h2 className="text-sm font-bold text-text-primary">Closing Cost Estimate</h2>
              <InfoTooltip
                title="What you'll pay at closing"
                content={
                  <>
                    <p>Closing costs are typically 2–3% of the purchase price, paid at settlement (the day you sign and get keys). These are separate from your down payment — you need both in the bank.</p>
                    <p className="mt-2"><strong>Seller concessions:</strong> Very commonly negotiated. You ask the seller to credit you 2–3% of the purchase price at closing to cover your costs. This is built into the offer price. In a normal market, many sellers agree. Your DPA programs may limit how much seller concession you can receive — check with your MMP lender.</p>
                    <p className="mt-2"><strong>First-time buyer transfer tax exemption:</strong> Maryland charges a state transfer tax of 0.5% of the purchase price. First-time buyers are exempt from the buyer&apos;s half (0.25%), saving you ~$1,000–1,300 at a $400K–$520K price point.</p>
                  </>
                }
              />
            </div>

            <p className="text-xs text-text-secondary mb-3">Estimated on a {fmt(midPrice)} home</p>

            <div className="flex flex-col gap-1.5">
              {[
                {
                  label: 'Lender origination & fees',
                  amount: Math.round(midPrice * 0.005),
                  tip: 'Origination fee = what the lender charges to process your loan. Typically 0.5–1% of the loan amount. This IS negotiable — ask the lender to reduce origination fees, especially when comparing offers. Some lenders advertise "no origination fee" but make up the difference in rate.',
                },
                {
                  label: 'Title insurance & settlement',
                  amount: 1800,
                  tip: "Title insurance protects against defects in the property's ownership history (old liens, boundary errors, fraudulent past transfers). There are two policies: Lender's title policy (required) and Owner's title policy (optional but recommended for ~$300–500 extra). In Maryland, the buyer typically pays for both. Settlement/escrow company fees (~$500–800) are also included here.",
                },
                {
                  label: 'Appraisal & home inspection',
                  amount: 1100,
                  tip: "Appraisal (~$600–800): Lender-required independent valuation confirming the home is worth at least the purchase price. Paid upfront before closing. Home inspection (~$400–600): YOU hire this — a licensed inspector examines the structure, systems, and safety. Never skip this. Use findings to negotiate repairs or price reduction.",
                },
                {
                  label: 'Prepaid (escrow, homeowners ins.)',
                  amount: 3200,
                  tip: 'Lenders require you to fund an escrow account at closing with 2–3 months of property taxes and homeowner\'s insurance. This money is yours — it pays your first tax bills and insurance premium. You also pay the first year of homeowner\'s insurance upfront (~$1,400–1,800). This is the biggest variable cost item at closing.',
                },
                {
                  label: 'Recording fees & misc.',
                  amount: 750,
                  tip: "Maryland charges fees to record the deed and mortgage with the county land records. Also includes courier fees, notary, and minor administrative charges. Relatively fixed — not much room to negotiate here.",
                },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center py-1.5 border-b border-[#2d3748]/40 last:border-0">
                  <span className="text-xs text-text-secondary"><Tip text={item.tip}>{item.label}</Tip></span>
                  <span className="text-sm text-text-primary font-medium">{fmt(item.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between items-center py-1.5 text-green-400">
                <span className="text-xs"><Tip text="Maryland state transfer tax is 0.5% of the purchase price, split equally between buyer and seller (0.25% each). First-time homebuyers in Maryland are exempt from their 0.25% share. Since neither you nor Katherine has owned a primary residence in MD in the past 3 years, you both qualify. This is automatically applied — your settlement agent handles the exemption documentation.">First-time buyer tax savings</Tip></span>
                <span className="text-sm font-medium">−{fmt(taxSavings)}</span>
              </div>
            </div>

            <div className="mt-3 flex justify-between items-center p-3 bg-surface-2 rounded-xl">
              <span className="text-sm font-semibold text-text-primary">Estimated Total</span>
              <span className="text-base font-bold text-primary">{fmt(closingCostEstimate - taxSavings)}</span>
            </div>

            <p className="text-[10px] text-text-secondary mt-2">
              💡 <Tip text="Seller concessions = the seller agrees to credit you money at closing to cover your costs. You ask for this in your initial offer — e.g., 'Buyer requests 2.5% seller concession toward closing costs.' Conventional loans allow up to 3% seller concession for down payments under 10%, and up to 6% for 10%+ down. MMP loans may have different limits — confirm with your lender. Common strategy: offer slightly above asking price and request concessions to net out your closing cost exposure.">Seller concessions</Tip>: Ask the seller to cover closing costs (up to 3% of price in your offer). Very common and can eliminate most out-of-pocket closing costs.
            </p>
          </Card>
        </div>

        {/* ── Area Guide ──────────────────────────────────────────────────── */}
        <Card>
          <button
            onClick={() => setAreaOpen(o => !o)}
            className="w-full flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <MapPin size={15} className="text-blue-400" />
              <h2 className="text-sm font-bold text-text-primary">Northern MD Area Guide</h2>
              <span className="text-[10px] text-text-secondary">Single family, ~1 acre</span>
            </div>
            {areaOpen ? <ChevronUp size={16} className="text-text-secondary" /> : <ChevronDown size={16} className="text-text-secondary" />}
          </button>

          {areaOpen && (
            <div className="mt-3 flex flex-col gap-2">
              {AREA_GUIDE.map((a) => {
                const withinBudget = a.min <= goal.target_price_max
                const partiallyInRange = a.min <= goal.target_price_max && a.max >= goal.target_price_min
                return (
                  <div
                    key={a.area}
                    className={[
                      'p-3 rounded-xl border transition-colors',
                      partiallyInRange ? 'border-blue-500/30 bg-blue-500/5' : 'border-[#2d3748] bg-surface-2 opacity-70',
                    ].join(' ')}
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <MapPin size={12} className={partiallyInRange ? 'text-blue-400 flex-shrink-0' : 'text-text-secondary flex-shrink-0'} />
                        <p className="text-sm font-semibold text-text-primary truncate">{a.area}</p>
                        {partiallyInRange && (
                          <span className="text-[10px] bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded flex-shrink-0">In range</span>
                        )}
                        {!withinBudget && (
                          <span className="text-[10px] bg-yellow-500/15 text-yellow-400 px-1.5 py-0.5 rounded flex-shrink-0">Over budget</span>
                        )}
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-xs font-bold text-text-primary">{fmt(a.min)} – {fmt(a.max)}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-xs text-text-secondary">{a.notes}</p>
                        <p className="text-[10px] text-text-secondary mt-0.5">{a.commute}</p>
                      </div>
                      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
                        <p className="text-[10px] text-text-secondary">Acreage</p>
                        <AcreageStars count={a.acreage} />
                      </div>
                    </div>
                  </div>
                )
              })}

              <p className="text-[10px] text-text-secondary mt-1 px-1">
                Prices are approximate medians as of 2025–2026. Northern Frederick County (Walkersville, Jefferson, Thurmont) offers the best 1-acre availability for the price. Work with a Frederick County buyer&apos;s agent who specializes in rural/acreage properties.
              </p>
            </div>
          )}
        </Card>

      </div>

      {editing && editingGoal && (
        <EditGoalModal goal={editingGoal} onSave={handleSave} onClose={() => { setEditing(false); setEditingGoal(null); setCreatingNew(false) }} />
      )}
    </AppLayout>
  )
}

// ─── Scenario table cell helper ──────────────────────────────────────────────

function ScenarioCell({ dp, loan, pmt, pmi, total, highlight }: {
  dp: number; loan: number; pmt: number; pmi: number; total: number; highlight: boolean
}) {
  return (
    <td className={[
      'text-right py-2 px-2 align-top',
      highlight ? 'bg-green-500/5' : '',
    ].join(' ')}>
      <div className={`text-xs font-bold ${highlight ? 'text-green-400' : 'text-text-primary'}`}>
        {fmt(dp)}
      </div>
      <div className="text-[10px] text-text-secondary">
        loan {fmt(loan)}
      </div>
      <div className={`text-xs font-semibold mt-0.5 ${highlight ? 'text-green-300' : 'text-text-primary'}`}>
        {fmt(total)}/mo
      </div>
      {pmi > 0 ? (
        <div className="text-[10px] text-yellow-400">
          <Tip text={`PMI = Private Mortgage Insurance — added because your down payment is under 20%. This estimate is ~0.6%/yr of the loan. PMI is cancellable once you reach 80% LTV (20% equity) through payments + appreciation. Estimated PMI here: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(pmi)}/mo.`}>+PMI</Tip>
        </div>
      ) : (
        <div className="text-[10px] text-green-400">
          <Tip text="No PMI required — your down payment is 20% or more. This saves roughly $150–250/mo compared to a lower down payment, and that savings compounds over the life of the loan.">no PMI</Tip>
        </div>
      )}
    </td>
  )
}
