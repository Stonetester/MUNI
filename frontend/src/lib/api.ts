import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { getToken, logout } from './auth'
import { isDemoModeActive } from './demoMode'
import * as demo from './demoData'
import type {
  Account,
  AccountBalanceDetail,
  Category,
  Transaction,
  RecurringRule,
  BalanceSnapshot,
  LifeEvent,
  EventLineItem,
  Scenario,
  ForecastResponse,
  DashboardData,
  TransactionFilters,
  PaginatedTransactions,
  BudgetSummary,
  AlertItem,
  SyncConfig,
  SyncResult,
  FinancialProfile,
  StudentLoan,
  InvestmentHolding,
  CompensationEvent,
  Paystub,
  ParsedPaystub,
  HomeBuyingGoal,
} from './types'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'

function createApiClient(): AxiosInstance {
  const client = axios.create({
    baseURL: `${BASE_URL}/api/v1`,
    headers: { 'Content-Type': 'application/json' },
  })

  client.interceptors.request.use((config) => {
    const token = getToken()
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  })

  client.interceptors.response.use(
    (response) => response,
    (error) => {
      if (error.response?.status === 401) {
        logout()
      }
      return Promise.reject(error)
    }
  )

  return client
}

const api = createApiClient()

// Dashboard
export async function getDashboard(): Promise<DashboardData> {
  if (isDemoModeActive()) return demo.DEMO_DASHBOARD
  const res: AxiosResponse<DashboardData> = await api.get('/dashboard')
  return res.data
}

// Accounts
export async function getAccounts(): Promise<Account[]> {
  if (isDemoModeActive()) return demo.DEMO_ACCOUNTS
  const res: AxiosResponse<Account[]> = await api.get('/accounts')
  return res.data
}

export async function createAccount(data: Partial<Account>): Promise<Account> {
  if (isDemoModeActive()) return { id: 99, name: data.name || 'Demo Account', account_type: data.account_type || 'checking', balance: 0, is_active: true, forecast_enabled: false, is_joint: false, created_at: new Date().toISOString() }
  const res: AxiosResponse<Account> = await api.post('/accounts', data)
  return res.data
}

export async function updateAccount(id: number, data: Partial<Account>): Promise<Account> {
  if (isDemoModeActive()) return { ...demo.DEMO_ACCOUNTS.find(a => a.id === id)!, ...data }
  const res: AxiosResponse<Account> = await api.put(`/accounts/${id}`, data)
  return res.data
}

export async function deleteAccount(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/accounts/${id}`)
}

export async function getAccountBalanceDetails(): Promise<AccountBalanceDetail[]> {
  if (isDemoModeActive()) return []
  const res: AxiosResponse<AccountBalanceDetail[]> = await api.get('/accounts/balances')
  return res.data
}

export async function getAccountSnapshots(accountId: number): Promise<BalanceSnapshot[]> {
  if (isDemoModeActive()) return demo.DEMO_SNAPSHOTS.filter(s => s.account_id === accountId)
  const res: AxiosResponse<BalanceSnapshot[]> = await api.get(`/balance-snapshots?account_id=${accountId}`)
  return res.data
}

export async function createSnapshot(data: Partial<BalanceSnapshot>): Promise<BalanceSnapshot> {
  if (isDemoModeActive()) return { id: 99, account_id: data.account_id!, date: data.date!, balance: data.balance! }
  const res: AxiosResponse<BalanceSnapshot> = await api.post('/balance-snapshots', data)
  return res.data
}

export async function deleteSnapshot(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/balance-snapshots/${id}`)
}

// Categories
export async function getCategories(): Promise<Category[]> {
  if (isDemoModeActive()) return demo.DEMO_CATEGORIES
  const res: AxiosResponse<Category[]> = await api.get('/categories')
  return res.data
}

export async function createCategory(data: Partial<Category>): Promise<Category> {
  if (isDemoModeActive()) return { id: 99, name: data.name || 'Demo', kind: data.kind || 'expense', color: '#888888' }
  const res: AxiosResponse<Category> = await api.post('/categories', data)
  return res.data
}

export async function updateCategory(id: number, data: Partial<Category>): Promise<Category> {
  if (isDemoModeActive()) return { ...demo.DEMO_CATEGORIES.find(c => c.id === id)!, ...data }
  const res: AxiosResponse<Category> = await api.put(`/categories/${id}`, data)
  return res.data
}

