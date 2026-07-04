'use client'

import { Fragment, useState } from 'react'
import { AccountForecast, ForecastPoint } from '@/lib/types'
import { formatCurrency, formatMonth, accountTypeLabel } from '@/lib/utils'
import Card from '@/components/ui/Card'
import InfoTooltip from '@/components/ui/InfoTooltip'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  TooltipProps,
} from 'recharts'
import { TrendingUp, HelpCircle } from 'lucide-react'

interface AccountForecastChartProps {
  points: ForecastPoint[]
  accountForecasts: AccountForecast[]
}

// Color palette for accounts (cycles if >10 accounts)
const COLORS = [
  '#10b981', '#60a5fa', '#f59e0b', '#a78bfa', '#f87171',
  '#14b8a6', '#fb923c', '#c084fc', '#34d399', '#93c5fd',
]

const ACCOUNT_TYPE_ORDER = ['401k', 'ira', 'brokerage', 'hysa', 'savings', 'hsa', 'checking', 'paycheck', 'other']

function sortedAccounts(accounts: AccountForecast[]) {
  return [...accounts].sort((a, b) => {
    const ai = ACCOUNT_TYPE_ORDER.indexOf(a.account_type)
    const bi = ACCOUNT_TYPE_ORDER.indexOf(b.account_type)
    if (ai !== bi) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    return b.ending_balance - a.ending_balance
  })
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface border border-[#2d3748] rounded-xl p-3 text-xs shadow-xl min-w-[180px]">
      <p className="text-text-secondary font-medium mb-2">{label}</p>
      {payload
        .sort((a, b) => (b.value as number) - (a.value as number))
        .map((entry) => (
          <div key={entry.dataKey} className="flex items-center gap-2 mb-1">
            <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-text-secondary truncate max-w-[100px]">{entry.name}:</span>
            <span className="text-text-primary font-semibold ml-auto">{formatCurrency(entry.value as number)}</span>
          </div>
        ))}
    </div>
  )
}

