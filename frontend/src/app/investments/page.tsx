'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import { getAccounts, getReturns, getHoldings } from '@/lib/api'
import type { Account, AccountReturn, InvestmentHolding } from '@/lib/types'
import { formatCurrency, accountTypeLabel } from '@/lib/utils'
import { TrendingUp, TrendingDown, PieChart, Upload, Info, Minus } from 'lucide-react'
import StatementReviewPanel from '@/components/investments/StatementReviewPanel'

// Account types that count as investments worth showing here.
const INVESTMENT_TYPES = new Set(['401k', 'ira', 'brokerage', 'hsa', 'hysa'])

function pctColor(pct: number | null): string {
  if (pct === null) return 'text-text-secondary'
  if (pct > 0) return 'text-green-400'
  if (pct < 0) return 'text-red-400'
  return 'text-text-secondary'
}

function ReturnBadge({ ret }: { ret?: AccountReturn }) {
  if (!ret || ret.annualized_pct === null) {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-text-secondary" title={ret?.basis}>
        <Minus size={11} /> return n/a
      </span>
    )
  }
  const pos = ret.annualized_pct >= 0
  return (
    <span
      className={`inline-flex items-center gap-1 text-sm font-semibold ${pctColor(ret.annualized_pct)}`}
      title={ret.basis}
    >
      {pos ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
      {pos ? '+' : ''}{ret.annualized_pct.toFixed(1)}%/yr
      {ret.low_confidence && <span className="text-[10px] text-yellow-500/80 font-normal">(rough)</span>}
    </span>
  )
}

