'use client'

import { Transaction } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import Card from '@/components/ui/Card'
import Link from 'next/link'
import { ArrowUpDown } from 'lucide-react'
import { cn } from '@/lib/utils'

interface RecentTransactionsProps {
  transactions: Transaction[]
}

export default function RecentTransactions({ transactions }: RecentTransactionsProps) {
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
                <p className="text-sm font-medium text-text-primary truncate">
                  {tx.merchant || tx.description}
                </p>
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
