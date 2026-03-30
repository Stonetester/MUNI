'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import { getTransactions, getCategories, getJointTransactions } from '@/lib/api'
import { Transaction, Category } from '@/lib/types'
import { useViewMode } from '@/lib/viewMode'
import { formatCurrency } from '@/lib/utils'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import LoadingSpinner from '@/components/ui/LoadingSpinner'

// ─── Mini SVG Pie Chart ────────────────────────────────────────────────────────

function MiniPie({ segments }: { segments: { color: string; value: number }[] }) {
  const total = segments.reduce((s, d) => s + d.value, 0)
  if (total === 0 || segments.length === 0) return null
  const cx = 16, cy = 16, r = 14
  if (segments.length === 1) {
    return (
      <svg width={32} height={32}>
        <circle cx={cx} cy={cy} r={r} fill={segments[0].color} />
      </svg>
    )
  }
  let angle = -Math.PI / 2
  return (
    <svg width={32} height={32}>
      {segments.map((seg, i) => {
        const sweep = (seg.value / total) * 2 * Math.PI
        const end = angle + sweep
        const x1 = cx + r * Math.cos(angle)
        const y1 = cy + r * Math.sin(angle)
        const x2 = cx + r * Math.cos(end)
        const y2 = cy + r * Math.sin(end)
        const large = sweep > Math.PI ? 1 : 0
        const d = `M ${cx} ${cy} L ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)} Z`
        angle = end
        return <path key={i} d={d} fill={seg.color} />
      })}
    </svg>
  )
}

// ─── Day Detail Modal ──────────────────────────────────────────────────────────

