'use client'

import { useState } from 'react'
import { Account, AccountType } from '@/lib/types'
import { createAccount, updateAccount } from '@/lib/api'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import Button from '@/components/ui/Button'

interface AccountFormProps {
  account?: Account
  onSuccess: () => void
  onCancel: () => void
}

const accountTypeOptions: { value: AccountType; label: string }[] = [
  { value: 'checking', label: 'Checking' },
  { value: 'savings', label: 'Savings' },
  { value: 'hysa', label: 'High-Yield Savings (HYSA)' },
  { value: 'brokerage', label: 'Brokerage' },
  { value: 'ira', label: 'IRA' },
  { value: '401k', label: '401(k)' },
  { value: 'hsa', label: 'HSA' },
  { value: 'credit_card', label: 'Credit Card' },
  { value: 'student_loan', label: 'Student Loan' },
  { value: 'car_loan', label: 'Car Loan' },
  { value: 'mortgage', label: 'Mortgage' },
  { value: 'paycheck', label: 'Paycheck' },
  { value: 'other', label: 'Other' },
]

export default function AccountForm({ account, onSuccess, onCancel }: AccountFormProps) {
  const [formData, setFormData] = useState({
    name: account?.name || '',
    account_type: (account?.account_type || 'checking') as AccountType,
    institution: account?.institution || '',
    balance: account?.balance?.toString() || '0',
    is_active: account?.is_active ?? true,
    forecast_enabled: account?.forecast_enabled ?? true,
    notes: account?.notes || '',
    is_joint: account?.is_joint ?? false,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const payload = {
        name: formData.name,
        account_type: formData.account_type,
        institution: formData.institution || undefined,
        balance: parseFloat(formData.balance),
        is_active: formData.is_active,
        forecast_enabled: formData.forecast_enabled,
        notes: formData.notes || undefined,
        is_joint: formData.is_joint,
      }
      if (account) {
        await updateAccount(account.id, payload)
      } else {
        await createAccount(payload)
      }
      onSuccess()
    } catch {
      setError('Failed to save account.')
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

      <Input
        label="Account Name"
        type="text"
        placeholder="e.g. Chase Checking"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        required
      />

      <Select
        label="Account Type"
        options={accountTypeOptions}
        value={formData.account_type}
        onChange={(e) => setFormData({ ...formData, account_type: e.target.value as AccountType })}
      />

      <Input
        label="Institution (optional)"
        type="text"
        placeholder="e.g. Chase, Vanguard"
        value={formData.institution}
        onChange={(e) => setFormData({ ...formData, institution: e.target.value })}
      />

      <Input
        label="Current Balance"
        type="number"
        step="0.01"
        value={formData.balance}
        onChange={(e) => setFormData({ ...formData, balance: e.target.value })}
        hint="For liabilities (loans, credit cards), use positive number for what you owe"
        required
      />

      <div className="flex flex-col gap-2">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_active}
            onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm text-text-secondary">Active account</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.forecast_enabled}
            onChange={(e) => setFormData({ ...formData, forecast_enabled: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm text-text-secondary">Include in forecast</span>
        </label>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={formData.is_joint}
            onChange={(e) => setFormData({ ...formData, is_joint: e.target.checked })}
            className="w-4 h-4 accent-primary"
          />
          <span className="text-sm text-text-secondary">Joint account (shared with partner)</span>
        </label>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary">Notes (optional)</label>
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
          rows={2}
          placeholder="Any notes about this account..."
          className="px-3 py-2 rounded-xl bg-surface-2 border border-[#2d3748] text-text-primary placeholder:text-muted text-sm focus:outline-none focus:border-primary resize-none"
        />
      </div>

      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" variant="primary" loading={loading} className="flex-1">
          {account ? 'Update' : 'Add'} Account
        </Button>
      </div>
    </form>
  )
}
