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

// ─── Sankey (Mode B) ─────────────────────────────────────────────────────────

interface SankeyNode {
  id: string
  label: string
  amount: number
  color: string
  x: number
  y: number
  height: number
}

interface SankeyLink {
  source: SankeyNode
  target: SankeyNode
  amount: number
  color: string
}

function SankeyFlow({ data, simplified }: { data: FlowData; simplified: boolean }) {
  const cats = simplified ? groupCategories(data.byCategory) : data.byCategory
  const remaining = data.income - data.spending

  const W = 320
  const H = 420
  const NODE_W = 14
  const COL1_X = 20
  const COL2_X = W - NODE_W - 20
  const PADDING = 6

  const entries: FlowEntry[] = Object.entries(cats)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)
    .map(([name, amount], i) => ({
      name,
      amount,
      color: simplified ? (GROUP_COLORS[name] ?? '#94a3b8') : RAW_COLORS[i % RAW_COLORS.length],
      pct: data.income > 0 ? (amount / data.income) * 100 : 0,
    }))

  const scale = data.income > 0 ? (H - PADDING * (entries.length + 2)) / data.income : 0

  // Source node (income)
  const sourceH = data.income * scale
  const sourceNode: SankeyNode = {
    id: 'income',
    label: 'Income',
    amount: data.income,
    color: '#22c55e',
    x: COL1_X,
    y: (H - sourceH) / 2,
    height: sourceH,
  }

  // Target nodes
  const targetNodes: SankeyNode[] = []
  let curY = 0
  for (const e of entries) {
    const h = Math.max(4, e.amount * scale)
    targetNodes.push({
      id: e.name,
      label: e.name,
      amount: e.amount,
      color: e.color,
      x: COL2_X,
      y: curY,
      height: h,
    })
    curY += h + PADDING
  }

  // Remaining node
  const remainingH = Math.max(4, Math.abs(remaining) * scale)
  const remainingNode: SankeyNode = {
    id: 'remaining',
    label: remaining >= 0 ? 'Remaining' : 'Overspent',
    amount: Math.abs(remaining),
    color: remaining >= 0 ? '#22c55e' : '#ef4444',
    x: COL2_X,
    y: curY,
    height: remainingH,
  }
  curY += remainingH

  // Adjust source node to center on the targets' total span
  const totalTargetSpan = curY
  sourceNode.y = (totalTargetSpan - sourceH) / 2

  // Build links
  const links: SankeyLink[] = []
  let sourceOffsetY = sourceNode.y
  for (const t of [...targetNodes, remainingNode]) {
    links.push({
      source: { ...sourceNode, y: sourceOffsetY },
      target: t,
      amount: t.amount,
      color: t.color,
    })
    sourceOffsetY += t.height + PADDING
  }

  // SVG path for curved band
  function bandPath(link: SankeyLink): string {
    const sx = link.source.x + NODE_W
    const sy = link.source.y
    const sh = Math.max(2, link.amount * scale)
    const tx = link.target.x
    const ty = link.target.y
    const th = link.target.height
    const mx = (sx + tx) / 2
    return [
      `M ${sx} ${sy}`,
      `C ${mx} ${sy}, ${mx} ${ty}, ${tx} ${ty}`,
      `L ${tx} ${ty + th}`,
      `C ${mx} ${ty + th}, ${mx} ${sy + sh}, ${sx} ${sy + sh}`,
      `Z`,
    ].join(' ')
  }

  const svgH = Math.max(H, curY + 20)

  return (
    <div className="overflow-x-auto">
      <svg width={W} height={svgH} viewBox={`0 0 ${W} ${svgH}`} className="mx-auto">
        {/* Link bands */}
        {links.map((link) => (
          <path
            key={link.target.id}
            d={bandPath(link)}
            fill={link.color}
            opacity={0.25}
          />
        ))}

        {/* Source node */}
        <rect
          x={sourceNode.x}
          y={sourceNode.y}
          width={NODE_W}
          height={sourceNode.height}
          rx={3}
          fill={sourceNode.color}
        />
        <text
          x={sourceNode.x - 4}
          y={sourceNode.y + sourceNode.height / 2}
          textAnchor="end"
          dominantBaseline="middle"
          fill="#d1d5db"
          fontSize={10}
        >
          Income
        </text>
        <text
          x={sourceNode.x - 4}
          y={sourceNode.y + sourceNode.height / 2 + 12}
          textAnchor="end"
          dominantBaseline="middle"
          fill="#22c55e"
          fontSize={9}
          fontWeight="600"
        >
          {formatCurrency(sourceNode.amount)}
        </text>

        {/* Target nodes */}
        {[...targetNodes, remainingNode].map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={NODE_W}
              height={node.height}
              rx={3}
              fill={node.color}
            />
            <text
              x={node.x + NODE_W + 4}
              y={node.y + node.height / 2}
              dominantBaseline="middle"
              fill="#d1d5db"
              fontSize={10}
            >
              {node.label}
            </text>
            <text
              x={node.x + NODE_W + 4}
              y={node.y + node.height / 2 + 12}
              dominantBaseline="middle"
              fill={node.color}
              fontSize={9}
              fontWeight="600"
            >
              {formatCurrency(node.amount)}
            </text>
          </g>
        ))}
      </svg>
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