function HoldingRow({ h, accountValue }: { h: InvestmentHolding; accountValue: number }) {
  // Prefer the stored weight; fall back to value-share so we always show a weight.
  const weight = h.weight_percent ?? (accountValue > 0 ? (h.current_value / accountValue) * 100 : null)
  const isCash = (h.ticker ?? '').toUpperCase() === 'CASH'
  return (
    <div className="flex items-center gap-3 py-2">
      {/* weight bar */}
      <div className="w-16 shrink-0">
        <div className="h-1.5 rounded-full bg-surface-2 overflow-hidden">
          <div
            className={isCash ? 'h-full bg-text-secondary/50' : 'h-full bg-primary'}
            style={{ width: `${Math.min(100, Math.max(2, weight ?? 0))}%` }}
          />
        </div>
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-text-primary truncate">
          {h.fund_name || h.ticker}
        </p>
        {h.fund_name && h.ticker && !isCash && (
          <p className="text-[11px] text-text-secondary truncate">{h.ticker}</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-medium text-text-primary">{formatCurrency(h.current_value)}</p>
        {weight !== null && (
          <p className="text-[11px] text-text-secondary">{weight.toFixed(1)}%</p>
        )}
      </div>
    </div>
  )
}

function AccountInvestmentCard({
  account,
  ret,
  holdings,
}: {
  account: Account
  ret?: AccountReturn
  holdings: InvestmentHolding[]
}) {
  const holdingsTotal = holdings.reduce((s, h) => s + h.current_value, 0)
  const accountValue = account.balance || holdingsTotal
  const sorted = [...holdings].sort((a, b) => b.current_value - a.current_value)

  return (
    <Card className="flex flex-col gap-3">
      {/* Header: name + balance + measured return */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-text-primary truncate">{account.name}</p>
          <p className="text-xs text-text-secondary">{accountTypeLabel(account.account_type)}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-text-primary">{formatCurrency(accountValue)}</p>
          <ReturnBadge ret={ret} />
        </div>
      </div>

      {/* Return basis line */}
      {ret && (
        <div className="flex items-start gap-1.5 text-[11px] text-text-secondary border-t border-[#2d3748] pt-2">
          <Info size={11} className="shrink-0 mt-0.5" />
          <span>{ret.basis}</span>
        </div>
      )}

      {/* Holdings */}
      {sorted.length > 0 ? (
        <div className="divide-y divide-[#2d3748]/40">
          <div className="flex items-center justify-between pb-1">
            <span className="text-[11px] font-semibold text-text-secondary uppercase tracking-wider">
              {sorted.length} holding{sorted.length !== 1 ? 's' : ''}
            </span>
          </div>
          {sorted.map((h) => (
            <HoldingRow key={h.id} h={h} accountValue={accountValue} />
          ))}
        </div>
      ) : (
        <p className="text-xs text-text-secondary border-t border-[#2d3748] pt-2">
          No holdings parsed yet — upload a statement below to populate funds.
        </p>
      )}
    </Card>
  )
}

export default function InvestmentsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [returns, setReturns] = useState<AccountReturn[]>([])
  const [holdings, setHoldings] = useState<InvestmentHolding[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [accts, rets, hlds] = await Promise.all([
        getAccounts(),
        getReturns().catch(() => [] as AccountReturn[]),
        getHoldings().catch(() => [] as InvestmentHolding[]),
      ])
      setAccounts(accts)
      setReturns(rets)
      setHoldings(hlds)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const returnsByAccount = useMemo(
    () => new Map(returns.map((r) => [r.account_id, r])),
    [returns],
  )
  const holdingsByAccount = useMemo(() => {
    const m = new Map<number, InvestmentHolding[]>()
    for (const h of holdings) {
      const arr = m.get(h.account_id) ?? []
      arr.push(h)
      m.set(h.account_id, arr)
    }
    return m
  }, [holdings])

  const investmentAccounts = accounts.filter(
    (a) => INVESTMENT_TYPES.has(a.account_type) && a.is_active,
  )

  // Portfolio totals
  const totalInvested = investmentAccounts.reduce((s, a) => {
    const hTotal = (holdingsByAccount.get(a.id) ?? []).reduce((x, h) => x + h.current_value, 0)
    return s + (a.balance || hTotal)
  }, 0)

  // Weighted blended measured return (only accounts with a real number)
  const measured = investmentAccounts
    .map((a) => ({ ret: returnsByAccount.get(a.id), bal: a.balance }))
    .filter((x) => x.ret && x.ret.annualized_pct !== null) as { ret: AccountReturn; bal: number }[]
  const weightSum = measured.reduce((s, x) => s + x.bal, 0)
  const blendedReturn =
    weightSum > 0
      ? measured.reduce((s, x) => s + (x.ret.annualized_pct as number) * x.bal, 0) / weightSum
      : null

  return (
    <AppLayout>
      <div className="flex flex-col gap-5">
        {/* Header */}
        <div className="flex items-center gap-3">
          <PieChart size={22} className="text-primary" />
          <div>
            <h1 className="text-xl font-semibold text-text-primary">Investments</h1>
            <p className="text-sm text-text-secondary">
              What you hold and how each account has actually performed
            </p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
            {/* Portfolio summary */}
            <div className="grid grid-cols-2 gap-3">
              <Card className="p-3 sm:p-4">
                <p className="text-xs text-text-secondary">Total Invested</p>
                <p className="text-lg sm:text-2xl font-bold text-text-primary">
                  {formatCurrency(totalInvested)}
                </p>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  {investmentAccounts.length} account{investmentAccounts.length !== 1 ? 's' : ''}
                </p>
              </Card>
              <Card className="p-3 sm:p-4">
                <p className="text-xs text-text-secondary">Blended Measured Return</p>
                <p className={`text-lg sm:text-2xl font-bold ${pctColor(blendedReturn)}`}>
                  {blendedReturn === null
                    ? '—'
                    : `${blendedReturn >= 0 ? '+' : ''}${blendedReturn.toFixed(1)}%/yr`}
                </p>
                <p className="text-[11px] text-text-secondary mt-0.5">
                  balance-weighted, net of contributions
                </p>
              </Card>
            </div>

            {/* Per-account cards */}
            {investmentAccounts.length > 0 ? (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                {investmentAccounts.map((a) => (
                  <AccountInvestmentCard
                    key={a.id}
                    account={a}
                    ret={returnsByAccount.get(a.id)}
                    holdings={holdingsByAccount.get(a.id) ?? []}
                  />
                ))}
              </div>
            ) : (
              <Card className="text-center py-10 text-text-secondary">
                <PieChart size={40} className="mx-auto mb-2 opacity-30" />
                <p className="font-medium text-text-primary">No investment accounts yet</p>
                <p className="text-sm mt-1">
                  Add a 401(k), IRA, or brokerage account, then upload a statement below.
                </p>
              </Card>
            )}

            {/* Upload + review */}
            <div className="flex items-center gap-2 mt-2">
              <Upload size={16} className="text-primary" />
              <h2 className="text-sm font-semibold text-text-primary uppercase tracking-wider">
                Upload &amp; Review Statement
              </h2>
            </div>
            <StatementReviewPanel accounts={accounts} onApplied={load} />
          </>
        )}
      </div>
    </AppLayout>
  )
}
