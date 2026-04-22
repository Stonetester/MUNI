'use client'

import { useState } from 'react'
import { formatCurrency } from '@/lib/utils'

// ─── Category grouping ────────────────────────────────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  // Food
  'Groceries': 'Food',
  'Dining Out': 'Food',
  'Coffee': 'Food',
  'Fast Food': 'Food',
  'Restaurants': 'Food',
  // Housing
  'Rent': 'Housing',
  'Mortgage': 'Housing',
  'HOA': 'Housing',
  'Repairs': 'Housing',
  'Home Maintenance': 'Housing',
  // Transport
  'Gas': 'Transport',
  'Car Payment': 'Transport',
  'Parking': 'Transport',
  'Uber': 'Transport',
  'Lyft': 'Transport',
  'Transit': 'Transport',
  'Car Insurance': 'Transport',
  // Subscriptions
  'Netflix': 'Subscriptions',
  'Spotify': 'Subscriptions',
  'Hulu': 'Subscriptions',
  'Amazon Prime': 'Subscriptions',
  'Apple': 'Subscriptions',
  'Subscriptions': 'Subscriptions',
  'Streaming': 'Subscriptions',
  // Healthcare
  'Medical': 'Healthcare',
  'Pharmacy': 'Healthcare',
  'Dental': 'Healthcare',
  'Vision': 'Healthcare',
  'Healthcare': 'Healthcare',
  'Health': 'Healthcare',
  // Utilities
  'Electric': 'Utilities',
  'Water': 'Utilities',
  'Internet': 'Utilities',
  'Phone': 'Utilities',
  'Utilities': 'Utilities',
  // Shopping
  'Clothing': 'Shopping',
  'Shopping': 'Shopping',
  'Amazon': 'Shopping',
  // Entertainment
  'Entertainment': 'Entertainment',
  'Games': 'Entertainment',
  'Events': 'Entertainment',
  // Savings
  'Savings': 'Savings',
  '401k': 'Savings',
  'IRA': 'Savings',
  'Investments': 'Savings',
}

const GROUP_COLORS: Record<string, string> = {
  Food: '#f59e0b',
  Housing: '#6366f1',
  Transport: '#3b82f6',
  Subscriptions: '#8b5cf6',
  Healthcare: '#10b981',
  Utilities: '#14b8a6',
  Shopping: '#ec4899',
  Entertainment: '#a855f7',
  Savings: '#22c55e',
  Other: '#94a3b8',
}

const RAW_COLORS = [
  '#10b981', '#14b8a6', '#3b82f6', '#8b5cf6',
  '#f59e0b', '#ef4444', '#ec4899', '#06b6d4',
  '#a855f7', '#f97316', '#6366f1', '#84cc16',
]

function groupCategories(byCategory: Record<string, number>): Record<string, number> {
  const grouped: Record<string, number> = {}
  for (const [name, val] of Object.entries(byCategory)) {
    const group = CATEGORY_MAP[name] ?? 'Other'
    grouped[group] = (grouped[group] ?? 0) + val
  }
  return grouped
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface FlowData {
  income: number
  spending: number
  savings: number
  byCategory: Record<string, number>
}

interface FlowEntry {
  name: string
  amount: number
  color: string
  pct: number
}

// ─── Vertical Flow (Mode A) ───────────────────────────────────────────────────

function VerticalFlow({ data, simplified }: { data: FlowData; simplified: boolean }) {
  const cats = simplified ? groupCategories(data.byCategory) : data.byCategory
  const remaining = data.income - data.spending

  const entries: FlowEntry[] = Object.entries(cats)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, amount], i) => ({
      name,
      amount,
      color: simplified ? (GROUP_COLORS[name] ?? '#94a3b8') : RAW_COLORS[i % RAW_COLORS.length],
      pct: data.income > 0 ? (amount / data.income) * 100 : 0,
    }))

  const spendingPct = data.income > 0 ? (data.spending / data.income) * 100 : 0
  const remainingPct = data.income > 0 ? Math.max(0, (remaining / data.income) * 100) : 0

  return (
    <div className="flex flex-col gap-3">
      {/* Income source */}
      <div className="relative">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Income</span>
          <span className="text-sm font-bold text-emerald-400">{formatCurrency(data.income)}</span>
        </div>
        <div className="h-9 bg-emerald-500/20 border border-emerald-500/40 rounded-xl flex items-center px-3">
          <span className="text-xs font-medium text-emerald-300">Take-home pay</span>
        </div>
        {/* connector */}
        <div className="absolute left-1/2 -translate-x-1/2 w-0.5 h-3 bg-white/10 bottom-0 translate-y-full" />
      </div>

      {/* Spending breakdown */}
      <div className="mt-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Spending</span>
          <span className="text-sm font-bold text-amber-400">{formatCurrency(data.spending)}</span>
        </div>

        {/* Proportional bar showing how spending chunks split income */}
        <div className="flex h-3 rounded-full overflow-hidden gap-px mb-3">
          {entries.map((e) => (
            <div
              key={e.name}
              style={{ width: `${e.pct}%`, backgroundColor: e.color }}
              title={`${e.name}: ${formatCurrency(e.amount)}`}
            />
          ))}
          {remainingPct > 0 && (
            <div
              style={{ width: `${remainingPct}%`, backgroundColor: '#22c55e', opacity: 0.5 }}
              title={`Remaining: ${formatCurrency(remaining)}`}
            />
          )}
        </div>

        {/* Category rows */}
        <div className="flex flex-col gap-1.5">
          {entries.map((e) => (
            <div key={e.name} className="flex items-center gap-2.5">
              <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: e.color }} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-xs text-text-primary truncate">{e.name}</span>
                  <span className="text-xs font-medium text-text-primary ml-2 flex-shrink-0">{formatCurrency(e.amount)}</span>
                </div>
                <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${e.pct}%`, backgroundColor: e.color, opacity: 0.8 }}
                  />
                </div>
              </div>
              <span className="text-[10px] text-muted w-8 text-right flex-shrink-0">{e.pct.toFixed(0)}%</span>
            </div>
          ))}
        </div>
      </div>

      {/* Remaining */}
      <div className="mt-2 border-t border-white/5 pt-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Remaining</span>
          <span className={`text-sm font-bold ${remaining >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatCurrency(remaining)}
          </span>
        </div>
        <div
          className={`h-7 rounded-xl border flex items-center px-3 ${
            remaining >= 0
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${remaining >= 0 ? 'bg-emerald-500' : 'bg-red-500'}`}
              style={{ width: `${Math.min(100, Math.abs(remainingPct))}%`, opacity: 0.7 }}
            />
          </div>
          <span className="text-[10px] text-muted ml-3">{spendingPct.toFixed(0)}% spent</span>
        </div>
      </div>
    </div>
  )
}

