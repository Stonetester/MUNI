'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  CheckCircle2, Circle, Wallet, ArrowUpDown, RefreshCw, Target,
  Info, UserCircle, FileText, ChevronRight, Layers, Home,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { getAccounts, getTransactions, getRecurringRules, getCategories, getSyncConfig, getStudentLoans, getFinancialProfile, getPaystubs, getHomeBuyingGoals } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import AppLayout from '@/components/layout/AppLayout'

interface CheckItem {
  id: string
  label: string
  detail: string
  done: boolean
  value?: string
  linkHref: string
  linkLabel: string
}

export default function GettingStartedPage() {
  const [checks, setChecks] = useState<CheckItem[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    try {
      const [accounts, txData, rules, cats, profile, loans, paystubs, homeBuyingGoals] = await Promise.all([
        getAccounts().catch(() => []),
        getTransactions({ limit: 1 }).catch(() => ({ items: [], total: 0, skip: 0, limit: 1 })),
        getRecurringRules().catch(() => []),
        getCategories().catch(() => []),
        getFinancialProfile().catch(() => null),
        getStudentLoans().catch(() => []),
        getPaystubs().catch(() => []),
        getHomeBuyingGoals().catch(() => []),
      ])

      let syncEnabled = false
      try {
        const cfg = await getSyncConfig()
        syncEnabled = cfg.is_enabled || !!cfg.last_sync_at
      } catch { /* not configured yet */ }

      const hasAccounts = accounts.length > 0
      const hasTransactions = txData.total > 0
      const hasPaystubs = paystubs.length > 0
      const hasRecurring = rules.length > 0
      const hasBudgets = cats.some(c => (c.budget_amount ?? 0) > 0)
      const hasSalary = !!profile?.salary
      const hasLoans = loans.length > 0
      const hasHomeBuyingGoal = homeBuyingGoals.some(g => g.current_savings > 0 || g.target_price_min !== 380000 || g.monthly_savings_contribution !== 1600)

      const savingsAcct = accounts.find(a => ['savings', 'hysa'].includes(a.account_type))
      const investAcct = accounts.find(a => ['401k', 'ira', 'brokerage'].includes(a.account_type))

      setChecks([
        {
          id: 'accounts',
          label: 'Add your accounts',
          detail: hasAccounts
            ? `${accounts.length} account${accounts.length !== 1 ? 's' : ''} added (${accounts.map(a => a.name).slice(0, 3).join(', ')}${accounts.length > 3 ? '…' : ''})`
            : 'Add checking, savings, 401k, student loans, etc.',
          done: hasAccounts,
          value: hasAccounts ? `${accounts.length} accounts` : undefined,
          linkHref: '/accounts',
          linkLabel: hasAccounts ? 'Manage accounts' : 'Add first account →',
        },
        {
          id: 'savings',
          label: 'Add a savings / HYSA account',
          detail: savingsAcct
            ? `${savingsAcct.name} — ${formatCurrency(savingsAcct.balance)}`
            : 'Track your emergency fund and high-yield savings',
          done: !!savingsAcct,
          value: savingsAcct ? savingsAcct.name : undefined,
          linkHref: '/accounts',
          linkLabel: savingsAcct ? 'View accounts' : 'Add savings account →',
        },
        {
          id: 'investments',
          label: 'Add investment accounts (401k / IRA)',
          detail: investAcct
            ? `${investAcct.name} — ${formatCurrency(investAcct.balance)}`
            : 'Add 401k, IRA, brokerage accounts for net worth tracking',
          done: !!investAcct,
          value: investAcct ? investAcct.name : undefined,
          linkHref: '/accounts',
          linkLabel: investAcct ? 'View accounts' : 'Add investment account →',
        },
        {
          id: 'paystubs',
          label: 'Upload a paystub PDF',
          detail: hasPaystubs
            ? `${paystubs.length} paystub${paystubs.length !== 1 ? 's' : ''} saved — income transactions created automatically`
            : 'Upload a Paylocity PDF — income transactions are created automatically on save',
          done: hasPaystubs,
          value: hasPaystubs ? `${paystubs.length} paystub${paystubs.length !== 1 ? 's' : ''}` : undefined,
          linkHref: '/paystubs',
          linkLabel: hasPaystubs ? 'View paystubs' : 'Upload first paystub →',
        },
        {
          id: 'transactions',
          label: 'Sync or import expense transactions',
          detail: hasTransactions
            ? `${txData.total.toLocaleString()} transaction${txData.total !== 1 ? 's' : ''} in history`
            : 'Connect Google Sheets for auto-sync, or import a CSV from your bank',
          done: hasTransactions,
          value: hasTransactions ? `${txData.total.toLocaleString()} transactions` : undefined,
          linkHref: '/transactions',
          linkLabel: hasTransactions ? 'View transactions' : 'Go to transactions →',
        },
        {
          id: 'sheets',
          label: 'Connect Google Sheets auto-sync',
          detail: syncEnabled
            ? 'Google Sheets sync is active — transactions import automatically'
            : 'Skip manual exports — connect your spending sheet for auto-import',
          done: syncEnabled,
          value: syncEnabled ? 'Connected' : undefined,
          linkHref: '/settings',
          linkLabel: syncEnabled ? 'Sync settings' : 'Connect Google Sheets →',
        },
        {
          id: 'recurring',
          label: 'Set up recurring rules',
          detail: hasRecurring
            ? `${rules.length} recurring rule${rules.length !== 1 ? 's' : ''} active (${rules.slice(0, 2).map(r => r.name).join(', ')}${rules.length > 2 ? '…' : ''})`
            : 'Add your paycheck, rent, loan payments — powers the forecast',
          done: hasRecurring,
          value: hasRecurring ? `${rules.length} rules` : undefined,
          linkHref: '/budget',
          linkLabel: hasRecurring ? 'Manage rules' : 'Add recurring rules →',
        },
        {
          id: 'budget',
          label: 'Set monthly budget amounts',
          detail: hasBudgets
            ? 'Budget amounts set — alerts will fire when you overspend'
            : 'Set spending targets per category to enable budget alerts',
          done: hasBudgets,
          value: hasBudgets ? 'Configured' : undefined,
          linkHref: '/budget',
          linkLabel: hasBudgets ? 'View budget' : 'Set budgets →',
        },
        {
          id: 'salary',
          label: 'Enter your salary in Financial Profile',
          detail: hasSalary && profile?.salary
            ? `Annual salary: ${formatCurrency(profile.salary)} — pay frequency: ${profile.pay_frequency ?? 'not set'}`
            : 'Add your salary, 401k details, HYSA contributions',
          done: hasSalary,
          value: hasSalary && profile?.salary ? formatCurrency(profile.salary) + '/yr' : undefined,
          linkHref: '/financial-profile',
          linkLabel: hasSalary ? 'View profile' : 'Fill out profile →',
        },
        {
          id: 'loans',
          label: 'Track student loans',
          detail: hasLoans
            ? `${loans.length} loan${loans.length !== 1 ? 's' : ''}: total ${formatCurrency(loans.reduce((s, l) => s + l.current_balance, 0))} remaining`
            : 'Add each loan with balance and rate for payoff tracking',
          done: hasLoans,
          value: hasLoans ? `${loans.length} loans` : undefined,
          linkHref: '/financial-profile',
          linkLabel: hasLoans ? 'View loans' : 'Add student loans →',
        },
        {
          id: 'home-buying',
          label: 'Set up a home buying goal',
          detail: hasHomeBuyingGoal
            ? `Home buying goal configured — savings target, price range, and DPA eligibility tracked`
            : 'Enter your target price range, savings, and mortgage structure to unlock MD down payment assistance analysis',
          done: hasHomeBuyingGoal,
          value: hasHomeBuyingGoal ? 'Configured' : undefined,
          linkHref: '/home-buying',
          linkLabel: hasHomeBuyingGoal ? 'View home buying plan' : 'Set up home buying goal →',
        },
      ])
    } catch {
      setChecks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    // Re-check when user returns to this tab
    const onVisible = () => { if (!document.hidden) load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [load])

  const done = checks.filter(c => c.done).length
  const pct = checks.length > 0 ? Math.round((done / checks.length) * 100) : 0

  return (
    <AppLayout>
      <div className="max-w-2xl flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Layers size={20} className="text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-text-primary">Getting Started</h1>
            <p className="text-sm text-text-secondary">Your setup checklist — items auto-complete as you use the app</p>
          </div>
        </div>

        {/* Progress bar */}
        {!loading && (
          <div className="bg-surface rounded-xl border border-[#2d3748] p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-text-primary">{done} of {checks.length} complete</span>
              <span className="text-sm font-bold text-primary">{pct}%</span>
            </div>
            <div className="w-full h-2 bg-surface-2 rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            {pct === 100 && (
              <p className="text-xs text-green-400 flex items-center gap-1.5">
                <CheckCircle2 size={14} /> All set! Check the Dashboard and Forecast to see your data.
              </p>
            )}
          </div>
        )}

        {/* Checklist */}
        {loading ? (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-surface border border-[#2d3748] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {checks.map((item) => (
              <div
                key={item.id}
                className={cn(
                  'rounded-xl border p-4 transition-colors',
                  item.done
                    ? 'border-green-500/20 bg-green-500/5'
                    : 'border-[#2d3748] bg-surface'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className="shrink-0 mt-0.5">
                    {item.done
                      ? <CheckCircle2 size={20} className="text-green-400" />
                      : <Circle size={20} className="text-text-secondary" />
                    }
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className={cn('text-sm font-semibold', item.done ? 'text-text-secondary line-through' : 'text-text-primary')}>
                        {item.label}
                      </p>
                      {item.value && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-green-500/10 text-green-400 shrink-0">
                          {item.value}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-text-secondary mt-0.5">{item.detail}</p>
                    <Link
                      href={item.linkHref}
                      className={cn(
                        'inline-flex items-center gap-1 mt-2 text-xs font-medium transition-colors',
                        item.done
                          ? 'text-text-secondary hover:text-text-primary'
                          : 'text-primary hover:text-primary/80'
                      )}
                    >
                      {item.linkLabel} <ChevronRight size={12} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Quick links section */}
        <div className="bg-surface rounded-xl border border-[#2d3748] p-4">
          <p className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">Quick Links</p>
          <div className="grid grid-cols-2 gap-2">
            {[
              { label: 'Add Account', href: '/accounts', icon: Wallet },
              { label: 'Import Transactions', href: '/transactions', icon: ArrowUpDown },
              { label: 'Recurring Rules', href: '/budget', icon: RefreshCw },
              { label: 'Budget Setup', href: '/budget', icon: Target },
              { label: 'Financial Profile', href: '/financial-profile', icon: UserCircle },
              { label: 'Upload Paystub', href: '/paystubs', icon: FileText },
              { label: 'Sync Settings', href: '/settings', icon: RefreshCw },
              { label: 'View Forecast', href: '/forecast', icon: Info },
              { label: 'Home Buying', href: '/home-buying', icon: Home },
            ].map(({ label, href, icon: Icon }) => (
              <Link
                key={label + href}
                href={href}
                className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-surface-2 hover:bg-primary/10 hover:text-primary text-text-secondary text-sm transition-colors"
              >
                <Icon size={14} />
                {label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </AppLayout>
  )
}
