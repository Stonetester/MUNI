'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import TransactionList from '@/components/transactions/TransactionList'
import TransactionFiltersComponent from '@/components/transactions/TransactionFilters'
import TransactionForm from '@/components/transactions/TransactionForm'
import ImportModal from '@/components/transactions/ImportModal'
import { getTransactions, getAccounts, getCategories, getJointTransactions } from '@/lib/api'
import { Transaction, Account, Category, PaginatedTransactions, TransactionFilters } from '@/lib/types'
import { Plus, Upload, ChevronLeft, ChevronRight } from 'lucide-react'
import { useViewMode } from '@/lib/viewMode'

const DEFAULT_FILTERS: TransactionFilters = { limit: 50, offset: 0 }

export default function TransactionsPage() {
  const { mode } = useViewMode()
  const [data, setData] = useState<PaginatedTransactions | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [filters, setFilters] = useState<TransactionFilters>(DEFAULT_FILTERS)
  const [loading, setLoading] = useState(true)
  const [showAddModal, setShowAddModal] = useState(false)
  const [editTransaction, setEditTransaction] = useState<Transaction | undefined>()
  const [showImport, setShowImport] = useState(false)

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      if (mode === 'joint') {
        const txData = await getJointTransactions(filters.limit || 50, filters.offset || 0)
        setData(txData)
      } else {
        const [txData, accs, cats] = await Promise.all([
          getTransactions(filters),
          getAccounts(),
          getCategories(),
        ])
        setData(txData)
        setAccounts(accs)
        setCategories(cats)
      }
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [filters, mode])

  useEffect(() => { loadData() }, [loadData])

  const handleSuccess = () => {
    setShowAddModal(false)
    setEditTransaction(undefined)
    loadData()
  }

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <p className="text-text-secondary text-sm">
              {data ? `${data.total} transactions${mode === 'joint' ? ' · all members' : ''}` : ''}
            </p>
          </div>
          {mode !== 'joint' && (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowImport(true)}>
                <Upload size={14} />
                <span className="hidden sm:inline">Import</span>
              </Button>
              <Button variant="primary" size="sm" onClick={() => setShowAddModal(true)}>
                <Plus size={14} />
                <span className="hidden sm:inline">Add Transaction</span>
              </Button>
            </div>
          )}
        </div>

        {/* Filters — solo only (joint uses fixed limit/offset pagination) */}
        {mode !== 'joint' && (
          <TransactionFiltersComponent
            filters={filters}
            accounts={accounts}
            categories={categories}
            onChange={setFilters}
            onReset={() => setFilters(DEFAULT_FILTERS)}
          />
        )}

        {/* List */}
        <Card>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <LoadingSpinner size="lg" />
            </div>
          ) : (
            <TransactionList
              transactions={data?.items || []}
              onEdit={(tx) => setEditTransaction(tx)}
              onDeleted={loadData}
              showOwner={mode === 'joint'}
              readOnly={mode === 'joint'}
            />
          )}

          {/* Pagination */}
          {data && data.total > (filters.limit || 50) && (
            <div className="flex items-center justify-between mt-4 pt-4 border-t border-[#2d3748]">
              <p className="text-xs text-text-secondary">
                Showing {(filters.offset || 0) + 1}–{Math.min((filters.offset || 0) + (filters.limit || 50), data.total)} of {data.total}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilters({ ...filters, offset: Math.max(0, (filters.offset || 0) - (filters.limit || 50)) })}
                  disabled={(filters.offset || 0) <= 0}
                >
                  <ChevronLeft size={14} />
                  Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setFilters({ ...filters, offset: (filters.offset || 0) + (filters.limit || 50) })}
                  disabled={(filters.offset || 0) + (filters.limit || 50) >= data.total}
                >
                  Next
                  <ChevronRight size={14} />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      {mode !== 'joint' && (
        <>
          <Modal
            isOpen={showAddModal || !!editTransaction}
            onClose={() => { setShowAddModal(false); setEditTransaction(undefined) }}
            title={editTransaction ? 'Edit Transaction' : 'Add Transaction'}
            size="lg"
          >
            <TransactionForm
              transaction={editTransaction}
              accounts={accounts}
              categories={categories}
              onSuccess={handleSuccess}
              onCancel={() => { setShowAddModal(false); setEditTransaction(undefined) }}
            />
          </Modal>
          <ImportModal
            isOpen={showImport}
            onClose={() => setShowImport(false)}
            onSuccess={loadData}
          />
        </>
      )}
    </AppLayout>
  )
}