// ─── Sankey (Mode B) — vertical SVG ──────────────────────────────────────────

function SankeyFlow({ data, simplified }: { data: FlowData; simplified: boolean }) {
  const cats = simplified ? groupCategories(data.byCategory) : data.byCategory
  const remaining = data.income - data.spending

  const entries = Object.entries(cats)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const catColors = entries.map(([name], i) =>
    simplified ? (GROUP_COLORS[name] ?? '#94a3b8') : RAW_COLORS[i % RAW_COLORS.length]
  )

  // SVG dimensions — narrow enough for mobile, scales via viewBox
  const VW = 300
  const NODE_H = 16
  const PAD_H = 10   // vertical gap between rows
  const COL_GAP = 4  // horizontal gap between category nodes

  // Row Y positions
  const ROW_TOP = 28      // income node top (leaves room for label above)
  const ROW_MID = 160     // category nodes top
  const ROW_BOT = 300     // remaining node top

  // Income node: full width
  const incW = VW

  // Category nodes: proportional widths
  const totalCatGaps = COL_GAP * (entries.length - 1)
  const availCatW = VW - totalCatGaps
  const catNodes = entries.map(([name, amount], i) => {
    const w = data.income > 0 ? Math.max(6, (amount / data.income) * availCatW) : 0
    return { name, amount, color: catColors[i], w }
  })
  // Pack left-to-right
  let curX = 0
  const catX: number[] = catNodes.map((n) => {
    const x = curX
    curX += n.w + COL_GAP
    return x
  })

  // Remaining node: proportional width
  const remAmount = Math.abs(remaining)
  const remW = data.income > 0 ? Math.max(8, (remAmount / data.income) * VW) : 8
  const remColor = remaining >= 0 ? '#22c55e' : '#ef4444'
  const remLabel = remaining >= 0 ? 'Remaining' : 'Overspent'

  // Curved band: from a horizontal slice on row A down to a horizontal slice on row B
  // ax1/ax2 = left/right of source segment, ay = bottom of source row
  // bx1/bx2 = left/right of target segment, by = top of target row
  function band(ax1: number, ax2: number, ay: number, bx1: number, bx2: number, by: number) {
    const my = ay + (by - ay) * 0.5
    return [
      `M ${ax1} ${ay}`,
      `C ${ax1} ${my}, ${bx1} ${my}, ${bx1} ${by}`,
      `L ${bx2} ${by}`,
      `C ${bx2} ${my}, ${ax2} ${my}, ${ax2} ${ay}`,
      'Z',
    ].join(' ')
  }

  // Each cat's slice on the income bar (proportional, matches cat node widths + gaps)
  let incSliceX = 0
  const incSlices = catNodes.map((n) => {
    const x1 = incSliceX
    const x2 = x1 + n.w
    incSliceX += n.w + COL_GAP
    return { x1, x2 }
  })
  // Remaining slice on income bar sits right after spending slices
  const remSliceX1 = incSliceX
  const remSliceX2 = remSliceX1 + remW

  const svgH = ROW_BOT + NODE_H + 30

  return (
    <div className="w-full">
      <svg viewBox={`0 0 ${VW} ${svgH}`} className="w-full" style={{ maxHeight: 380 }}>

        {/* ── Bands: income → categories ── */}
        {catNodes.map((n, i) => (
          <path
            key={n.name}
            d={band(incSlices[i].x1, incSlices[i].x2, ROW_TOP + NODE_H, catX[i], catX[i] + n.w, ROW_MID)}
            fill={n.color}
            opacity={0.18}
          />
        ))}

        {/* ── Band: income → remaining ── */}
        {remaining > 0 && (
          <path
            d={band(remSliceX1, Math.min(remSliceX2, VW), ROW_TOP + NODE_H, 0, remW, ROW_BOT)}
            fill={remColor}
            opacity={0.15}
          />
        )}

        {/* ── Income node ── */}
        <rect x={0} y={ROW_TOP} width={incW} height={NODE_H} rx={4} fill="#22c55e" />
        <text x={VW / 2} y={ROW_TOP - 14} textAnchor="middle" fill="#9ca3af" fontSize={9} fontWeight="600" letterSpacing="0.05em">
          INCOME
        </text>
        <text x={VW / 2} y={ROW_TOP - 4} textAnchor="middle" fill="#22c55e" fontSize={11} fontWeight="700">
          {formatCurrency(data.income)}
        </text>

        {/* ── Category nodes + labels ── */}
        {catNodes.map((n, i) => {
          const cx = catX[i] + n.w / 2
          const showLabel = n.w >= 32
          return (
            <g key={n.name}>
              <rect x={catX[i]} y={ROW_MID} width={n.w} height={NODE_H} rx={3} fill={n.color} />
              {showLabel && (
                <>
                  <text x={cx} y={ROW_MID - 12} textAnchor="middle" fill="#9ca3af" fontSize={8} dominantBaseline="auto">
                    {n.name}
                  </text>
                  <text x={cx} y={ROW_MID - 3} textAnchor="middle" fill={n.color} fontSize={8} fontWeight="700" dominantBaseline="auto">
                    {formatCurrency(n.amount)}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* ── Remaining node ── */}
        <rect x={0} y={ROW_BOT} width={remW} height={NODE_H} rx={4} fill={remColor} />
        <text x={remW / 2} y={ROW_BOT - 12} textAnchor="middle" fill="#9ca3af" fontSize={9} fontWeight="600" letterSpacing="0.05em">
          {remLabel.toUpperCase()}
        </text>
        <text x={remW / 2} y={ROW_BOT - 2} textAnchor="middle" fill={remColor} fontSize={11} fontWeight="700">
          {formatCurrency(remAmount)}
        </text>

      </svg>

      {/* Legend for categories too narrow to label */}
      {catNodes.some((n) => n.w < 32) && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1.5">
          {catNodes.filter((n) => n.w < 32).map((n) => (
            <div key={n.name} className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: n.color }} />
              <span className="text-[10px] text-text-secondary">{n.name}</span>
              <span className="text-[10px] font-medium" style={{ color: n.color }}>{formatCurrency(n.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Main export ──────────────────────────────────────────────────────────────

type ChartMode = 'flow' | 'sankey'

interface MoneyFlowChartProps {
  income: number
  spending: number
  savings: number
  byCategory: Record<string, number>
}

export default function MoneyFlowChart({ income, spending, savings, byCategory }: MoneyFlowChartProps) {
  const [chartMode, setChartMode] = useState<ChartMode>('flow')
  const [simplified, setSimplified] = useState(false)

  const data: FlowData = { income, spending, savings, byCategory }

  const hasData = income > 0 || spending > 0

  if (!hasData) {
    return (
      <div className="text-center py-12 text-text-secondary text-sm">
        No income or spending data for this month.
      </div>
    )
  }

  return (
    <div>
      {/* Controls */}
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        {/* Chart type toggle */}
        <div className="flex items-center gap-1 bg-surface-2 rounded-lg p-0.5">
          <button
            onClick={() => setChartMode('flow')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              chartMode === 'flow'
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Flow
          </button>
          <button
            onClick={() => setChartMode('sankey')}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
              chartMode === 'sankey'
                ? 'bg-primary text-white'
                : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            Sankey
          </button>
        </div>

        {/* Simplify toggle */}
        <button
          onClick={() => setSimplified((s) => !s)}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
            simplified
              ? 'bg-primary/20 border-primary/50 text-primary'
              : 'bg-surface-2 border-border text-text-secondary hover:text-text-primary'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${simplified ? 'bg-primary' : 'bg-muted'}`} />
          Simplify
        </button>
      </div>

      {/* Chart */}
      {chartMode === 'flow'
        ? <VerticalFlow data={data} simplified={simplified} />
        : <SankeyFlow data={data} simplified={simplified} />
      }
    </div>
  )
}
