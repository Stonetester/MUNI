'use client'

import { useEffect, useState } from 'react'
import { X, TrendingUp, TrendingDown, Minus } from 'lucide-react'
import { ForecastPoint, Category } from '@/lib/types'
import { formatCurrency, formatMonth } from '@/lib/utils'
import { getCategories } from '@/lib/api'

interface MonthDetailModalProps {
  point: ForecastPoint
  onClose: () => void
}

export default function MonthDetailModal({ point, onClose }: MonthDetailModalProps) {
  const [categories, setCategories] = useState<Category[]>([])

  useEffect(() => {
    getCategories().then(setCategories).catch(() => {})
  }, [])

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleEsc)
    return () => window.removeEventListener('keydown', handleEsc)
  }, [onClose])

  const colorMap = Object.fromEntries(categories.map((c) => [c.name, c.color]))

  const byCategory = point.by_category || {}
  const expenseEntries = Object.entries(byCategory)
    .filter(([, v]) => v < 0)
    .sort(([, a], [, b]) => a - b)
  const incomeEntries = Object.entries(byCategory)
    .filter(([, v]) => v > 0)
    .sort(([, a], [, b]) => b - a)

  const maxAbs = Math.max(...Object.values(byCategory).map(Math.abs), 1)
  const net = point.income + point.expenses
  const accountBreakdown = [...(point.net_worth_breakdown ?? [])]
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance))
  const assets = accountBreakdown
    .filter((account) => !account.is_liability && account.source !== 'no balance recorded')
    .reduce((sum, account) => sum + Math.max(0, account.balance), 0)
  const liabilities = accountBreakdown
    .filter((account) => account.is_liability && account.source !== 'no balance recorded')
    .reduce((sum, account) => sum + Math.abs(account.balance), 0)
  const missingAccounts = accountBreakdown.filter((account) => account.source === 'no balance recorded')

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative bg-surface border border-[#2d3748] rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-[#2d3748]">
          <div>
            <p className="text-xs text-muted uppercase tracking-wider">Monthly Detail</p>
            <h2 className="text-lg font-bold text-text-primary">{formatMonth(point.month)}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-text-secondary hover:text-text-primary hover:bg-surface-2 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Summary row */}
        <div className="grid grid-cols-3 gap-3 px-5 py-4 border-b border-[#2d3748]">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-green-400">
              <TrendingUp size={14} />
              <span className="text-xs text-text-secondary">Income</span>
            </div>
            <p className="text-base font-bold text-green-400">{formatCurrency(point.income)}</p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5 text-red-400">
              <TrendingDown size={14} />
              <span className="text-xs text-text-secondary">Spending</span>
            </div>
            <p className="text-base font-bold text-red-400">{formatCurrency(Math.abs(point.expenses))}</p>
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Minus size={14} className={net >= 0 ? 'text-primary' : 'text-danger'} />
              <span className="text-xs text-text-secondary">Net</span>
            </div>
            <p className={`text-base font-bold ${net >= 0 ? 'text-primary' : 'text-danger'}`}>{formatCurrency(net)}</p>
          </div>
        </div>

        {/* Category breakdown */}
        <div className="flex-1 overflow-y-auto px-5 py-4 flex flex-col gap-4">
          {point.event_impact !== 0 && (
            <div className="flex items-center justify-between p-3 rounded-xl bg-yellow-400/10 border border-yellow-400/20">
              <span className="text-sm text-yellow-300">Life event impact</span>
              <span className="text-sm font-semibold text-yellow-300">{formatCurrency(point.event_impact)}</span>
            </div>
          )}

          {accountBreakdown.length > 0 && (
            <div className="flex flex-col gap-2">
              <div>
                <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">What MUNI used</p>
                <p className="mt-1 text-xs leading-5 text-muted">{point.calculation_note}</p>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="text-[10px] text-muted">Assets</p>
                  <p className="text-sm font-bold text-primary">{formatCurrency(assets)}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="text-[10px] text-muted">Liabilities</p>
                  <p className="text-sm font-bold text-danger">-{formatCurrency(liabilities)}</p>
                </div>
                <div className="rounded-lg bg-surface-2 p-2">
                  <p className="text-[10px] text-muted">Net worth</p>
                  <p className="text-sm font-bold text-info">{formatCurrency(point.net_worth)}</p>
                </div>
              </div>
              <div className="divide-y divide-white/10 rounded-xl border border-white/10 px-3">
                {accountBreakdown.map((account) => (
                  <div key={account.account_id} className="flex items-center justify-between gap-3 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm text-text-primary">{account.account_name}</p>
                      <p className="text-[10px] text-muted">
                        {account.source}{account.as_of ? ` as of ${account.as_of}` : ''}
                      </p>
                    </div>
                    <p className={`shrink-0 text-sm font-semibold ${
                      account.source === 'no balance recorded'
                        ? 'text-muted'
                        : account.is_liability ? 'text-danger' : 'text-text-primary'
                    }`}>
                      {account.source === 'no balance recorded'
                        ? 'Not recorded'
                        : `${account.is_liability ? '-' : ''}${formatCurrency(Math.abs(account.balance))}`}
                    </p>
                  </div>
                ))}
              </div>
              {missingAccounts.length > 0 && (
                <p className="text-xs leading-5 text-warning">
                  {missingAccounts.length} account{missingAccounts.length === 1 ? '' : 's'} had no balance recorded by this month and count as $0.
                </p>
              )}
            </div>
          )}

          {expenseEntries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Spending by Category</p>
              {expenseEntries.map(([name, val]) => (
                <div key={name} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[name] || '#94a3b8' }} />
                      <span className="text-text-primary">{name}</span>
                    </div>
                    <span className="text-red-400 font-medium">{formatCurrency(Math.abs(val))}</span>
                  </div>
                  <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${(Math.abs(val) / maxAbs) * 100}%`,
                        backgroundColor: colorMap[name] || '#94a3b8',
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {incomeEntries.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-1">Income by Category</p>
              {incomeEntries.map(([name, val]) => (
                <div key={name} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: colorMap[name] || '#10b981' }} />
                    <span className="text-text-primary">{name}</span>
                  </div>
                  <span className="text-green-400 font-medium">{formatCurrency(val)}</span>
                </div>
              ))}
            </div>
          )}

          {expenseEntries.length === 0 && incomeEntries.length === 0 && (
            <p className="text-sm text-text-secondary text-center py-4">
              Detailed category breakdown is not available for this month.<br />
              <span className="text-xs text-muted">Category detail comes from the forecasting engine — run a forecast to populate it.</span>
            </p>
          )}

          {/* Extra forecast fields */}
          <div className="mt-2 grid grid-cols-2 gap-3 pt-3 border-t border-[#2d3748]">
            <div className="bg-surface-2 rounded-xl p-3">
              <p className="text-xs text-text-secondary">Net Worth</p>
              <p className="text-sm font-bold text-info mt-1">{formatCurrency(point.net_worth)}</p>
            </div>
            <div className="bg-surface-2 rounded-xl p-3">
              <p className="text-xs text-text-secondary">Cash on Hand</p>
              <p className="text-sm font-bold text-text-primary mt-1">{formatCurrency(point.cash)}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