export async function deleteCategory(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/categories/${id}`)
}

// Transactions
export async function getTransactions(filters?: TransactionFilters): Promise<PaginatedTransactions> {
  if (isDemoModeActive()) {
    const items = demo.DEMO_TRANSACTIONS.slice(filters?.offset ?? 0, (filters?.offset ?? 0) + (filters?.limit ?? 50))
    return { items, total: demo.DEMO_TRANSACTIONS.length, skip: filters?.offset ?? 0, limit: filters?.limit ?? 50 }
  }
  const params = new URLSearchParams()
  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.append(key, String(value))
      }
    })
  }
  const res: AxiosResponse<PaginatedTransactions> = await api.get(`/transactions?${params.toString()}`)
  return res.data
}

export async function createTransaction(data: Partial<Transaction>): Promise<Transaction> {
  if (isDemoModeActive()) return { id: 99, date: data.date!, amount: data.amount!, description: data.description!, is_verified: false, created_at: new Date().toISOString() }
  const res: AxiosResponse<Transaction> = await api.post('/transactions', data)
  return res.data
}

export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<Transaction> {
  if (isDemoModeActive()) return { ...demo.DEMO_TRANSACTIONS.find(t => t.id === id)!, ...data }
  const res: AxiosResponse<Transaction> = await api.put(`/transactions/${id}`, data)
  return res.data
}

export async function deleteTransaction(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/transactions/${id}`)
}

export async function deleteSheetsTransactions(): Promise<{ deleted: number }> {
  if (isDemoModeActive()) return { deleted: 0 }
  const res = await api.delete('/transactions/bulk/sheets')
  return res.data
}

export async function deleteAllTransactions(): Promise<{ deleted: number }> {
  if (isDemoModeActive()) return { deleted: 0 }
  const res = await api.delete('/transactions/bulk/all')
  return res.data
}

export async function importTransactions(file: File): Promise<{ imported: number; errors: string[] }> {
  if (isDemoModeActive()) return { imported: 0, errors: ['Demo mode — imports are disabled'] }
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/transactions/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export interface WidePreviewRow {
  description: string
  date: string
  month_label: string
  amount: number
  inferred_kind: 'income' | 'expense' | 'unknown'
}

export interface WidePreviewResult {
  rows: WidePreviewRow[]
  errors: string[]
}

export async function previewWideImport(file: File): Promise<WidePreviewResult> {
  if (isDemoModeActive()) return { rows: [], errors: ['Demo mode — imports are disabled'] }
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/import/wide-preview', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function commitWideImport(
  transactions: { description: string; date: string; amount: number; kind: string }[],
  accountId?: number,
): Promise<{ imported: number; duplicates: number; errors: string[] }> {
  if (isDemoModeActive()) return { imported: 0, duplicates: 0, errors: ['Demo mode — imports are disabled'] }
  const res = await api.post('/import/wide-commit', {
    transactions,
    account_id: accountId ?? null,
  })
  return res.data
}

// Recurring Rules
export async function getRecurringRules(scenarioId?: number): Promise<RecurringRule[]> {
  if (isDemoModeActive()) return demo.DEMO_RECURRING_RULES
  const params = scenarioId ? `?scenario_id=${scenarioId}` : ''
  const res: AxiosResponse<RecurringRule[]> = await api.get(`/recurring${params}`)
  return res.data
}

export async function createRecurringRule(data: Partial<RecurringRule>): Promise<RecurringRule> {
  if (isDemoModeActive()) return { id: 99, name: data.name || 'Demo Rule', amount: data.amount || 0, frequency: data.frequency || 'monthly', start_date: data.start_date || new Date().toISOString().slice(0, 10), is_active: true }
  const res: AxiosResponse<RecurringRule> = await api.post('/recurring', data)
  return res.data
}

export async function updateRecurringRule(id: number, data: Partial<RecurringRule>): Promise<RecurringRule> {
  if (isDemoModeActive()) return { ...demo.DEMO_RECURRING_RULES.find(r => r.id === id)!, ...data }
  const res: AxiosResponse<RecurringRule> = await api.put(`/recurring/${id}`, data)
  return res.data
}

export async function deleteRecurringRule(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/recurring/${id}`)
}

// Life Events
export async function getLifeEvents(scenarioId?: number): Promise<LifeEvent[]> {
  if (isDemoModeActive()) return demo.DEMO_LIFE_EVENTS
  const params = scenarioId ? `?scenario_id=${scenarioId}` : ''
  const res: AxiosResponse<LifeEvent[]> = await api.get(`/events${params}`)
  return res.data
}

export async function createLifeEvent(data: Partial<LifeEvent>): Promise<LifeEvent> {
  if (isDemoModeActive()) return { id: 99, name: data.name || 'Demo Event', event_type: data.event_type || 'other', start_date: data.start_date!, total_cost: data.total_cost || 0, is_active: true, is_joint: data.is_joint ?? false }
  const res: AxiosResponse<LifeEvent> = await api.post('/events', data)
  return res.data
}

export async function updateLifeEvent(id: number, data: Partial<LifeEvent>): Promise<LifeEvent> {
  if (isDemoModeActive()) return { ...demo.DEMO_LIFE_EVENTS.find(e => e.id === id)!, ...data }
  const res: AxiosResponse<LifeEvent> = await api.put(`/events/${id}`, data)
  return res.data
}

export async function deleteLifeEvent(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/events/${id}`)
}