export default function AccountForecastChart({ points, accountForecasts }: AccountForecastChartProps) {
  // Only show accounts with compound growth or significant balance
  const investmentAccounts = sortedAccounts(
    accountForecasts.filter(
      (a) => !['credit_card', 'student_loan', 'car_loan', 'mortgage'].includes(a.account_type)
        && (a.annual_return_pct > 0 || a.monthly_contribution > 0 || a.ending_balance > 500)
    )
  )

  const [hiddenAccounts, setHiddenAccounts] = useState<Set<string>>(new Set())
  // Which account's "show me the math" panel is open in the summary table.
  const [explainId, setExplainId] = useState<number | null>(null)

  function toggleAccount(name: string) {
    setHiddenAccounts((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  if (investmentAccounts.length === 0) return null

  // Build chart data — one entry per month
  const chartData = points.map((p, i) => {
    const entry: Record<string, string | number> = { month: formatMonth(p.month) }
    for (const acc of investmentAccounts) {
      const bal = acc.monthly_balances[i] ?? acc.starting_balance
      entry[acc.account_name] = Math.max(0, bal)
    }
    return entry
  })

  return (
    <Card title="Account Balance Projections" action={
      <InfoTooltip
        title="Account projections & compound interest"
        content={
          <div className="flex flex-col gap-2">
            <p><strong className="text-text-primary">Compound interest:</strong> Each month, your balance grows by: <em>balance × (1 + monthly rate) + contribution</em>. Interest earns interest — this is the core of long-term investing.</p>
            <p><strong className="text-text-primary">Annual return %:</strong> The blended expected return for that account, pulled from your Investment Holdings (ticker/fund return rates) in Financial Profile. Default rates: 401k 8%, IRA 7%, brokerage 8%, HYSA uses your configured APY.</p>
            <p><strong className="text-text-primary">+/mo:</strong> Your configured monthly contribution to that account.</p>
            <p className="text-muted">To configure fund holdings and custom return rates, go to Financial Profile → Investment Holdings.</p>
          </div>
        }
      />
    }>
      <div className="flex flex-wrap gap-3 mb-4">
        {investmentAccounts.map((acc, i) => {
          const color = COLORS[i % COLORS.length]
          const hidden = hiddenAccounts.has(acc.account_name)
          const gain = acc.ending_balance - acc.starting_balance
          return (
            <button
              key={acc.account_id}
              onClick={() => toggleAccount(acc.account_name)}
              className={`flex flex-col items-start px-3 py-2 rounded-xl border transition-all text-left ${
                hidden
                  ? 'border-[#2d3748] opacity-40'
                  : 'border-[#2d3748] hover:border-primary/40'
              }`}
            >
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                <span className="text-xs font-medium text-text-primary">{acc.account_name}</span>
                <span className="text-xs text-muted">({accountTypeLabel(acc.account_type)})</span>
              </div>
              <div className="mt-1 flex gap-3 pl-4">
                <div>
                  <p className="text-xs text-muted">End balance</p>
                  <p className="text-sm font-bold text-text-primary">{formatCurrency(acc.ending_balance)}</p>
                </div>
                {acc.annual_return_pct > 0 && (
                  <div>
                    <p className="text-xs text-muted">Return</p>
                    <p className="text-sm font-semibold text-primary">{acc.annual_return_pct.toFixed(1)}%/yr</p>
                  </div>
                )}
                {gain !== 0 && (
                  <div>
                    <p className="text-xs text-muted">Total gain</p>
                    <p className={`text-sm font-semibold ${gain >= 0 ? 'text-primary' : 'text-danger'}`}>
                      {gain >= 0 ? '+' : ''}{formatCurrency(gain)}
                    </p>
                  </div>
                )}
              </div>
            </button>
          )
        })}
      </div>

      <p className="text-xs text-muted mb-3 flex items-center gap-1.5">
        <TrendingUp size={12} />
        Projections use compound interest (monthly compounding). Click account cards above to toggle visibility.
      </p>

      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} style={{ cursor: 'default' }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fill: '#94a3b8', fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#94a3b8', fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `$${(v / 1000).toFixed(0)}k` : `$${v}`}
              width={58}
            />
            <Tooltip content={<CustomTooltip />} />
            {investmentAccounts.map((acc, i) => (
              <Line
                key={acc.account_id}
                type="monotone"
                dataKey={acc.account_name}
                stroke={COLORS[i % COLORS.length]}
                strokeWidth={2}
                dot={false}
                hide={hiddenAccounts.has(acc.account_name)}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Summary table — tap a row to see exactly where each number comes from */}
      <p className="mt-4 text-xs text-muted">Tap an account row to see the math and the origin of every value.</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="text-muted border-b border-[#2d3748]">
              <th className="text-left py-2 pr-4 font-medium">Account</th>
              <th className="text-right py-2 px-2 font-medium">Current</th>
              <th className="text-right py-2 px-2 font-medium">Return/yr</th>
              <th className="text-right py-2 px-2 font-medium">+/mo</th>
              <th className="text-right py-2 pl-2 font-medium">Projected</th>
            </tr>
          </thead>
          <tbody>
            {investmentAccounts.map((acc, i) => {
              const isOpen = explainId === acc.account_id
              const monthlyRate = acc.annual_return_pct / 100 / 12
              const firstMonth = acc.starting_balance * (1 + monthlyRate) + acc.monthly_contribution
              return (
              <Fragment key={acc.account_id}>
              <tr
                onClick={() => setExplainId(isOpen ? null : acc.account_id)}
                className="border-b border-[#2d3748]/40 hover:bg-surface-2/30 cursor-pointer"
              >
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="text-text-primary font-medium">{acc.account_name}</span>
                    <span className="text-muted">({accountTypeLabel(acc.account_type)})</span>
                    <HelpCircle size={11} className={isOpen ? 'text-primary' : 'text-muted'} />
                  </div>
                </td>
                <td className="text-right py-2 px-2 text-text-secondary">{formatCurrency(acc.starting_balance)}</td>
                <td className="text-right py-2 px-2 text-primary">
                  {acc.annual_return_pct > 0 ? `${acc.annual_return_pct.toFixed(1)}%` : '—'}
                </td>
                <td className="text-right py-2 px-2 text-info">
                  {acc.monthly_contribution > 0 ? `+${formatCurrency(acc.monthly_contribution)}` : '—'}
                </td>
                <td className="text-right py-2 pl-2 font-semibold text-text-primary">
                  {formatCurrency(acc.ending_balance)}
                </td>
              </tr>
              {isOpen && (
                <tr className="border-b border-[#2d3748]/40 bg-surface-2/40">
                  <td colSpan={5} className="py-3 px-3">
                    <div className="flex flex-col gap-2 text-[11px] leading-relaxed max-w-xl">
                      <div>
                        <span className="text-muted font-medium">Starting balance · </span>
                        <span className="text-text-secondary">{formatCurrency(acc.starting_balance)} from {acc.starting_balance_source || 'the account balance'}</span>
                      </div>
                      <div>
                        <span className="text-muted font-medium">Growth rate · </span>
                        <span className="text-text-secondary">{acc.rate_basis || 'no growth applied'}</span>
                      </div>
                      <div>
                        <span className="text-muted font-medium">Contribution · </span>
                        <span className="text-text-secondary">
                          {acc.monthly_contribution > 0
                            ? `${formatCurrency(acc.monthly_contribution)}/mo — ${acc.contribution_basis || acc.contribution_label}`
                            : 'none applied'}
                          {acc.lifetime_monthly_contribution != null && (
                            <> (lifetime average for comparison: {formatCurrency(acc.lifetime_monthly_contribution)}/mo — {acc.lifetime_contribution_basis})</>
                          )}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted font-medium">How it's projected · </span>
                        <span className="text-text-secondary">{acc.projection_formula}</span>
                      </div>
                      {acc.annual_return_pct > 0 && (
                        <div>
                          <span className="text-muted font-medium">First month worked out · </span>
                          <span className="text-text-primary font-mono">
                            {formatCurrency(acc.starting_balance)} × (1 + {acc.annual_return_pct.toFixed(2)}%/12) + {formatCurrency(acc.monthly_contribution)} = {formatCurrency(firstMonth)}
                          </span>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            )})}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
