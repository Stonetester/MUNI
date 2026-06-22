'use client'

import { Account, AccountBalanceDetail, AccountReturn } from '@/lib/types'
import { formatCurrency, accountTypeLabel, isLiability } from '@/lib/utils'
import { AccountTypeBadge } from '@/components/ui/Badge'
import { deleteAccount } from '@/lib/api'
import { Edit2, Trash2, Building2, TrendingUp, TrendingDown, CreditCard, PiggyBank, Wallet, Users } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccountCardProps {
  account: Account
  balanceDetail?: AccountBalanceDetail
  accountReturn?: AccountReturn
  onEdit: (account: Account) => void
  onDeleted: () => void
  onClick: (account: Account) => void
}

function AccountIcon({ type }: { type: string }) {
  if (['credit_card'].includes(type)) return <CreditCard size={20} />
  if (['savings', 'hysa'].includes(type)) return <PiggyBank size={20} />
  if (['brokerage', 'ira', '401k', 'hsa'].includes(type)) return <TrendingUp size={20} />
  if (['mortgage', 'student_loan', 'car_loan'].includes(type)) return <Building2 size={20} />
  return <Wallet size={20} />
}

function getAccentColor(type: string): string {
  if (['credit_card', 'student_loan', 'car_loan', 'mortgage'].includes(type)) return 'text-orange-400'
  if (['brokerage', 'ira', '401k', 'hsa'].includes(type)) return 'text-purple-400'
  if (['savings', 'hysa'].includes(type)) return 'text-secondary'
  return 'text-primary'
}