export async function deleteAllLifeEvents(): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete('/events')
}

// Event Line Items
export async function getEventLineItems(eventId: number): Promise<EventLineItem[]> {
  if (isDemoModeActive()) return []
  const res = await api.get(`/events/${eventId}/items`)
  return res.data
}

export async function createEventLineItem(eventId: number, data: Omit<EventLineItem, 'id' | 'event_id'>): Promise<EventLineItem> {
  if (isDemoModeActive()) return { id: 99, event_id: eventId, ...data }
  const res = await api.post(`/events/${eventId}/items`, data)
  return res.data
}

export async function updateEventLineItem(eventId: number, itemId: number, data: Partial<EventLineItem>): Promise<EventLineItem> {
  if (isDemoModeActive()) return { id: itemId, event_id: eventId, name: '', estimated_cost: 0, sort_order: 0, ...data }
  const res = await api.put(`/events/${eventId}/items/${itemId}`, data)
  return res.data
}

export async function deleteEventLineItem(eventId: number, itemId: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/events/${eventId}/items/${itemId}`)
}

export async function bulkSaveEventLineItems(eventId: number, items: Omit<EventLineItem, 'id' | 'event_id'>[]): Promise<EventLineItem[]> {
  if (isDemoModeActive()) return items.map((item, i) => ({ id: i + 1, event_id: eventId, ...item }))
  const res = await api.post(`/events/${eventId}/items/bulk`, items)
  return res.data
}

// Scenarios
export async function getScenarios(): Promise<Scenario[]> {
  if (isDemoModeActive()) return demo.DEMO_SCENARIOS
  const res: AxiosResponse<Scenario[]> = await api.get('/scenarios')
  return res.data
}

export async function createScenario(data: Partial<Scenario>): Promise<Scenario> {
  if (isDemoModeActive()) return { id: 99, name: data.name || 'Demo Scenario', is_baseline: false, created_at: new Date().toISOString() }
  const res: AxiosResponse<Scenario> = await api.post('/scenarios', data)
  return res.data
}

export async function updateScenario(id: number, data: Partial<Scenario>): Promise<Scenario> {
  if (isDemoModeActive()) return { ...demo.DEMO_SCENARIOS.find(s => s.id === id)!, ...data }
  const res: AxiosResponse<Scenario> = await api.put(`/scenarios/${id}`, data)
  return res.data
}

export async function deleteScenario(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/scenarios/${id}`)
}

export async function cloneScenario(id: number, name: string): Promise<Scenario> {
  if (isDemoModeActive()) return { id: 99, name, is_baseline: false, created_at: new Date().toISOString() }
  const res: AxiosResponse<Scenario> = await api.post(`/scenarios/${id}/clone`, { name })
  return res.data
}

// Forecast
export async function getForecast(scenarioId?: number, months?: number, pastMonths?: number): Promise<ForecastResponse> {
  if (isDemoModeActive()) return demo.DEMO_FORECAST
  const params = new URLSearchParams()
  if (scenarioId) params.append('scenario_id', String(scenarioId))
  if (months) params.append('months', String(months))
  if (pastMonths) params.append('past_months', String(pastMonths))
  const res: AxiosResponse<ForecastResponse> = await api.get(`/forecast?${params.toString()}`)
  return res.data
}

// Auth
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  if (isDemoModeActive()) return
  await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
}

