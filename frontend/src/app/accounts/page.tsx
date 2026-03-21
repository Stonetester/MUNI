'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import AccountCard from '@/components/accounts/AccountCard'
import AccountForm from '@/components/accounts/AccountForm'
import { getAccounts, getAccountSnapshots, createSnapshot, deleteSnapshot } from '@/lib/api'
import { Account, BalanceSnapshot } from '@/lib/types'
import { formatCurrency, isLiability, formatDate } from '@/lib/utils'
import { Plus, Wallet, Trash2, TrendingUp, ExternalLink } from 'lucide-react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from 'recharts'

const INVESTMENT_TYPES = new Set(['401k', 'ira', 'brokerage', 'hsa'])

function BalanceHistoryModal({ account, onClose }: { account: Account; onClose: () => void }) {
  const [snapshots, setSnapshots] = useState<BalanceSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [newDate, setNewDate] = useState('')
  const [newBalance, setNewBalance] = useState('')
  const [newNotes, setNewNotes] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try { setSnapshots(await getAccountSnapshots(account.id)) } catch { /* ignore */ }
    finally { setLoading(false) }
  }, [account.id])

  useEffect(() => { load() }, [load])

  const sorted = [...snapshots].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
  const chartData = [...snapshots]
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    .map((s) => ({ date: formatDate(s.date), balance: s.balance }))

  const handleAdd = async () => {
    if (!newDate || !newBalance) return
    setSaving(true)
    try {
      await createSnapshot({ account_id: account.id, date: newDate, balance: parseFloat(newBalance), notes: newNotes || undefined })
      setNewDate(''); setNewBalance(''); setNewNotes(''); setAdding(false)
      await load()
    } finally { setSaving(false) }
  }

  const handleDelete = async (id: number) => {
    await deleteSnapshot(id)
    await load()
  }

  const isInvestment = INVESTMENT_TYPES.has(account.account_type)

  return (
    <Modal isOpen onClose={onClose} title={`${account.name} — History & Holdings`} size="lg">
      <div className="flex flex-col gap-5">
        {/* Chart */}
        {chartData.length >= 2 && (
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#2d3748" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 10 }} axisLine={false} tickLine={false} />
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

        {/* Snapshot list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider">Balance Snapshots</p>
            <button
              onClick={() => setAdding((v) => !v)}
              className="flex items-center gap-1 text-xs text-primary hover:text-blue-400 transition-colors"
            >
              <Plus size={12} /> Add
            </button>
          </div>

          {adding && (
            <div className="p-3 rounded-xl bg-surface-2 border border-[#2d3748] mb-3 flex flex-col gap-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-secondary">Date</label>
                  <input
                    type="date"
                    value={newDate}
                    onChange={(e) => setNewDate(e.target.value)}
                    className="h-10 px-3 rounded-lg bg-surface border border-[#2d3748] text-text-primary text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-text-secondary">Balance ($)</label>
                  <input
                    type="number"
                    value={newBalance}
                    onChange={(e) => setNewBalance(e.target.value)}
                    placeholder="68534.76"
                    className="h-10 px-3 rounded-lg bg-surface border border-[#2d3748] text-text-primary text-sm"
                  />
                </div>
              </div>
              <input
                type="text"
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Notes (optional)"
                className="h-9 px-3 rounded-lg bg-surface border border-[#2d3748] text-text-primary text-sm"
              />
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={!newDate || !newBalance || saving}
                  className="px-4 py-1.5 rounded-lg bg-primary text-white text-xs font-medium disabled:opacity-50"
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                <button onClick={() => setAdding(false)} className="px-4 py-1.5 rounded-lg text-text-secondary text-xs hover:text-text-primary">
                  Cancel
                </button>
              </div>
            </div>
          )}

          {loading ? (
            <div className="py-6 flex justify-center"><LoadingSpinner /></div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-text-secondary text-center py-4">
              No snapshots yet — add a past statement balance to track history.
            </p>
          ) : (
            <div className="divide-y divide-[#2d3748]/50 max-h-48 overflow-y-auto">
              {sorted.map((s) => (
                <div key={s.id} className="flex items-center justify-between py-2 px-1">
                  <div>
                    <p className="text-sm font-medium text-text-primary">{formatCurrency(s.balance)}</p>
                    <p className="text-xs text-text-secondary">{formatDate(s.date)}{s.notes ? ` · ${s.notes}` : ''}</p>
                  </div>
                  <button
                    onClick={() => handleDelete(s.id)}
                    className="p-1.5 rounded-lg text-muted hover:text-danger hover:bg-surface-2 transition-colors"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Investment Holdings link for investment account types */}
        {isInvestment && (
          <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
            <div className="flex items-start gap-2">
              <TrendingUp size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-blue-400 mb-1">Investment Holdings</p>
                <p className="text-xs text-text-secondary mb-2">
                  To make forecast return % calculations more accurate, enter what you&apos;re invested in (funds, tickers, return rates) for this account.
                </p>
                <a
                  href="/financial-profile"
                  className="inline-flex items-center gap-1 text-xs text-primary hover:text-blue-300 font-medium transition-colors"
                >
                  Open Financial Profile → Investment Holdings <ExternalLink size={11} />
                </a>
              </div>
            </div>
          </div>
        )}
      </div>
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
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <Card className="text-center p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-text-secondary">Assets</p>
            <p className="text-sm sm:text-lg font-bold text-primary truncate">{formatCurrency(totalAssets)}</p>
          </Card>
          <Card className="text-center p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-text-secondary">Liabilities</p>
            <p className="text-sm sm:text-lg font-bold text-danger truncate">{formatCurrency(totalLiabilities)}</p>
          </Card>
          <Card className="text-center p-2 sm:p-3">
            <p className="text-[10px] sm:text-xs text-text-secondary">Accounts</p>
            <p className="text-sm sm:text-lg font-bold text-text-primary">{accounts.length}</p>
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
