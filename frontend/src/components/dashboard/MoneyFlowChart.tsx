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

// ─── Sankey (Mode B) — vertical top-to-bottom ────────────────────────────────

function SankeyFlow({ data, simplified }: { data: FlowData; simplified: boolean }) {
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

  // Layout constants
  const NODE_H = 14          // height of each horizontal bar node
  const ROW1_Y = 30          // income row top
  const ROW2_Y = 180         // category row top
  const ROW3_Y = 340         // remaining row top
  const LABEL_ABOVE = 12     // gap for label above node
  const GAP = 6              // gap between category nodes

  // Total available width for nodes (SVG is 100% wide via viewBox)
  const SVG_W = 360
  const SVG_H = ROW3_Y + NODE_H + 40

  // Income node spans full width
  const incomeNode = { x: 0, y: ROW1_Y, w: SVG_W, h: NODE_H }

  // Category nodes — proportional widths, packed left-to-right with gaps
  const totalGaps = GAP * (entries.length - 1)
  const availW = SVG_W - totalGaps
  type CatNode = { id: string; x: number; y: number; w: number; h: number; color: string; label: string; amount: number }
  const catNodes: CatNode[] = []
  let curX = 0
  for (const e of entries) {
    const w = Math.max(4, (e.amount / data.income) * availW)
    catNodes.push({ id: e.name, x: curX, y: ROW2_Y, w, h: NODE_H, color: e.color, label: e.name, amount: e.amount })
    curX += w + GAP
  }

  // Remaining node — proportional width
  const remainingPct = data.income > 0 ? Math.max(0, remaining) / data.income : 0
  const remainingW = Math.max(4, remainingPct * SVG_W)
  const remainingNode = {
    x: 0, y: ROW3_Y, w: remainingW, h: NODE_H,
    color: remaining >= 0 ? '#22c55e' : '#ef4444',
    label: remaining >= 0 ? 'Remaining' : 'Overspent',
    amount: Math.abs(remaining),
  }

  // Curved band path: flows from a horizontal segment on row1 down to a horizontal segment on row2
  // sx1,sx2 = x range on source row; tx1,tx2 = x range on target row; sy = source bottom; ty = target top
  function bandPath(sx1: number, sx2: number, sy: number, tx1: number, tx2: number, ty: number): string {
    const my = (sy + ty) / 2
    return [
      `M ${sx1} ${sy}`,
      `C ${sx1} ${my}, ${tx1} ${my}, ${tx1} ${ty}`,
      `L ${tx2} ${ty}`,
      `C ${tx2} ${my}, ${sx2} ${my}, ${sx2} ${sy}`,
      `Z`,
    ].join(' ')
  }

  // Map each category node's x position back to a segment on the income bar
  // The income bar is full width, so each cat maps to a proportional slice of it
  let incomeOffsetX = 0
  const incomeSlices: { x1: number; x2: number }[] = catNodes.map((n) => {
    const w = n.w
    const slice = { x1: incomeOffsetX, x2: incomeOffsetX + w }
    incomeOffsetX += w + GAP
    return slice
  })
  // Remaining slice on income bar
  const remainingSlice = { x1: incomeOffsetX, x2: incomeOffsetX + remainingW }

  // Map each category node's x to a segment on the remaining bar (only top categories for now — all flow to remaining as one)
  // Actually: top bands go income→categories; bottom bands go categories→remaining (each cat drains to remaining proportionally)
  // For simplicity: income→each cat (top bands), each cat→remaining (bottom bands, but remaining only shows leftover)
  // Better: just draw income→cat bands (top) and no bottom bands for remaining — keep it clean

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${SVG_W} ${SVG_H}`}
        className="w-full"
        style={{ maxHeight: 420 }}
      >
        {/* ── Top bands: income → categories ── */}
        {catNodes.map((cat, i) => (
          <path
            key={cat.id}
            d={bandPath(
              incomeSlices[i].x1, incomeSlices[i].x2, ROW1_Y + NODE_H,
              cat.x, cat.x + cat.w, ROW2_Y
            )}
            fill={cat.color}
            opacity={0.2}
          />
        ))}

        {/* Remaining band: income → remaining node */}
        {remaining > 0 && (
          <path
            d={bandPath(
              remainingSlice.x1, remainingSlice.x2, ROW1_Y + NODE_H,
              remainingNode.x, remainingNode.x + remainingNode.w, ROW3_Y
            )}
            fill={remainingNode.color}
            opacity={0.15}
          />
        )}

        {/* ── Income node ── */}
        <rect x={incomeNode.x} y={incomeNode.y} width={incomeNode.w} height={incomeNode.h} rx={4} fill="#22c55e" />
        <text x={SVG_W / 2} y={ROW1_Y - LABEL_ABOVE} textAnchor="middle" fill="#d1d5db" fontSize={10} fontWeight="600">
          Income
        </text>
        <text x={SVG_W / 2} y={ROW1_Y - LABEL_ABOVE + 11} textAnchor="middle" fill="#22c55e" fontSize={9} fontWeight="700">
          {formatCurrency(data.income)}
        </text>

        {/* ── Category nodes ── */}
        {catNodes.map((cat) => {
          const cx = cat.x + cat.w / 2
          return (
            <g key={cat.id}>
              <rect x={cat.x} y={cat.y} width={cat.w} height={cat.h} rx={3} fill={cat.color} />
              {cat.w > 28 && (
                <>
                  <text x={cx} y={ROW2_Y - LABEL_ABOVE} textAnchor="middle" fill="#d1d5db" fontSize={9}>
                    {cat.label}
                  </text>
                  <text x={cx} y={ROW2_Y - LABEL_ABOVE + 11} textAnchor="middle" fill={cat.color} fontSize={8} fontWeight="600">
                    {formatCurrency(cat.amount)}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* ── Remaining node ── */}
        <rect x={remainingNode.x} y={remainingNode.y} width={remainingNode.w} height={remainingNode.h} rx={4} fill={remainingNode.color} />
        <text x={remainingNode.w / 2} y={ROW3_Y - LABEL_ABOVE} textAnchor="middle" fill="#d1d5db" fontSize={10} fontWeight="600">
          {remainingNode.label}
        </text>
        <text x={remainingNode.w / 2} y={ROW3_Y - LABEL_ABOVE + 11} textAnchor="middle" fill={remainingNode.color} fontSize={9} fontWeight="700">
          {formatCurrency(remainingNode.amount)}
        </text>
      </svg>

      {/* Legend for narrow cats that can't fit a label */}
      {catNodes.some((c) => c.w <= 28) && (
        <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
          {catNodes.filter((c) => c.w <= 28).map((c) => (
            <div key={c.id} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-sm flex-shrink-0" style={{ backgroundColor: c.color }} />
              <span className="text-[10px] text-text-secondary">{c.label} {formatCurrency(c.amount)}</span>
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