// Budget
export async function getBudgetSummary(month?: string): Promise<BudgetSummary[]> {
  if (isDemoModeActive()) return demo.DEMO_BUDGET
  const params = month ? `?month=${month}` : ''
  const res: AxiosResponse<BudgetSummary[]> = await api.get(`/budget/summary${params}`)
  return res.data
}


// Alerts
export async function getAlerts(month?: string, lookaheadDays = 30): Promise<AlertItem[]> {
  if (isDemoModeActive()) return demo.DEMO_ALERTS
  const params = new URLSearchParams()
  if (month) params.append('month', month)
  params.append('lookahead_days', String(lookaheadDays))
  const res: AxiosResponse<AlertItem[]> = await api.get(`/alerts?${params.toString()}`)
  return res.data
}

// Recurring rule suggestions
export async function getRecurringSuggestions(): Promise<Array<{
  description: string
  amount: number
  frequency: string
  occurrences: number
  last_date: string
  category_id?: number
  account_id?: number
  median_gap_days: number
}>> {
  if (isDemoModeActive()) return []
  const res = await api.get('/recurring/suggestions')
  return res.data
}

// Google Sheets Sync
export async function getSyncConfig(): Promise<SyncConfig> {
  if (isDemoModeActive()) return demo.DEMO_SYNC_CONFIG
  const res: AxiosResponse<SyncConfig> = await api.get('/sync/google-sheets/config')
  return res.data
}

export async function updateSyncConfig(data: { sheet_id?: string; is_enabled?: boolean }): Promise<SyncConfig> {
  if (isDemoModeActive()) return { ...demo.DEMO_SYNC_CONFIG, ...data }
  const res: AxiosResponse<SyncConfig> = await api.put('/sync/google-sheets/config', data)
  return res.data
}

export async function runSync(): Promise<SyncResult> {
  if (isDemoModeActive()) return { imported: 0, skipped: 0, errors: ['Demo mode — sync is disabled'], last_sync_at: new Date().toISOString(), status: 'demo' }
  const res: AxiosResponse<SyncResult> = await api.post('/sync/google-sheets/run')
  return res.data
}

// Financial Profile
export async function getFinancialProfile(): Promise<FinancialProfile> {
  if (isDemoModeActive()) return demo.DEMO_FINANCIAL_PROFILE
  const res: AxiosResponse<FinancialProfile> = await api.get('/financial-profile')
  return res.data
}

export async function updateFinancialProfile(data: Partial<FinancialProfile>): Promise<FinancialProfile> {
  if (isDemoModeActive()) return { ...demo.DEMO_FINANCIAL_PROFILE, ...data }
  const res: AxiosResponse<FinancialProfile> = await api.put('/financial-profile', data)
  return res.data
}

// Student Loans
export async function getStudentLoans(): Promise<StudentLoan[]> {
  if (isDemoModeActive()) return demo.DEMO_STUDENT_LOANS
  const res: AxiosResponse<StudentLoan[]> = await api.get('/financial-profile/loans')
  return res.data
}

export async function createStudentLoan(data: Partial<StudentLoan>): Promise<StudentLoan> {
  if (isDemoModeActive()) return { id: 99, user_id: 1, loan_name: data.loan_name || 'Demo Loan', original_balance: data.original_balance || 0, current_balance: data.current_balance || 0, interest_rate: data.interest_rate || 0, minimum_payment: data.minimum_payment || 0, is_active: true, created_at: new Date().toISOString() }
  const res: AxiosResponse<StudentLoan> = await api.post('/financial-profile/loans', data)
  return res.data
}

export async function updateStudentLoan(id: number, data: Partial<StudentLoan>): Promise<StudentLoan> {
  if (isDemoModeActive()) return { ...demo.DEMO_STUDENT_LOANS.find(l => l.id === id)!, ...data }
  const res: AxiosResponse<StudentLoan> = await api.put(`/financial-profile/loans/${id}`, data)
  return res.data
}

