'use client'

import { Transaction } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import Card from '@/components/ui/Card'
import Link from 'next/link'
import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

// Deterministic color for each username
function ownerColor(owner: string): string {
  const palette = [
    'bg-blue-500/15 text-blue-400 border-blue-500/30',
    'bg-purple-500/15 text-purple-400 border-purple-500/30',
    'bg-amber-500/15 text-amber-400 border-amber-500/30',
    'bg-rose-500/15 text-rose-400 border-rose-500/30',
    'bg-teal-500/15 text-teal-400 border-teal-500/30',
  ]
  let hash = 0
  for (let i = 0; i < owner.length; i++) hash = (hash * 31 + owner.charCodeAt(i)) & 0xffff
  return palette[hash % palette.length]
}

interface RecentTransactionsProps {
  transactions: Transaction[]
  showOwner?: boolean
}

export default function RecentTransactions({ transactions, showOwner = false }: RecentTransactionsProps) {
  return (
    <Card
      title="Recent Transactions"
      className="col-span-full"
      action={
        <Link href="/transactions" className="text-xs text-primary hover:underline">
          View all
        </Link>
      }
    >
      {transactions.length === 0 ? (
        <div className="text-center py-8 text-text-secondary">
          <ArrowUpDown size={32} className="mx-auto mb-2 opacity-30" />
          <p className="text-sm">No transactions yet</p>
        </div>
      ) : (
        <div className="flex flex-col divide-y divide-[#2d3748]">
          {transactions.slice(0, 10).map((tx) => (
            <div key={tx.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-text-primary truncate">
                    {tx.merchant || tx.description}
                  </p>
                  {showOwner && tx.owner && (
                    <span className={cn('text-[10px] font-semibold px-1.5 py-0.5 rounded-full border flex-shrink-0', ownerColor(tx.owner))}>
                      {tx.owner}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs text-text-secondary">{formatDate(tx.date)}</span>
                  {tx.category_name && (
                    <>
                      <span className="text-muted">·</span>
                      <span className="text-xs text-text-secondary">{tx.category_name}</span>
                    </>
                  )}
                  {tx.account_name && (
                    <>
                      <span className="text-muted">·</span>
                      <span className="text-xs text-muted truncate hidden sm:block">{tx.account_name}</span>
                    </>
                  )}
                </div>
              </div>
              <span
                className={cn(
                  'text-sm font-semibold flex-shrink-0',
                  tx.amount >= 0 ? 'text-primary' : 'text-danger'
                )}
              >
                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
              </span>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
