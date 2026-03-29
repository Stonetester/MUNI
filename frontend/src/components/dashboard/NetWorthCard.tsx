'use client'

import { useState } from 'react'
import { DashboardData, ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import Card from '@/components/ui/Card'
import {
  TrendingUp, TrendingDown, ChevronDown, ChevronUp,
  Info, X, ArrowUpRight, ArrowDownRight, BarChart2, Zap,
} from 'lucide-react'
import { useViewMode } from '@/lib/viewMode'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  Tooltip,
  TooltipProps,
} from 'recharts'
import { cn } from '@/lib/utils'

interface NetWorthCardProps {
  data: DashboardData
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-surface border border-white/10 rounded-lg px-3 py-2 text-xs">
        <p className="text-text-secondary">{label}</p>
        <p className="text-primary font-semibold">{formatCurrency(payload[0].value as number)}</p>
      </div>
    )
  }
  return null
}

// ── Breakdown panel ───────────────────────────────────────────────────────────

function BreakdownPanel({
  point,
  currentNetWorth,
  onClose,
}: {
  point: ForecastPoint
  currentNetWorth: number
  onClose: () => void
}) {
  const change = point.net_worth - currentNetWorth

  // net = income - |expenses|; investment growth = residual after cash flow + events
  const cashFlow = point.net
  const eventImpact = point.event_impact
  const investmentGrowth = change - cashFlow - eventImpact

  const byCategory = point.by_category ?? {}
  const incomeItems = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort((a, b) => b[1] - a[1])
  const expenseItems = Object.entries(byCategory)
    .filter(([, v]) => v < 0)
    .sort((a, b) => a[1] - b[1])

  const isPositive = change >= 0

  return (
    <div className="mt-4 pt-4 border-t border-white/[0.06] space-y-4">

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-text-primary">How this is calculated</p>
        <button onClick={onClose} className="text-text-secondary hover:text-text-primary">
          <X size={14} />
        </button>
      </div>

      {/* Starting point */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">Current net worth</span>
        <span className="font-medium text-text-primary">{formatCurrency(currentNetWorth)}</span>
      </div>

      {/* Cash flow section */}
      <div className="rounded-xl border border-border overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border-b border-border">
          <BarChart2 size={13} className="text-text-secondary" />
          <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Cash Flow</span>
          <span className={cn(
            'ml-auto text-sm font-semibold',
            cashFlow >= 0 ? 'text-green-400' : 'text-red-400',
          )}>
            {cashFlow >= 0 ? '+' : ''}{formatCurrency(cashFlow)}
          </span>
        </div>

        {/* Income rows */}
        {incomeItems.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
              <ArrowUpRight size={12} className="text-green-400" />
              <span className="text-xs text-text-secondary font-medium">Income</span>
            </div>
            {incomeItems.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between px-3 py-1">
                <span className="text-xs text-text-secondary">{cat}</span>
                <span className="text-xs font-medium text-green-400">+{formatCurrency(amt)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Expense rows */}
        {expenseItems.length > 0 && (
          <div className="pb-2">
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1">
              <ArrowDownRight size={12} className="text-red-400" />
              <span className="text-xs text-text-secondary font-medium">Expenses</span>
            </div>
            {expenseItems.map(([cat, amt]) => (
              <div key={cat} className="flex items-center justify-between px-3 py-1">
                <span className="text-xs text-text-secondary">{cat}</span>
                <span className="text-xs font-medium text-red-400">{formatCurrency(amt)}</span>
              </div>
            ))}
          </div>
        )}

        {incomeItems.length === 0 && expenseItems.length === 0 && (
          <p className="text-xs text-text-secondary px-3 py-2">No category data available for this period.</p>
        )}
      </div>

      {/* Investment / savings growth */}
      {Math.abs(investmentGrowth) > 0.5 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border-b border-border">
            <TrendingUp size={13} className="text-text-secondary" />
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Investment &amp; Savings Growth</span>
            <span className={cn(
              'ml-auto text-sm font-semibold',
              investmentGrowth >= 0 ? 'text-green-400' : 'text-red-400',
            )}>
              {investmentGrowth >= 0 ? '+' : ''}{formatCurrency(investmentGrowth)}
            </span>
          </div>
          <p className="text-xs text-text-secondary px-3 py-2">
            Compound growth on 401(k), IRA, HYSA, and brokerage accounts at their configured rates + contributions.
          </p>
        </div>
      )}

      {/* Life events */}
      {Math.abs(eventImpact) > 0.5 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-2 px-3 py-2 bg-surface-2 border-b border-border">
            <Zap size={13} className="text-text-secondary" />
            <span className="text-xs font-semibold text-text-secondary uppercase tracking-wide">Life Event Impact</span>
            <span className={cn(
              'ml-auto text-sm font-semibold',
              eventImpact >= 0 ? 'text-green-400' : 'text-red-400',
            )}>
              {eventImpact >= 0 ? '+' : ''}{formatCurrency(eventImpact)}
            </span>
          </div>
          <p className="text-xs text-text-secondary px-3 py-2">
            Scheduled life event payments or income for this month.
          </p>
        </div>
      )}

      {/* Total change */}
      <div className={cn(
        'flex items-center justify-between rounded-xl px-4 py-3',
        isPositive ? 'bg-green-900/20 border border-green-700/30' : 'bg-red-900/20 border border-red-700/30',
      )}>
        <span className="text-sm font-semibold text-text-primary">Projected change</span>
        <span className={cn('text-base font-bold', isPositive ? 'text-green-400' : 'text-red-400')}>
          {isPositive ? '+' : ''}{formatCurrency(change)}
        </span>
      </div>

      {/* Resulting net worth */}
      <div className="flex items-center justify-between text-sm">
        <span className="text-text-secondary">Projected net worth</span>
        <span className="font-semibold text-text-primary">{formatCurrency(point.net_worth)}</span>
      </div>

      {/* Source note */}
      <p className="text-[11px] text-muted leading-relaxed">
        Cash flow figures use a weighted average of your last 3, 6, and 12 months of transactions
        (50 / 30 / 20 weighting). Investment growth uses compound interest at each account&apos;s
        configured rate. Go to <span className="text-text-secondary">Forecast</span> for the full
        60-month projection.
      </p>
    </div>
  )
}

// ── Main card ─────────────────────────────────────────────────────────────────

export default function NetWorthCard({ data }: NetWorthCardProps) {
  const { mode } = useViewMode()
  const [expanded, setExpanded] = useState(false)
  const [showBreakdown, setShowBreakdown] = useState(false)

  const { net_worth, forecast_preview, total_assets, total_liabilities, balances_by_type } = data

  const hysaTotal = balances_by_type.find(b => b.account_type === 'hysa')?.total ?? 0
  const net_worth_excl_hysa = net_worth - hysaTotal

  const sparklineData = forecast_preview
    .slice(0, 6)
    .map((p: ForecastPoint) => ({
      period: formatMonth(p.month),
      net_worth: p.net_worth,
    }))

  const nextPoint = forecast_preview[0] ?? null
  const nextForecast = nextPoint?.net_worth ?? net_worth
  const change = nextForecast - net_worth
  const changePercent = net_worth !== 0 ? (change / Math.abs(net_worth)) * 100 : 0
  const isPositive = change >= 0

  const title = mode === 'joint' ? 'Our Net Worth' : 'My Net Worth'

  return (
    <Card className="col-span-full">
      {/* Clickable header row — toggles assets breakdown */}
      <button
        className="w-full text-left"
        onClick={() => { setExpanded(e => !e); setShowBreakdown(false) }}
      >
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <div className="flex items-center justify-between">
              <p className="text-sm text-text-secondary font-medium mb-1">{title}</p>
              <span className="text-muted sm:hidden">
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              </span>
            </div>
            <p className="text-4xl md:text-5xl font-display text-text-primary tracking-tight">
              {formatCurrency(net_worth)}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {sparklineData.length > 1 && (
              <div className="w-full sm:w-48 h-16">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={sparklineData}>
                    <Line type="monotone" dataKey="net_worth" stroke="#14D49E" strokeWidth={2} dot={false} />
                    <Tooltip content={<CustomTooltip />} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
            <span className="hidden sm:block text-muted flex-shrink-0">
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </span>
          </div>
        </div>
      </button>

      {/* Projected change line — separate clickable, stops propagation */}
      <button
        className={cn(
          'flex items-center gap-1.5 mt-2 group rounded-lg px-1 -mx-1 py-0.5 transition-colors hover:bg-white/5',
          isPositive ? 'text-primary' : 'text-danger',
        )}
        onClick={e => { e.stopPropagation(); setShowBreakdown(v => !v); setExpanded(false) }}
        title="Click to see how this is calculated"
      >
        {isPositive ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        <span className="text-sm font-medium">
          {isPositive ? '+' : ''}{formatCurrency(change)} ({changePercent.toFixed(1)}%) projected next month
        </span>
        <Info size={13} className="opacity-50 group-hover:opacity-100 transition-opacity ml-0.5" />
      </button>

      {/* Breakdown panel */}
      {showBreakdown && nextPoint && (
        <BreakdownPanel
          point={nextPoint}
          currentNetWorth={net_worth}
          onClose={() => setShowBreakdown(false)}
        />
      )}

      {/* Assets/liabilities expanded breakdown */}
      {expanded && (
        <div className="mt-4 pt-4 border-t border-white/[0.06] grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1">Total Assets</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(total_assets)}</p>
            <p className="text-xs text-muted mt-1">Checking, savings, investments</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1">Total Liabilities</p>
            <p className="text-lg font-bold text-danger">{formatCurrency(total_liabilities)}</p>
            <p className="text-xs text-muted mt-1">Loans, credit cards</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1">Excl. HYSA</p>
            <p className={`text-lg font-bold ${net_worth_excl_hysa >= 0 ? 'text-primary' : 'text-danger'}`}>
              {formatCurrency(net_worth_excl_hysa)}
            </p>
            <p className="text-xs text-muted mt-1">Net worth without HYSA savings</p>
          </div>
          <div className="bg-surface-2 rounded-xl p-3">
            <p className="text-xs text-text-secondary mb-1">Net Worth Trend</p>
            <p className={`text-lg font-bold ${isPositive ? 'text-primary' : 'text-danger'}`}>
              {isPositive ? '+' : ''}{formatCurrency(change)}
            </p>
            <p className="text-xs text-muted mt-1">projected next month ({changePercent.toFixed(1)}%)</p>
          </div>
        </div>
      )}
    </Card>
  )
}