export async function deleteStudentLoan(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/financial-profile/loans/${id}`)
}

// Investment Holdings
export async function getHoldings(): Promise<InvestmentHolding[]> {
  if (isDemoModeActive()) return demo.DEMO_HOLDINGS
  const res: AxiosResponse<InvestmentHolding[]> = await api.get('/financial-profile/holdings')
  return res.data
}

export async function createHolding(data: Partial<InvestmentHolding>): Promise<InvestmentHolding> {
  if (isDemoModeActive()) return { id: 99, user_id: 1, account_id: data.account_id || 0, fund_name: data.fund_name || 'Demo Fund', current_value: data.current_value || 0, monthly_contribution: data.monthly_contribution || 0, assumed_annual_return: data.assumed_annual_return || 7, created_at: new Date().toISOString() }
  const res: AxiosResponse<InvestmentHolding> = await api.post('/financial-profile/holdings', data)
  return res.data
}

export async function updateHolding(id: number, data: Partial<InvestmentHolding>): Promise<InvestmentHolding> {
  if (isDemoModeActive()) return { ...demo.DEMO_HOLDINGS.find(h => h.id === id)!, ...data }
  const res: AxiosResponse<InvestmentHolding> = await api.put(`/financial-profile/holdings/${id}`, data)
  return res.data
}

export async function deleteHolding(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/financial-profile/holdings/${id}`)
}

// Compensation Events
export async function getCompensationEvents(): Promise<CompensationEvent[]> {
  if (isDemoModeActive()) return demo.DEMO_COMPENSATION_EVENTS
  const res: AxiosResponse<CompensationEvent[]> = await api.get('/financial-profile/compensation')
  return res.data
}

export async function createCompensationEvent(data: Partial<CompensationEvent>): Promise<CompensationEvent> {
  if (isDemoModeActive()) return { id: 99, user_id: 1, event_type: data.event_type || 'other', effective_date: data.effective_date!, created_at: new Date().toISOString() }
  const res: AxiosResponse<CompensationEvent> = await api.post('/financial-profile/compensation', data)
  return res.data
}

export async function updateCompensationEvent(id: number, data: Partial<CompensationEvent>): Promise<CompensationEvent> {
  if (isDemoModeActive()) return { ...demo.DEMO_COMPENSATION_EVENTS.find(e => e.id === id)!, ...data }
  const res: AxiosResponse<CompensationEvent> = await api.put(`/financial-profile/compensation/${id}`, data)
  return res.data
}

export async function deleteCompensationEvent(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/financial-profile/compensation/${id}`)
}

// Joint household view
export async function getJointSummary(): Promise<{
  net_worth: number
  total_assets: number
  total_liabilities: number
  this_month_income: number
  this_month_spending: number
}> {
  if (isDemoModeActive()) return demo.DEMO_JOINT_SUMMARY
  const res = await api.get('/joint/summary')
  return res.data
}

export async function getJointAccounts(): Promise<Array<{
  id: number
  name: string
  account_type: string
  balance: number
  institution?: string
  owner: string
  is_active: boolean
}>> {
  if (isDemoModeActive()) return demo.DEMO_ACCOUNTS.map(a => ({ ...a, owner: 'demo' }))
  const res = await api.get('/joint/accounts')
  return res.data
}

export async function getJointTransactions(limit = 50, offset = 0): Promise<PaginatedTransactions> {
  if (isDemoModeActive()) return { items: demo.DEMO_TRANSACTIONS.slice(offset, offset + limit), total: demo.DEMO_TRANSACTIONS.length, skip: offset, limit }
  const res = await api.get(`/joint/transactions?limit=${limit}&offset=${offset}`)
  return res.data as PaginatedTransactions
}

export async function getJointEvents(): Promise<Array<LifeEvent & { owner: string }>> {
  if (isDemoModeActive()) return demo.DEMO_LIFE_EVENTS.map(e => ({ ...e, owner: 'demo' }))
  const res = await api.get('/joint/events')
  return res.data
}

export async function getJointAlerts(): Promise<AlertItem[]> {
  if (isDemoModeActive()) return demo.DEMO_ALERTS
  const res = await api.get('/joint/alerts')
  return res.data
}

export async function getJointBudgetSummary(month?: string): Promise<BudgetSummary[]> {
  if (isDemoModeActive()) return demo.DEMO_BUDGET
  const params = month ? `?month=${month}` : ''
  const res = await api.get(`/joint/budget/summary${params}`)
  return res.data
}

export async function getJointForecast(months = 60, pastMonths = 0): Promise<ForecastResponse> {
  if (isDemoModeActive()) return demo.DEMO_FORECAST
  const res = await api.get(`/joint/forecast?months=${months}&past_months=${pastMonths}`)
  return res.data
}

// Paystubs
export async function parsePaystub(file: File): Promise<ParsedPaystub> {
  if (isDemoModeActive()) return { parsed: demo.DEMO_PAYSTUBS[0], parse_method: 'demo' }
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/paystubs/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function savePaystub(data: Partial<Paystub>): Promise<Paystub> {
  if (isDemoModeActive()) return { ...demo.DEMO_PAYSTUBS[0], ...data }
  const res: AxiosResponse<Paystub> = await api.post('/paystubs', data)
  return res.data
}

export async function getPaystubs(): Promise<Paystub[]> {
  if (isDemoModeActive()) return demo.DEMO_PAYSTUBS
  const res: AxiosResponse<Paystub[]> = await api.get('/paystubs')
  return res.data
}

export async function updatePaystub(id: number, data: Partial<Paystub>): Promise<Paystub> {
  if (isDemoModeActive()) return { ...demo.DEMO_PAYSTUBS.find(p => p.id === id)!, ...data }
  const res: AxiosResponse<Paystub> = await api.put(`/paystubs/${id}`, data)
  return res.data
}

export async function deletePaystub(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/paystubs/${id}`)
}

