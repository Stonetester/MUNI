'use client'

import { Account, Category, TransactionFilters as Filters } from '@/lib/types'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'
import { Search, X } from 'lucide-react'

interface TransactionFiltersProps {
  filters: Filters
  accounts: Account[]
  categories: Category[]
  onChange: (filters: Filters) => void
  onReset: () => void
}

export default function TransactionFiltersComponent({
  filters,
  accounts,
  categories,
  onChange,
  onReset,
}: TransactionFiltersProps) {
  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: c.name }))
  const paymentOptions = [
    { value: 'cash', label: 'Cash' },
    { value: 'debit', label: 'Debit' },
    { value: 'credit', label: 'Credit' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'check', label: 'Check' },
    { value: 'other', label: 'Other' },
  ]

  const hasFilters = !!(filters.search || filters.account_id || filters.category_id || filters.from_date || filters.to_date || filters.payment_method)

  return (
    <div className="bg-surface border border-[#2d3748] rounded-xl p-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Search */}
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            type="text"
            placeholder="Search transactions..."
            value={filters.search || ''}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="w-full h-10 pl-9 pr-3 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary placeholder:text-muted text-sm focus:outline-none focus:border-primary"
          />
        </div>

        <Select
          placeholder="All accounts"
          options={accountOptions}
          value={filters.account_id || ''}
          onChange={(e) => onChange({ ...filters, account_id: e.target.value ? Number(e.target.value) : undefined })}
        />

        <Select
          placeholder="All categories"
          options={categoryOptions}
          value={filters.category_id || ''}
          onChange={(e) => onChange({ ...filters, category_id: e.target.value ? Number(e.target.value) : undefined })}
        />

        <Select
          placeholder="Payment method"
          options={paymentOptions}
          value={filters.payment_method || ''}
          onChange={(e) => onChange({ ...filters, payment_method: e.target.value || undefined })}
        />

        <Input
          type="date"
          value={filters.from_date || ''}
          onChange={(e) => onChange({ ...filters, from_date: e.target.value || undefined })}
          placeholder="Start date"
        />

        <Input
          type="date"
          value={filters.to_date || ''}
          onChange={(e) => onChange({ ...filters, to_date: e.target.value || undefined })}
          placeholder="End date"
        />

        {hasFilters && (
          <Button variant="ghost" size="md" onClick={onReset} className="flex items-center gap-1">
            <X size={14} />
            Clear filters
          </Button>
        )}
      </div>
    </div>
  )
}
