'use client'

import { useState } from 'react'
import { Transaction } from '@/lib/types'
import { formatCurrency, formatDate } from '@/lib/utils'
import { cn } from '@/lib/utils'
import { deleteTransaction } from '@/lib/api'
import { Edit2, Trash2, CheckCircle2, ChevronUp, ChevronDown, ChevronsUpDown } from 'lucide-react'
import { Badge } from '@/components/ui/Badge'

type SortKey = 'date' | 'description' | 'category' | 'amount'
type SortDir = 'asc' | 'desc'

interface TransactionListProps {
  transactions: Transaction[]
  onEdit: (tx: Transaction) => void
  onDeleted: () => void
  showOwner?: boolean
  readOnly?: boolean
}

function SortIcon({ col, sortKey, sortDir }: { col: SortKey; sortKey: SortKey; sortDir: SortDir }) {
  if (col !== sortKey) return <ChevronsUpDown size={12} className="opacity-30" />
  return sortDir === 'asc' ? <ChevronUp size={12} className="text-primary" /> : <ChevronDown size={12} className="text-primary" />
}

const OWNER_COLORS: Record<string, string> = {
  keaton: 'bg-primary/20 text-primary',
  katherine: 'bg-purple-500/20 text-purple-300',
}

export default function TransactionList({ transactions, onEdit, onDeleted, showOwner = false, readOnly = false }: TransactionListProps) {
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  const handleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortKey(key)
      setSortDir(key === 'amount' ? 'asc' : 'asc')
    }
  }

  const sorted = [...transactions].sort((a, b) => {
    let cmp = 0
    if (sortKey === 'date') cmp = a.date.localeCompare(b.date)
    else if (sortKey === 'description') cmp = (a.merchant || a.description).localeCompare(b.merchant || b.description)
    else if (sortKey === 'category') cmp = (a.category_name || '').localeCompare(b.category_name || '')
    else if (sortKey === 'amount') cmp = a.amount - b.amount
    return sortDir === 'asc' ? cmp : -cmp
  })

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

  const ColHeader = ({ col, label, align = 'left' }: { col: SortKey; label: string; align?: 'left' | 'right' }) => (
    <th
      className={cn(
        'py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider cursor-pointer select-none hover:text-text-primary transition-colors group',
        align === 'right' ? 'text-right' : 'text-left'
      )}
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center gap-1.5" style={{ justifyContent: align === 'right' ? 'flex-end' : 'flex-start' }}>
        {label}
        <SortIcon col={col} sortKey={sortKey} sortDir={sortDir} />
      </span>
    </th>
  )

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-[#2d3748]">
              <ColHeader col="date" label="Date" />
              <ColHeader col="description" label="Description" />
              <ColHeader col="category" label="Category" />
              <th className="text-left py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider">Account</th>
              {showOwner && <th className="text-left py-3 px-3 text-text-secondary font-medium text-xs uppercase tracking-wider">Who</th>}
              <ColHeader col="amount" label="Amount" align="right" />
              {!readOnly && <th className="py-3 px-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2d3748]">
            {sorted.map((tx) => (
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
                {showOwner && (
                  <td className="py-3 px-3">
                    {(tx as any).owner && (
                      <span className={cn('text-xs px-2 py-0.5 rounded-full font-medium', OWNER_COLORS[(tx as any).owner] || 'bg-surface-2 text-text-secondary')}>
                        {(tx as any).owner}
                      </span>
                    )}
                  </td>
                )}
                <td className={cn('py-3 px-3 text-right font-semibold', tx.amount >= 0 ? 'text-primary' : 'text-danger')}>
                  {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
                </td>
                {!readOnly && (
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => onEdit(tx)} className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors">
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDelete(tx.id)} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden flex flex-col divide-y divide-[#2d3748]">
        {sorted.map((tx) => (
          <div key={tx.id} className="py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 mb-0.5">
                {tx.is_verified && <CheckCircle2 size={12} className="text-primary flex-shrink-0" />}
                <p className="text-sm font-medium text-text-primary truncate">{tx.merchant || tx.description}</p>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="text-xs text-text-secondary">{formatDate(tx.date)}</span>
                {tx.category_name && (
                  <>
                    <span className="text-muted text-xs">·</span>
                    <span className="text-xs text-text-secondary">{tx.category_name}</span>
                  </>
                )}
                {tx.account_name && (
                  <>
                    <span className="text-muted text-xs">·</span>
                    <span className="text-xs text-muted truncate">{tx.account_name}</span>
                  </>
                )}
                {showOwner && (tx as any).owner && (
                  <>
                    <span className="text-muted text-xs">·</span>
                    <span className={cn('text-xs px-1.5 py-0.5 rounded-full font-medium', OWNER_COLORS[(tx as any).owner] || 'bg-surface-2 text-text-secondary')}>
                      {(tx as any).owner}
                    </span>
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1 flex-shrink-0">
              <span className={cn('text-sm font-semibold mr-1', tx.amount >= 0 ? 'text-primary' : 'text-danger')}>
                {tx.amount >= 0 ? '+' : ''}{formatCurrency(tx.amount)}
              </span>
              {!readOnly && (
                <>
                  <button onClick={() => onEdit(tx)} className="p-1.5 rounded-lg text-text-secondary hover:text-primary">
                    <Edit2 size={14} />
                  </button>
                  <button onClick={() => handleDelete(tx.id)} className="p-1.5 rounded-lg text-text-secondary hover:text-danger">
                    <Trash2 size={14} />
                  </button>
                </>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
