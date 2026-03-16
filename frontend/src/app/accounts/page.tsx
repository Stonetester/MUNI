'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AccountCard from '@/components/accounts/AccountCard'
import AccountForm from '@/components/accounts/AccountForm'
import { getAccounts, getAccountSnapshots } from '@/lib/api'
import { Account, BalanceSnapshot } from '@/lib/types'
import { formatCurrency, isLiability, formatDate } from '@/lib/utils'
import { Plus, Wallet } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts'

function BalanceHistoryModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [snapshots, setSnapshots] = useState<BalanceSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getAccountSnapshots(account.id)
      .then(setSnapshots)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [account.id])

  const chartData = [...snapshots]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((s) => ({ date: formatDate(s.date), balance: s.balance }))

  return (
    <Modal isOpen onClose={onClose} title={`${account.name} — Balance History`} size="lg">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <LoadingSpinner />
        </div>
      ) : snapshots.length === 0 ? (
        <p className="text-center text-text-secondary py-8">No balance history yet</p>
      ) : (
        <div className="h-56">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#94a3b8', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                width={50}
              />
              <Tooltip
                contentStyle={{ background: '#1a1f2e', border: '1px solid #2d3748', borderRadius: 8 }}
                labelStyle={{ color: '#94a3b8' }}
                itemStyle={{ color: '#10B981' }}
              />
              <Line type="monotone" dataKey="balance" stroke="#10B981" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Modal>
  )
}

export default function AccountsPage() {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [editAccount, setEditAccount] = useState<Account | undefined>()
  const [detailAccount, setDetailAccount] = useState<Account | undefined>()

  const loadAccounts = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getAccounts()
      setAccounts(data)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadAccounts() }, [loadAccounts])

  const handleSuccess = () => {
    setShowAdd(false)
    setEditAccount(undefined)
    loadAccounts()
  }

  const assets = accounts.filter((a) => !isLiability(a.account_type) && a.is_active)
  const liabilities = accounts.filter((a) => isLiability(a.account_type) && a.is_active)
  const inactive = accounts.filter((a) => !a.is_active)

  const totalAssets = assets.reduce((s, a) => s + a.balance, 0)
  const totalLiabilities = liabilities.reduce((s, a) => s + a.balance, 0)
  const netWorth = totalAssets - totalLiabilities

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <p className="text-xs text-text-secondary">Net Worth</p>
              <p className="text-xl font-bold text-text-primary">{formatCurrency(netWorth)}</p>
            </div>
          </div>
          <Button variant="primary" size="sm" onClick={() => setShowAdd(true)}>
            <Plus size={14} />
            Add Account
          </Button>
        </div>

        {/* Summary */}
        <div className="grid grid-cols-3 gap-3">
          <Card className="text-center p-3">
            <p className="text-xs text-text-secondary">Assets</p>
            <p className="text-lg font-bold text-primary">{formatCurrency(totalAssets)}</p>
          </Card>
          <Card className="text-center p-3">
            <p className="text-xs text-text-secondary">Liabilities</p>
            <p className="text-lg font-bold text-danger">{formatCurrency(totalLiabilities)}</p>
          </Card>
          <Card className="text-center p-3">
            <p className="text-xs text-text-secondary">Accounts</p>
            <p className="text-lg font-bold text-text-primary">{accounts.length}</p>
          </Card>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <LoadingSpinner size="lg" />
          </div>
        ) : (
          <>
            {/* Assets */}
            {assets.length > 0 && (
              <div>
                <h3 className="text-xs text-text-secondary font-semibold uppercase tracking-wider mb-3">Assets</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {assets.map((a) => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      onEdit={setEditAccount}
                      onDeleted={loadAccounts}
                      onClick={setDetailAccount}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Liabilities */}
            {liabilities.length > 0 && (
              <div>
                <h3 className="text-xs text-text-secondary font-semibold uppercase tracking-wider mb-3">Liabilities</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {liabilities.map((a) => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      onEdit={setEditAccount}
                      onDeleted={loadAccounts}
                      onClick={setDetailAccount}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Inactive */}
            {inactive.length > 0 && (
              <div>
                <h3 className="text-xs text-muted font-semibold uppercase tracking-wider mb-3">Inactive</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 opacity-50">
                  {inactive.map((a) => (
                    <AccountCard
                      key={a.id}
                      account={a}
                      onEdit={setEditAccount}
                      onDeleted={loadAccounts}
                      onClick={setDetailAccount}
                    />
                  ))}
                </div>
              </div>
            )}

            {accounts.length === 0 && (
              <div className="text-center py-16 text-text-secondary">
                <Wallet size={48} className="mx-auto mb-3 opacity-30" />
                <p className="font-medium">No accounts yet</p>
                <p className="text-sm mt-1">Add your first account to get started</p>
                <Button variant="primary" className="mt-4" onClick={() => setShowAdd(true)}>
                  <Plus size={16} /> Add Account
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      <Modal
        isOpen={showAdd || !!editAccount}
        onClose={() => { setShowAdd(false); setEditAccount(undefined) }}
        title={editAccount ? 'Edit Account' : 'Add Account'}
        size="md"
      >
        <AccountForm
          account={editAccount}
          onSuccess={handleSuccess}
          onCancel={() => { setShowAdd(false); setEditAccount(undefined) }}
        />
      </Modal>

      {detailAccount && (
        <BalanceHistoryModal account={detailAccount} onClose={() => setDetailAccount(undefined)} />
      )}
    </AppLayout>
  )
}
