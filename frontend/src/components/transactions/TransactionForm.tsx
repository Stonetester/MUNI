'use client'

import { useState } from 'react'
import { Transaction, Account, Category } from '@/lib/types'
import { createTransaction, updateTransaction } from '@/lib/api'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'

interface TransactionFormProps {
  transaction?: Transaction
  accounts: Account[]
  categories: Category[]
  onSuccess: () => void
  onCancel: () => void
}

export default function TransactionForm({
  transaction,
  accounts,
  categories,
  onSuccess,
  onCancel,
}: TransactionFormProps) {
  const [formData, setFormData] = useState({
    date: transaction?.date || new Date().toISOString().split('T')[0],
    description: transaction?.description || '',
    merchant: transaction?.merchant || '',
    amount: transaction?.amount?.toString() || '',
    account_id: transaction?.account_id?.toString() || '',
    category_id: transaction?.category_id?.toString() || '',
    payment_method: transaction?.payment_method || '',
    notes: transaction?.notes || '',
    is_verified: transaction?.is_verified ?? false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const accountOptions = accounts.map((a) => ({ value: a.id, label: a.name }))
  const categoryOptions = categories.map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` }))
  const paymentOptions = [
    { value: 'cash', label: 'Cash' },
    { value: 'debit', label: 'Debit' },
    { value: 'credit', label: 'Credit' },
    { value: 'transfer', label: 'Transfer' },
    { value: 'check', label: 'Check' },
    { value: 'other', label: 'Other' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        date: formData.date,
        description: formData.description,
        merchant: formData.merchant || undefined,
        amount: parseFloat(formData.amount),
        account_id: formData.account_id ? Number(formData.account_id) : undefined,
        category_id: formData.category_id ? Number(formData.category_id) : undefined,
        payment_method: formData.payment_method || undefined,
        notes: formData.notes || undefined,
        is_verified: formData.is_verified,
      }
      if (transaction) {
        await updateTransaction(transaction.id, payload)
      } else {
        await createTransaction(payload)
      }
      onSuccess()
    } catch {
      setError('Failed to save transaction. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && (
        <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Input
          label="Date"
          type="date"
          value={formData.date}
          onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          required
          className="col-span-1"
        />
        <Input
          label="Amount"
          type="number"
          step="0.01"
          placeholder="0.00"
          value={formData.amount}
          onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
          required
          hint="Positive=income, Negative=expense"
        />
      </div>

      <Input
        label="Description"
        type="text"
        placeholder="What was this for?"
        value={formData.description}
        onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        required
      />

      <Input
        label="Merchant (optional)"
        type="text"
        placeholder="Where was this?"
        value={formData.merchant}
        onChange={(e) => setFormData({ ...formData, merchant: e.target.value })}
      />

      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Account"
          placeholder="Select account"
          options={accountOptions}
          value={formData.account_id}
          onChange={(e) => setFormData({ ...formData, account_id: e.target.value })}
        />
        <Select
          label="Category"
          placeholder="Select category"
          options={categoryOptions}
          value={formData.category_id}
          onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
        />
      </div>

      <Select
        label="Payment Method"
        placeholder="Select method"
        options={paymentOptions}
        value={formData.payment_method}
        onChange={(e) => setFormData({ ...formData, payment_method: e.target.value })}
      />

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary">Notes (optional)</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2}
          placeholder="Any additional notes..."
          className="px-3 py-2 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary placeholder:text-muted text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>

      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={formData.is_verified}
          onChange={(e) => setFormData({ ...formData, is_verified: e.target.checked })}
          className="w-4 h-4 accent-primary"
        />
        <span className="text-sm text-text-secondary">Verified transaction</span>
      </label>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={loading} className="flex-1">
          {transaction ? 'Update' : 'Add'} Transaction
        </Button>
      </div>
    </form>
  )
}