const COMPOUND_TYPES = new Set(['savings', 'hysa', 'ira', '401k', 'hsa', 'brokerage'])
const CASH_POOL_TYPES = new Set(['checking', 'paycheck'])

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function AccountCard({ account, balanceDetail, accountReturn, onEdit, onDeleted, onClick }: AccountCardProps) {
  const liability = isLiability(account.account_type)
  const accentColor = getAccentColor(account.account_type)
  const isCompound = COMPOUND_TYPES.has(account.account_type)
  const isCashPool = CASH_POOL_TYPES.has(account.account_type)
  const excluded = account.exclude_from_estimate

  const estimatedBalance = balanceDetail?.estimated_balance ?? account.balance
  const actualBalance = balanceDetail?.actual_balance ?? null
  const nextPayDate = balanceDetail?.next_pay_date ?? null

  // Compound accounts: always show Estimated label; show Actual row when snapshot exists
  const showEstimatedLabel = isCompound && !excluded
  const showActualRow = isCompound && !excluded && actualBalance !== null

  // Cash pool (checking): show estimated + next pay date hint
  const showCashEstimate = isCashPool && !excluded && balanceDetail != null

  // Monthly contribution + where it came from (measured deposits vs manual estimate).
  const contribAmount = balanceDetail?.monthly_contribution ?? 0
  const contribSource = balanceDetail?.contribution_source ?? 'none'
  const contribLabel = balanceDetail?.contribution_label ?? ''
  const contribBasis = balanceDetail?.contribution_basis ?? ''
  // Show a contribution line on compound accounts that actually have one.
  const showContribution = isCompound && !excluded && contribAmount > 0 && contribSource !== 'none'
  const contribIsMeasured = contribSource === 'measured'

  const handleDelete = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!window.confirm(`Delete "${account.name}"? This cannot be undone.`)) return
    try {
      await deleteAccount(account.id)
      onDeleted()
    } catch {
      alert('Failed to delete account. It may have transactions.')
    }
  }

  return (
    <div
      className="bg-surface-2 border border-[#2d3748] rounded-xl p-4 cursor-pointer hover:border-primary/50 transition-all group"
      onClick={() => onClick(account)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={cn('p-2 rounded-lg bg-surface', accentColor)}>
          <AccountIcon type={account.account_type} />
        </div>
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(account) }}
            className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
          >
            <Edit2 size={14} />
          </button>
          <button
            onClick={handleDelete}
            className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold text-text-primary">{account.name}</p>
          {account.is_joint && (
            <span className="flex items-center gap-1 text-[10px] text-blue-400 bg-blue-400/10 border border-blue-400/20 rounded-full px-2 py-0.5 font-medium">
              <Users size={9} /> Joint
            </span>
          )}
        </div>
        {account.institution && (
          <p className="text-xs text-text-secondary mb-2">{account.institution}</p>
        )}
        <AccountTypeBadge type={account.account_type} />
      </div>

      <div className="mt-3 pt-3 border-t border-[#2d3748]">
        {showEstimatedLabel ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-text-secondary uppercase tracking-wider">Estimated</span>
              <p className={cn('text-xl font-bold', liability ? 'text-danger' : 'text-text-primary')}>
                {liability ? '-' : ''}{formatCurrency(estimatedBalance)}
              </p>
            </div>
            {showActualRow && (
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-muted uppercase tracking-wider">Actual</span>
                <p className="text-sm text-text-secondary">
                  {liability ? '-' : ''}{formatCurrency(actualBalance!)}
                  {balanceDetail?.last_snapshot_date && (
                    <span className="text-[10px] text-muted ml-1">
                      ({formatShortDate(balanceDetail.last_snapshot_date)})
                    </span>
                  )}
                </p>
              </div>
            )}
          </div>
        ) : showCashEstimate ? (
          <div className="flex flex-col gap-0.5">
            <div className="flex items-baseline justify-between">
              <span className="text-[10px] text-text-secondary uppercase tracking-wider">Estimated</span>
              <p className="text-xl font-bold text-text-primary">
                {formatCurrency(estimatedBalance)}
              </p>
            </div>
            {actualBalance !== null && balanceDetail?.last_snapshot_date && (
              <div className="flex items-baseline justify-between">
                <span className="text-[10px] text-muted uppercase tracking-wider">Actual</span>
                <p className="text-sm text-text-secondary">
                  {formatCurrency(actualBalance)}
                  <span className="text-[10px] text-muted ml-1">
                    ({formatShortDate(balanceDetail.last_snapshot_date)})
                  </span>
                </p>
              </div>
            )}
            {nextPayDate && (
              <p className="text-[10px] text-text-secondary mt-0.5">
                Next pay: <span className="text-primary">{formatShortDate(nextPayDate)}</span>
              </p>
            )}
          </div>
        ) : (
          <p className={cn('text-xl font-bold', liability ? 'text-danger' : 'text-text-primary')}>
            {liability ? '-' : ''}{formatCurrency(estimatedBalance)}
          </p>
        )}
        {accountReturn && accountReturn.annualized_pct !== null && (
          <div
            className="flex items-center gap-1 mt-2"
            title={accountReturn.basis}
          >
            {accountReturn.annualized_pct >= 0
              ? <TrendingUp size={12} className="text-green-400" />
              : <TrendingDown size={12} className="text-red-400" />}
            <span className={cn('text-xs font-semibold', accountReturn.annualized_pct >= 0 ? 'text-green-400' : 'text-red-400')}>
              {accountReturn.annualized_pct >= 0 ? '+' : ''}{accountReturn.annualized_pct.toFixed(1)}%/yr
            </span>
            <span className="text-[10px] text-muted">measured</span>
            {accountReturn.low_confidence && <span className="text-[10px] text-yellow-500/80">rough</span>}
          </div>
        )}
        {showContribution && (
          <div className="flex items-center gap-1.5 mt-2" title={contribBasis}>
            <PiggyBank size={12} className="text-secondary" />
            <span className="text-xs font-medium text-text-secondary">
              {formatCurrency(contribAmount)}/mo
            </span>
            <span className={cn(
              'text-[10px] px-1.5 py-0.5 rounded-full border',
              contribIsMeasured
                ? 'text-green-400 bg-green-400/10 border-green-400/20'
                : 'text-yellow-500/90 bg-yellow-500/10 border-yellow-500/20',
            )}>
              {contribLabel}
            </span>
          </div>
        )}
        {!account.is_active && (
          <p className="text-xs text-muted mt-1">Inactive</p>
        )}
      </div>
    </div>
  )
}