function DayModal({
  date,
  transactions,
  colorMap,
  onClose,
}: {
  date: string
  transactions: Transaction[]
  colorMap: Record<string, string>
  onClose: () => void
}) {
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const dateObj = new Date(date + 'T00:00:00')
  const label = dateObj.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })

  const expenses = transactions.filter((t) => t.amount < 0)
  const income = transactions.filter((t) => t.amount > 0)
  const totalSpent = expenses.reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalIncome = income.reduce((s, t) => s + t.amount, 0)

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border border-[#2d3748] rounded-2xl shadow-2xl w-full max-w-md max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#2d3748]">
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Daily Transactions</p>
            <h2 className="text-base font-bold text-text-primary">{label}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Summary */}
        <div className="flex gap-4 px-5 py-3 border-b border-[#2d3748]">
          {totalIncome > 0 && (
            <div>
              <p className="text-xs text-text-secondary">Income</p>
              <p className="text-sm font-bold text-green-400">{formatCurrency(totalIncome)}</p>
            </div>
          )}
          {totalSpent > 0 && (
            <div>
              <p className="text-xs text-text-secondary">Spent</p>
              <p className="text-sm font-bold text-red-400">{formatCurrency(totalSpent)}</p>
            </div>
          )}
          <div className="text-xs text-muted self-end pb-0.5">{transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 flex flex-col gap-1.5">
          {transactions
            .slice()
            .sort((a, b) => a.amount - b.amount)
            .map((t) => (
              <div key={t.id} className="flex items-center justify-between gap-3 py-2 border-b border-[#2d3748]/50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: t.category_name ? (colorMap[t.category_name] || '#94a3b8') : '#94a3b8' }}
                  />
                  <div className="min-w-0">
                    <p className="text-sm text-text-primary truncate">{t.description}</p>
                    {t.category_name && (
                      <p className="text-xs text-text-secondary">{t.category_name}</p>
                    )}
                  </div>
                </div>
                <span className={`text-sm font-semibold flex-shrink-0 ${t.amount < 0 ? 'text-red-400' : 'text-green-400'}`}>
                  {t.amount < 0 ? '-' : '+'}{formatCurrency(Math.abs(t.amount))}
                </span>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}

// ─── Calendar Page ─────────────────────────────────────────────────────────────

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

export default function CalendarPage() {
  const { mode } = useViewMode()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1) // 1-indexed
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedDay, setSelectedDay] = useState<string | null>(null)

  const colorMap = Object.fromEntries(categories.map((c) => [c.name, c.color]))

  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`
  const lastDay = new Date(year, month, 0).getDate()
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`

  const load = useCallback(async () => {
    setLoading(true)
    try {
      if (mode === 'joint') {
        // Fetch enough transactions to cover the full month (joint endpoint uses offset/limit)
        const txns = await getJointTransactions(2000, 0)
        // Filter to selected month client-side since joint endpoint doesn't support date filters yet
        const filtered = txns.items.filter(
          (t) => t.date >= fromDate && t.date <= toDate
        )
        setTransactions(filtered)
      } else {
        const [txns, cats] = await Promise.all([
          getTransactions({ from_date: fromDate, to_date: toDate, limit: 2000 }),
          getCategories(),
        ])
        setTransactions(txns.items)
        setCategories(cats)
      }
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [fromDate, toDate, mode])

  useEffect(() => { load() }, [load])

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear((y) => y - 1) }
    else setMonth((m) => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear((y) => y + 1) }
    else setMonth((m) => m + 1)
  }

  // Group transactions by date string "YYYY-MM-DD"
  const byDay: Record<string, Transaction[]> = {}
  for (const t of transactions) {
    const d = t.date.slice(0, 10)
    if (!byDay[d]) byDay[d] = []
    byDay[d].push(t)
  }

  // Build calendar grid
  const firstWeekday = new Date(year, month - 1, 1).getDay() // 0=Sun
  const daysInMonth = new Date(year, month, 0).getDate()
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  // Pad to complete the last row
  while (cells.length % 7 !== 0) cells.push(null)

  const today = new Date()
  const isToday = (day: number) =>
    today.getFullYear() === year && today.getMonth() + 1 === month && today.getDate() === day

  function getDayKey(day: number) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  function getPieSegments(dayTxns: Transaction[]) {
    const catTotals: Record<string, { color: string; value: number }> = {}
    for (const t of dayTxns) {
      if (t.amount >= 0) continue // only expenses
      const name = t.category_name || 'Other'
      const color = colorMap[name] || '#94a3b8'
      if (!catTotals[name]) catTotals[name] = { color, value: 0 }
      catTotals[name].value += Math.abs(t.amount)
    }
    return Object.values(catTotals)
  }

  function getDayIncome(dayTxns: Transaction[]) {
    return dayTxns.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  }

  const selectedTxns = selectedDay ? (byDay[selectedDay] || []) : []

  // Monthly summary
  const totalSpent = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
  const totalIncome = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
  const daysWithSpending = Object.keys(byDay).filter((d) => byDay[d].some((t) => t.amount < 0)).length

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {/* Header + nav */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={prevMonth} className="p-2 rounded-xl hover:bg-surface-2 text-text-secondary transition-colors">
              <ChevronLeft size={18} />
            </button>
            <h2 className="text-lg font-bold text-text-primary w-44 text-center">
              {MONTHS[month - 1]} {year}
            </h2>
            <button onClick={nextMonth} className="p-2 rounded-xl hover:bg-surface-2 text-text-secondary transition-colors">
              <ChevronRight size={18} />
            </button>
          </div>

          {!loading && (
            <div className="hidden sm:flex items-center gap-4 text-sm">
              <div>
                <span className="text-text-secondary text-xs">Spent </span>
                <span className="font-semibold text-red-400">{formatCurrency(totalSpent)}</span>
              </div>
              <div>
                <span className="text-text-secondary text-xs">Income </span>
                <span className="font-semibold text-green-400">{formatCurrency(totalIncome)}</span>
              </div>
              <div>
                <span className="text-text-secondary text-xs">{daysWithSpending} days with spending</span>
              </div>
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-96">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <div className="bg-surface border border-[#2d3748] rounded-2xl overflow-hidden">
            {/* Day-of-week header */}
            <div className="grid grid-cols-7 border-b border-[#2d3748]">
              {DAY_LABELS.map((d) => (
                <div key={d} className="py-2 text-center text-xs font-semibold text-text-secondary">
                  {d}
                </div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7">
              {cells.map((day, i) => {
                if (!day) {
                  return <div key={`empty-${i}`} className="min-h-[60px] sm:min-h-[80px] border-b border-r border-[#2d3748]/50" />
                }
                const key = getDayKey(day)
                const dayTxns = byDay[key] || []
                const segments = getPieSegments(dayTxns)
                const hasSpending = segments.length > 0
                const dayTotal = dayTxns.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0)
                const dayIncome = getDayIncome(dayTxns)
                const hasTxns = dayTxns.length > 0

                return (
                  <div
                    key={key}
                    onClick={() => hasTxns && setSelectedDay(key)}
                    className={[
                      'min-h-[60px] sm:min-h-[88px] border-b border-r border-[#2d3748]/50 p-0.5 sm:p-1 flex flex-col items-center gap-0.5 transition-colors',
                      hasTxns ? 'cursor-pointer hover:bg-surface-2' : '',
                      isToday(day) ? 'bg-primary/5' : '',
                    ].join(' ')}
                  >
                    <span className={[
                      'text-xs font-medium w-6 h-6 flex items-center justify-center rounded-full flex-shrink-0',
                      isToday(day) ? 'bg-primary text-white' : 'text-text-secondary',
                    ].join(' ')}>
                      {day}
                    </span>

                    {/* Income — shown separately above spending */}
                    {dayIncome > 0 && (
                      <span className="text-[9px] font-semibold text-green-400 leading-none px-1 py-0.5 bg-green-400/10 rounded">
                        +{formatCurrency(dayIncome)}
                      </span>
                    )}

                    {/* Spending pie + amount */}
                    {hasSpending && (
                      <>
                        <MiniPie segments={segments} />
                        <span className="text-[9px] text-red-400 leading-none">
                          −{formatCurrency(dayTotal)}
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Legend */}
        {!loading && categories.length > 0 && (() => {
          const usedNames = new Set(transactions.map(t => t.category_name).filter(Boolean))
          const legendCats = categories.filter(c => usedNames.has(c.name) && c.kind === 'expense')
          return (
            <div className="flex flex-wrap gap-2 items-center">
              <div className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                <div className="w-2.5 h-2.5 rounded bg-green-400/20 border border-green-400/40" />
                Income / payday
              </div>
              {legendCats.map((c) => (
                <div key={c.id} className="flex items-center gap-1.5 text-xs text-text-secondary">
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                  {c.name}
                </div>
              ))}
            </div>
          )
        })()}
      </div>

      {selectedDay && (
        <DayModal
          date={selectedDay}
          transactions={selectedTxns}
          colorMap={colorMap}
          onClose={() => setSelectedDay(null)}
        />
      )}
    </AppLayout>
  )
}
