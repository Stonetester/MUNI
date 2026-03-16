'use client'

import { useState, useEffect, useCallback } from 'react'
import AppLayout from '@/components/layout/AppLayout'
import Card from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import LoadingSpinner from '@/components/ui/LoadingSpinner'
import Input from '@/components/ui/Input'
import Select from '@/components/ui/Select'
import { CategoryKindBadge } from '@/components/ui/Badge'
import {
  getBudgetSummary,
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  getRecurringRules,
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
} from '@/lib/api'
import {
  Category,
  CategoryKind,
  RecurringRule,
  Frequency,
  BudgetSummary,
} from '@/lib/types'
import {
  formatCurrency,
  getCurrentMonth,
  formatMonth,
  clampPercentage,
  frequencyLabel,
} from '@/lib/utils'
import { Plus, Edit2, Trash2, Target, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'

// ---- Category Form ----
function CategoryForm({
  category,
  onSuccess,
  onCancel,
}: {
  category?: Category
  onSuccess: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(category?.name || '')
  const [kind, setKind] = useState<CategoryKind>(category?.kind || 'expense')
  const [color, setColor] = useState(category?.color || '#10B981')
  const [budgetAmount, setBudgetAmount] = useState(category?.budget_amount?.toString() || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const kindOptions = [
    { value: 'income', label: 'Income' },
    { value: 'expense', label: 'Expense' },
    { value: 'savings', label: 'Savings' },
    { value: 'transfer', label: 'Transfer' },
  ]

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        name,
        kind,
        color,
        budget_amount: budgetAmount ? parseFloat(budgetAmount) : undefined,
        budget_period: budgetAmount ? 'monthly' : undefined,
      }
      if (category) {
        await updateCategory(category.id, payload)
      } else {
        await createCategory(payload)
      }
      onSuccess()
    } catch {
      setError('Failed to save category.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">{error}</div>}
      <Input label="Category Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Groceries" />
      <Select label="Type" options={kindOptions} value={kind} onChange={(e) => setKind(e.target.value as CategoryKind)} />
      <div className="flex flex-col gap-1">
        <label className="text-sm font-medium text-text-secondary">Color</label>
        <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-10 w-full rounded-xl bg-surface-2 border border-[#2d3748] px-2 cursor-pointer" />
      </div>
      <Input
        label="Monthly Budget (optional)"
        type="number"
        step="0.01"
        value={budgetAmount}
        onChange={(e) => setBudgetAmount(e.target.value)}
        placeholder="Leave empty for no budget"
      />
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" variant="primary" loading={loading} className="flex-1">{category ? 'Update' : 'Add'} Category</Button>
      </div>
    </form>
  )
}

// ---- Recurring Rule Form ----
function RecurringRuleForm({
  rule,
  categories,
  onSuccess,
  onCancel,
}: {
  rule?: RecurringRule
  categories: Category[]
  onSuccess: () => void
  onCancel: () => void
}) {
  const [name, setName] = useState(rule?.name || '')
  const [amount, setAmount] = useState(rule?.amount?.toString() || '')
  const [frequency, setFrequency] = useState<Frequency>(rule?.frequency || 'monthly')
  const [startDate, setStartDate] = useState(rule?.start_date || '')
  const [endDate, setEndDate] = useState(rule?.end_date || '')
  const [categoryId, setCategoryId] = useState(rule?.category_id?.toString() || '')
  const [isActive, setIsActive] = useState(rule?.is_active ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const freqOptions: { value: Frequency; label: string }[] = [
    { value: 'weekly', label: 'Weekly' },
    { value: 'biweekly', label: 'Biweekly' },
    { value: 'monthly', label: 'Monthly' },
    { value: 'bimonthly', label: 'Bimonthly' },
    { value: 'quarterly', label: 'Quarterly' },
    { value: 'annual', label: 'Annual' },
    { value: 'one_time', label: 'One Time' },
  ]

  const catOptions = categories.map((c) => ({ value: c.id, label: `${c.name} (${c.kind})` }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const payload = {
        name,
        amount: parseFloat(amount),
        frequency,
        start_date: startDate,
        end_date: endDate || undefined,
        category_id: categoryId ? Number(categoryId) : undefined,
        is_active: isActive,
      }
      if (rule) {
        await updateRecurringRule(rule.id, payload)
      } else {
        await createRecurringRule(payload)
      }
      onSuccess()
    } catch {
      setError('Failed to save recurring rule.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {error && <div className="p-3 rounded-xl bg-danger/10 border border-danger/30 text-danger text-sm">{error}</div>}
      <Input label="Name" value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Monthly Rent" />
      <div className="grid grid-cols-2 gap-3">
        <Input label="Amount" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required hint="Positive=income, Negative=expense" />
        <Select label="Frequency" options={freqOptions} value={frequency} onChange={(e) => setFrequency(e.target.value as Frequency)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input label="Start Date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        <Input label="End Date (optional)" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
      </div>
      <Select label="Category" placeholder="Select category" options={catOptions} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} />
      <label className="flex items-center gap-2 cursor-pointer">
        <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="w-4 h-4 accent-primary" />
        <span className="text-sm text-text-secondary">Active rule</span>
      </label>
      <div className="flex gap-3 pt-2">
        <Button type="button" variant="secondary" onClick={onCancel} className="flex-1">Cancel</Button>
        <Button type="submit" variant="primary" loading={loading} className="flex-1">{rule ? 'Update' : 'Add'} Rule</Button>
      </div>
    </form>
  )
}

// ---- Budget Progress Bar ----
function BudgetProgressBar({ pct, amount, budget }: { pct: number; amount: number; budget: number }) {
  const clamped = clampPercentage(pct)
  const color = pct < 80 ? 'bg-primary' : pct < 100 ? 'bg-warning' : 'bg-danger'
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-text-secondary">{formatCurrency(amount)} of {formatCurrency(budget)}</span>
        <span className={cn('font-medium', pct < 80 ? 'text-primary' : pct < 100 ? 'text-warning' : 'text-danger')}>
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="h-1.5 bg-surface-2 rounded-full overflow-hidden">
        <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${clamped}%` }} />
      </div>
    </div>
  )
}

export default function BudgetPage() {
  const [budget, setBudget] = useState<BudgetSummary[]>([])
  const [categories, setCategories] = useState<Category[]>([])
  const [rules, setRules] = useState<RecurringRule[]>([])
  const [loading, setLoading] = useState(true)
  const [month] = useState(getCurrentMonth())
  const [tab, setTab] = useState<'budget' | 'categories' | 'recurring'>('budget')
  const [showCatForm, setShowCatForm] = useState(false)
  const [editCat, setEditCat] = useState<Category | undefined>()
  const [showRuleForm, setShowRuleForm] = useState(false)
  const [editRule, setEditRule] = useState<RecurringRule | undefined>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [b, cats, r] = await Promise.all([
        getBudgetSummary(month),
        getCategories(),
        getRecurringRules(),
      ])
      setBudget(b)
      setCategories(cats)
      setRules(r)
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }, [month])

  useEffect(() => { load() }, [load])

  const handleCatSuccess = () => { setShowCatForm(false); setEditCat(undefined); load() }
  const handleRuleSuccess = () => { setShowRuleForm(false); setEditRule(undefined); load() }

  const handleDeleteCat = async (cat: Category) => {
    if (!window.confirm(`Delete category "${cat.name}"?`)) return
    try { await deleteCategory(cat.id); load() } catch { alert('Failed to delete.') }
  }

  const handleDeleteRule = async (rule: RecurringRule) => {
    if (!window.confirm(`Delete rule "${rule.name}"?`)) return
    try { await deleteRecurringRule(rule.id); load() } catch { alert('Failed to delete.') }
  }

  const expensesBudget = budget.filter((b) => b.kind === 'expense' && b.budget_amount > 0)
  const expenseCategories = categories.filter((c) => c.kind === 'expense')
  const activeRules = rules.filter((r) => r.is_active)
  const inactiveRules = rules.filter((r) => !r.is_active)

  return (
    <AppLayout>
      <div className="flex flex-col gap-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 bg-surface border border-[#2d3748] rounded-xl p-1 w-fit">
          {(['budget', 'categories', 'recurring'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                'px-4 py-2 rounded-lg text-sm font-medium transition-colors capitalize',
                tab === t ? 'bg-primary text-white' : 'text-text-secondary hover:text-text-primary'
              )}
            >
              {t === 'recurring' ? 'Recurring Rules' : t === 'budget' ? 'Budget vs Actual' : 'Categories'}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48"><LoadingSpinner size="lg" /></div>
        ) : (
          <>
            {/* Budget vs Actual Tab */}
            {tab === 'budget' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-text-secondary text-sm">{formatMonth(month)} spending progress</p>
                </div>
                {expensesBudget.length === 0 ? (
                  <div className="text-center py-16 text-text-secondary">
                    <Target size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No budgets set</p>
                    <p className="text-sm mt-1">Add budget amounts to your categories</p>
                    <Button variant="primary" className="mt-4" onClick={() => setTab('categories')}>
                      Manage Categories
                    </Button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {expensesBudget.map((b) => (
                      <Card key={b.category_id} className="p-4">
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: b.color }} />
                            <span className="text-sm font-medium text-text-primary">{b.category_name}</span>
                          </div>
                          <CategoryKindBadge kind={b.kind} />
                        </div>
                        <BudgetProgressBar pct={b.percentage} amount={b.actual_amount} budget={b.budget_amount} />
                        <div className="mt-2 text-xs">
                          <span className={cn(b.remaining >= 0 ? 'text-primary' : 'text-danger')}>
                            {b.remaining >= 0 ? `${formatCurrency(b.remaining)} remaining` : `${formatCurrency(Math.abs(b.remaining))} over budget`}
                          </span>
                        </div>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Categories Tab */}
            {tab === 'categories' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-text-secondary text-sm">{categories.length} categories</p>
                  <Button variant="primary" size="sm" onClick={() => setShowCatForm(true)}>
                    <Plus size={14} /> Add Category
                  </Button>
                </div>
                <Card>
                  <div className="flex flex-col divide-y divide-[#2d3748]">
                    {categories.map((cat) => (
                      <div key={cat.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 group">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                        <div className="flex-1">
                          <p className="text-sm font-medium text-text-primary">{cat.name}</p>
                          {cat.parent_name && <p className="text-xs text-text-secondary">{cat.parent_name}</p>}
                        </div>
                        <CategoryKindBadge kind={cat.kind} />
                        {cat.budget_amount && (
                          <span className="text-xs text-text-secondary">{formatCurrency(cat.budget_amount)}/mo</span>
                        )}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => setEditCat(cat)} className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors">
                            <Edit2 size={14} />
                          </button>
                          <button onClick={() => handleDeleteCat(cat)} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {categories.length === 0 && (
                      <p className="text-center text-text-secondary py-8">No categories yet</p>
                    )}
                  </div>
                </Card>
              </div>
            )}

            {/* Recurring Rules Tab */}
            {tab === 'recurring' && (
              <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <p className="text-text-secondary text-sm">{activeRules.length} active rules</p>
                  <Button variant="primary" size="sm" onClick={() => setShowRuleForm(true)}>
                    <Plus size={14} /> Add Rule
                  </Button>
                </div>

                {activeRules.length > 0 && (
                  <Card title="Active Rules">
                    <div className="flex flex-col divide-y divide-[#2d3748]">
                      {activeRules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 group">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-text-primary">{rule.name}</p>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-xs text-text-secondary">{frequencyLabel(rule.frequency)}</span>
                              {rule.category_name && (
                                <>
                                  <span className="text-muted text-xs">·</span>
                                  <span className="text-xs text-text-secondary">{rule.category_name}</span>
                                </>
                              )}
                            </div>
                          </div>
                          <span className={cn('text-sm font-semibold', rule.amount >= 0 ? 'text-primary' : 'text-danger')}>
                            {rule.amount >= 0 ? '+' : ''}{formatCurrency(rule.amount)}
                          </span>
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={() => setEditRule(rule)} className="p-1.5 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10 transition-colors">
                              <Edit2 size={14} />
                            </button>
                            <button onClick={() => handleDeleteRule(rule)} className="p-1.5 rounded-lg text-text-secondary hover:text-danger hover:bg-danger/10 transition-colors">
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {inactiveRules.length > 0 && (
                  <Card title="Inactive Rules" className="opacity-60">
                    <div className="flex flex-col divide-y divide-[#2d3748]">
                      {inactiveRules.map((rule) => (
                        <div key={rule.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0 group">
                          <div className="flex-1">
                            <p className="text-sm font-medium text-text-primary">{rule.name}</p>
                            <span className="text-xs text-text-secondary">{frequencyLabel(rule.frequency)}</span>
                          </div>
                          <span className={cn('text-sm font-semibold', rule.amount >= 0 ? 'text-primary' : 'text-danger')}>
                            {rule.amount >= 0 ? '+' : ''}{formatCurrency(rule.amount)}
                          </span>
                          <button onClick={() => setEditRule(rule)} className="p-1.5 opacity-0 group-hover:opacity-100 rounded-lg text-text-secondary hover:text-primary hover:bg-primary/10">
                            <Edit2 size={14} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </Card>
                )}

                {rules.length === 0 && (
                  <div className="text-center py-16 text-text-secondary">
                    <RefreshCw size={48} className="mx-auto mb-3 opacity-30" />
                    <p className="font-medium">No recurring rules</p>
                    <p className="text-sm mt-1">Add recurring income and expenses to power the forecast</p>
                    <Button variant="primary" className="mt-4" onClick={() => setShowRuleForm(true)}>
                      <Plus size={16} /> Add First Rule
                    </Button>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Category Form Modal */}
      <Modal
        isOpen={showCatForm || !!editCat}
        onClose={() => { setShowCatForm(false); setEditCat(undefined) }}
        title={editCat ? 'Edit Category' : 'Add Category'}
        size="md"
      >
        <CategoryForm
          category={editCat}
          onSuccess={handleCatSuccess}
          onCancel={() => { setShowCatForm(false); setEditCat(undefined) }}
        />
      </Modal>

      {/* Recurring Rule Form Modal */}
      <Modal
        isOpen={showRuleForm || !!editRule}
        onClose={() => { setShowRuleForm(false); setEditRule(undefined) }}
        title={editRule ? 'Edit Recurring Rule' : 'Add Recurring Rule'}
        size="lg"
      >
        <RecurringRuleForm
          rule={editRule}
          categories={categories}
          onSuccess={handleRuleSuccess}
          onCancel={() => { setShowRuleForm(false); setEditRule(undefined) }}
        />
      </Modal>
    </AppLayout>
  )
}
