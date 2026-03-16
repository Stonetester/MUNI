'use client'

import { Transaction, Account, Category } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { deleteTransaction } from '@/lib/api'
import { Edit2, Trash2, CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

interface TransactionListProps {
  transactions: Transaction[]
  onEdit: (tx: Transaction) => void
  onDeleted: () => void
}

export default function TransactionList({ transactions, onEdit, onDeleted }: TransactionListProps) {
  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this transaction?')) return
    try {
      await deleteTransaction(id)
      onDeleted()
    } catch {
      alert('Failed to delete transaction.')
    }
  }

  if (transactions.length === 0) {
    return (
      <div className="text-center py-16 text-text-secondary">
        <p className="text-4xl mb-3">📭</p>
        <p className="font-medium">No transactions found</p>
        <p className="text-sm mt-1">Try adjusting your filters or add a new transaction</p>
      </div>
    )
  }

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2d3748]">
              <th className="text-left py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider">Date</th>
              <th className="text-left py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider">Description</th>
              <th className="text-left py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider">Category</th>
              <th className="text-left py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider">Account</th>
              <th className="text-right py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider">Amount</th>
              <th className="py-3 px-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2d3748]">
            {transactions.map((tx) => (
              <tr key={tx.id} className="hover:bg-surface-2 transition-colors group">
                <td className="py-3 px-3 text-text-secondary text-xs whitespace-nowrap">{formatDate(tx.date)}</td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-2">
                    {tx.is_verified && <CheckCircle2 size={12} className="text-primary flex-shrink-0" />}
                    <div>
                      <p className="text-text-primary font-medium">{tx.merchant || tx.description}</p>
                      {tx.merchant && tx.description !== tx.merchant && (
                        <p className="text-xs text-text-secondary truncate max-w-[200px]">{tx.description}</p>
                      )}
                    </div>
                  </div>
                </td>
                <td className="py-3 px-3">
                  {tx.category_name && <Badge label={tx.category_name} variant="default" />}
                </td>
                <td className="py-3 px-3 text-text-secondary text-xs">{tx.account_name}</td>
                <td className={cn('py-3 px-3 text-right font-semibold', tx.amount >= 0 ? 'text-primary' : 'text-danger')}>
                  {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </td>
                <td className="py-3 px-3">
                  <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => onEdit(tx)}
                      className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDelete(tx.id)}
                      className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col divide-y divide-[#2d3748]">
        {transactions.map((tx) => (
          <div key={tx.id} className="py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {tx.is_verified && <CheckCircle2 size={12} className="text-primary flex-shrink-0" />}
                <p className="text-sm font-medium text-text-primary truncate">{tx.merchant || tx.description}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs text-text-secondary">{formatDate(tx.date)}</span>
                {tx.category_name && (
                  <>
                    <span className="text-muted text-xs">·</span>
                    <span className="text-xs text-text-secondary">{tx.category_name}</span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className={cn('text-sm font-semibold', tx.amount >= 0 ? 'text-primary' : 'text-danger')}>
                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
              </span>
              <button
                onClick={() => onEdit(tx)}
                className="p-1.5 rounded-lg text-text-secondary hover:text-primary"
              >
                <Edit2 size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
