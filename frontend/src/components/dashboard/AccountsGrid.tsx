'use client'

import { DashboardData } from '@/lib/types'
import { formatCurrency, isLiability, accountTypeLabel } from '@/lib/utils'
import Card from '@/components/ui/Card'
import { Wallet, CreditCard, PiggyBank, TrendingUp, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface AccountsGridProps {
  data: DashboardData
}

function AccountIcon({ type }: { type: string }) {
  const icons: Record<string, typeof Wallet> = {
    credit_card: CreditCard,
    savings: PiggyBank,
    hysa: PiggyBank,
    brokerage: TrendingUp,
    ira: TrendingUp,
    '401k': TrendingUp,
    hsa: TrendingUp,
    mortgage: Building2,
    student_loan: Building2,
    car_loan: Building2,
  }
  const Icon = icons[type] || Wallet
  return <Icon size={18} />
}

function getIconColor(type: string): string {
  if (['credit_card', 'student_loan', 'car_loan', 'mortgage'].includes(type)) return 'text-orange-400'
  if (['brokerage', 'ira', '401k', 'hsa'].includes(type)) return 'text-purple-400'
  if (['savings', 'hysa'].includes(type)) return 'text-secondary'
  return 'text-primary'
}

export default function AccountsGrid({ data }: AccountsGridProps) {
  // Flatten balances_by_type into a single list
  const allAccounts = data.balances_by_type.flatMap((g) =>
    g.accounts.map((a) => ({ ...a, type: g.account_type }))
  )
  const assets = allAccounts.filter((b) => !isLiability(b.type))
  const liabilities = allAccounts.filter((b) => isLiability(b.type))

  return (
    <Card title="Our Accounts" className="col-span-full">
      {assets.length > 0 && (
        <>
          <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-3">Assets</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
            {assets.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl border border-[#2d3748]"
              >
                <div className={cn('flex-shrink-0', getIconColor(account.type))}>
                  <AccountIcon type={account.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{account.name}</p>
                  <p className="text-xs text-text-secondary">{accountTypeLabel(account.type)}</p>
                </div>
                <p className="text-sm font-semibold text-primary flex-shrink-0">
                  {formatCurrency(account.balance)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {liabilities.length > 0 && (
        <>
          <p className="text-xs text-text-secondary font-medium uppercase tracking-wider mb-3">Liabilities</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {liabilities.map((account) => (
              <div
                key={account.id}
                className="flex items-center gap-3 p-3 bg-surface-2 rounded-xl border border-[#2d3748]"
              >
                <div className="flex-shrink-0 text-orange-400">
                  <AccountIcon type={account.type} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-text-primary truncate">{account.name}</p>
                  <p className="text-xs text-text-secondary">{accountTypeLabel(account.type)}</p>
                </div>
                <p className="text-sm font-semibold text-danger flex-shrink-0">
                  {formatCurrency(account.balance)}
                </p>
              </div>
            ))}
          </div>
        </>
      )}

      {allAccounts.length === 0 && (
        <div className="text-center py-8 text-text-secondary">
          <Wallet size={40} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No accounts yet. Add your first account.</p>
        </div>
      )}
    </Card>
  )
}