export async function deleteAllPaystubs(): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete('/paystubs')
}

// Home Buying
export async function getHomeBuyingGoal(): Promise<HomeBuyingGoal> {
  if (isDemoModeActive()) return demo.DEMO_HOME_BUYING_GOAL
  const res: AxiosResponse<HomeBuyingGoal> = await api.get('/home-buying/goal')
  return res.data
}

export async function getHomeBuyingGoals(): Promise<HomeBuyingGoal[]> {
  if (isDemoModeActive()) return [demo.DEMO_HOME_BUYING_GOAL]
  const res: AxiosResponse<HomeBuyingGoal[]> = await api.get('/home-buying/goals')
  return res.data
}

export async function updateHomeBuyingGoal(data: HomeBuyingGoal): Promise<HomeBuyingGoal> {
  if (isDemoModeActive()) return { ...demo.DEMO_HOME_BUYING_GOAL, ...data }
  const res: AxiosResponse<HomeBuyingGoal> = await api.put('/home-buying/goal', data)
  return res.data
}

export async function createHomeBuyingGoal(data: Omit<HomeBuyingGoal, 'id'>): Promise<HomeBuyingGoal> {
  if (isDemoModeActive()) return { id: 99, ...data }
  const res: AxiosResponse<HomeBuyingGoal> = await api.post('/home-buying/goals', data)
  return res.data
}

export async function updateHomeBuyingGoalById(id: number, data: HomeBuyingGoal): Promise<HomeBuyingGoal> {
  if (isDemoModeActive()) return { ...demo.DEMO_HOME_BUYING_GOAL, ...data }
  const res: AxiosResponse<HomeBuyingGoal> = await api.put(`/home-buying/goals/${id}`, data)
  return res.data
}

export async function activateHomeBuyingGoal(id: number): Promise<HomeBuyingGoal> {
  if (isDemoModeActive()) return demo.DEMO_HOME_BUYING_GOAL
  const res: AxiosResponse<HomeBuyingGoal> = await api.post(`/home-buying/goals/${id}/activate`)
  return res.data
}

export async function deleteHomeBuyingGoal(id: number): Promise<void> {
  if (isDemoModeActive()) return
  await api.delete(`/home-buying/goals/${id}`)
}

// AI Monthly Report
export async function getAiReport(year?: number, month?: number, provider: 'claude' | 'openai' = 'claude'): Promise<{ year: number; month: number; report: string; provider: string }> {
  if (isDemoModeActive()) {
    const now = new Date()
    return {
      year: year ?? now.getFullYear(),
      month: month ?? now.getMonth() + 1,
      provider,
      report: `## Demo Financial Report\n\n**Overall:** Your finances are in great shape this month. Income was strong at $7,350 and spending came in at $3,820 — well below your earnings.\n\n**Top Spending:** Rent ($1,850) remains your largest fixed expense. Groceries ($330) and dining ($101) were both within budget.\n\n**Savings:** You transferred $500 to your HYSA and your 401k contributions continue on track. Net worth is trending upward.\n\n**Next Month:** Consider reducing dining out and shopping to free up more for your wedding savings goal.\n\n_This is demo data — no real financial information is shown._`,
    }
  }
  const params = new URLSearchParams()
  if (year) params.append('year', String(year))
  if (month) params.append('month', String(month))
  params.append('provider', provider)
  const res = await api.get(`/ai-report?${params.toString()}`)
  return res.data
}

