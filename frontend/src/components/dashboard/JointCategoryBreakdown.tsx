'use client'

import { useState } from 'react'
import Card from '@/components/ui/Card'
import Modal from '@/components/ui/Modal'
import type { Transaction } from '@/lib/types'
import { formatCurrency } from '@/lib/utils'

const COLORS = ['#10B981', '#14b8a6', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#06b6d4']

export default function JointCategoryBreakdown({
  byCategory,
  transactions,
}: {
  byCategory: Record<string, number>
  transactions: Transaction[]
}) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)
  const categories = Object.entries(byCategory)
    .filter(([, amount]) => amount > 0)
    .sort(([, a], [, b]) => b - a)
  const largest = categories[0]?.[1] || 1
  const total = categories.reduce((sum, [, amount]) => sum + amount, 0)
  const selectedTransactions = selectedCategory
    ? transactions
        .filter(transaction => (
          transaction.category_name === selectedCategory
          && (transaction.is_expense ?? transaction.amount < 0)
        ))
        .sort((a, b) => b.date.localeCompare(a.date) || b.id - a.id)
    : []
  const selectedTotal = selectedTransactions.reduce((sum, transaction) => sum + Math.abs(transaction.amount), 0)

  return (
    <Card title="Joint Spending by Category" action={<span className="text-sm font-bold text-text-primary">{formatCurrency(total)}</span>}>
      {categories.length === 0 ? (
        <div className="h-32 flex items-center justify-center text-sm text-text-secondary">No spending in this month</div>
      ) : (
        <div className="flex flex-col gap-3">
          {categories.map(([name, amount], index) => (
            <button
              key={name}
              type="button"
              onClick={() => setSelectedCategory(name)}
              className="rounded-lg p-1 text-left transition-colors hover:bg-surface-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
              aria-label={`View ${name} transactions totaling ${formatCurrency(amount)}`}
            >
              <div className="mb-1 flex items-center justify-between gap-3 text-xs">
                <span className="truncate text-text-secondary">{name}</span>
                <span className="shrink-0 font-semibold text-text-primary">{formatCurrency(amount)} ›</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(2, (amount / largest) * 100)}%`, backgroundColor: COLORS[index % COLORS.length] }}
                />
              </div>
            </button>
          ))}
        </div>
      )}

      <Modal
        isOpen={selectedCategory !== null}
        onClose={() => setSelectedCategory(null)}
        title={selectedCategory ? `${selectedCategory} Breakdown` : undefined}
        size="lg"
      >
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-4">
          <div>
            <p className="text-xs text-text-secondary">{selectedTransactions.length} transaction{selectedTransactions.length === 1 ? '' : 's'}</p>
            <p className="text-xs text-muted">Tap a category bar anytime to see what makes up its total.</p>
          </div>
          <p className="text-xl font-bold text-text-primary">{formatCurrency(selectedTotal)}</p>
        </div>
        {selectedTransactions.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">No matching transactions found.</p>
        ) : (
          <div className="flex flex-col divide-y divide-border">
            {selectedTransactions.map(transaction => (
              <div key={transaction.id} className="flex items-start justify-between gap-4 py-3 first:pt-0">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-text-primary">{transaction.description || transaction.merchant || 'Transaction'}</p>
                  <p className="text-xs text-text-secondary">
                    {transaction.owner || 'Joint'} · {new Date(`${transaction.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    {transaction.account_name ? ` · ${transaction.account_name}` : ''}
                  </p>
                </div>
                <p className="shrink-0 text-sm font-semibold text-danger">{formatCurrency(Math.abs(transaction.amount))}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </Card>
  )
}