// Notifications
export async function getNotificationSettings(): Promise<{ notification_email: string | null; weekly_digest_enabled: boolean }> {
  if (isDemoModeActive()) return { notification_email: 'demo@example.com', weekly_digest_enabled: true }
  const res = await api.get('/notifications/settings')
  return res.data
}

export async function updateNotificationSettings(data: { notification_email?: string; weekly_digest_enabled?: boolean }): Promise<{ notification_email: string | null; weekly_digest_enabled: boolean }> {
  if (isDemoModeActive()) return { notification_email: data.notification_email ?? 'demo@example.com', weekly_digest_enabled: data.weekly_digest_enabled ?? true }
  const res = await api.put('/notifications/settings', data)
  return res.data
}

export async function getWeeklyDigestPreview(): Promise<{
  week_start: string
  today: string
  income: number
  spending: number
  top_categories: [string, number][]
  net_worth: number
  total_assets: number
  total_liabilities: number
  over_budget: [string, number, number][]
}> {
  if (isDemoModeActive()) return { week_start: new Date().toISOString().slice(0, 10), today: new Date().toISOString().slice(0, 10), income: 3250, spending: 1420, top_categories: [['Groceries', 127], ['Dining Out', 58], ['Gas', 52]], net_worth: 94009, total_assets: 96470, total_liabilities: 2460, over_budget: [] }
  const res = await api.get('/notifications/weekly-preview')
  return res.data
}

export async function sendWeeklyDigestNow(email?: string): Promise<{ sent: boolean; to: string }> {
  if (isDemoModeActive()) return { sent: false, to: email ?? 'demo@example.com' }
  const res = await api.post('/notifications/send-weekly', email ? { email } : {})
  return res.data
}

export async function getSnapshotReminderPreview(): Promise<Array<{
  name: string
  account_type: string
  balance: number
  last_updated: string
  days_ago: number
  why: string
  frequency: string
}>> {
  if (isDemoModeActive()) return []
  const res = await api.get('/notifications/snapshot-preview')
  return res.data
}

export async function sendSnapshotReminderNow(email?: string): Promise<{ sent: boolean; to: string; stale_count?: number; reason?: string }> {
  if (isDemoModeActive()) return { sent: false, to: email ?? 'demo@example.com', reason: 'Demo mode' }
  const res = await api.post('/notifications/send-snapshot', email ? { email } : {})
  return res.data
}

// Budget estimates
export async function getBudgetEstimates(): Promise<Array<{
  category_id: number
  category_name: string
  avg_monthly: number
  months_sampled: number
}>> {
  if (isDemoModeActive()) return demo.DEMO_BUDGET.map(b => ({ category_id: b.category_id, category_name: b.category_name, avg_monthly: b.actual_amount, months_sampled: 3 }))
  const res = await api.get('/budget/estimates')
  return res.data
}

// Statement import
export interface ParsedStatement {
  institution: string
  account_type_hint: string
  account_label: string
  statement_date: string | null
  ending_balance: number | null
  account_number_hint: string | null
}

export async function parseStatement(file: File): Promise<ParsedStatement> {
  if (isDemoModeActive()) return { institution: 'Demo Bank', account_type_hint: 'checking', account_label: 'Demo Checking', statement_date: new Date().toISOString().slice(0, 10), ending_balance: 4820.55, account_number_hint: '****1234' }
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/statements/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function createBalanceSnapshot(data: {
  account_id: number
  date: string
  balance: number
  notes?: string
}): Promise<BalanceSnapshot> {
  if (isDemoModeActive()) return { id: 99, account_id: data.account_id, date: data.date, balance: data.balance, notes: data.notes }
  const res: AxiosResponse<BalanceSnapshot> = await api.post('/balance-snapshots', data)
  return res.data
}

// Auto-infer salary from paystubs
export async function inferSalaryFromPaystubs(): Promise<{
  found: number
  avg_net_per_paycheck: number | null
  avg_gross_per_paycheck: number | null
  gross_annual_salary: number | null
  pay_frequency: string | null
  periods_per_year: number
  latest_pay_date: string
}> {
  if (isDemoModeActive()) return { found: 1, avg_net_per_paycheck: 2802, avg_gross_per_paycheck: 3269, gross_annual_salary: 85000, pay_frequency: 'biweekly', periods_per_year: 26, latest_pay_date: new Date().toISOString().slice(0, 10) }
  const res = await api.get('/financial-profile/infer-salary')
  return res.data
}
