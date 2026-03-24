import axios, { AxiosInstance, AxiosResponse } from 'axios'
import { getToken, logout } from './auth'
import type {
  Account,
  Category,
  Transaction,
  RecurringRule,
  BalanceSnapshot,
  LifeEvent,
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
  const res: AxiosResponse<DashboardData> = await api.get('/dashboard')
  return res.data
}

// Accounts
export async function getAccounts(): Promise<Account[]> {
  const res: AxiosResponse<Account[]> = await api.get('/accounts')
  return res.data
}

export async function createAccount(data: Partial<Account>): Promise<Account> {
  const res: AxiosResponse<Account> = await api.post('/accounts', data)
  return res.data
}

export async function updateAccount(id: number, data: Partial<Account>): Promise<Account> {
  const res: AxiosResponse<Account> = await api.put(`/accounts/${id}`, data)
  return res.data
}

export async function deleteAccount(id: number): Promise<void> {
  await api.delete(`/accounts/${id}`)
}

export async function getAccountSnapshots(accountId: number): Promise<BalanceSnapshot[]> {
  const res: AxiosResponse<BalanceSnapshot[]> = await api.get(`/balance-snapshots?account_id=${accountId}`)
  return res.data
}

export async function createSnapshot(data: Partial<BalanceSnapshot>): Promise<BalanceSnapshot> {
  const res: AxiosResponse<BalanceSnapshot> = await api.post('/balance-snapshots', data)
  return res.data
}

export async function deleteSnapshot(id: number): Promise<void> {
  await api.delete(`/balance-snapshots/${id}`)
}

// Categories
export async function getCategories(): Promise<Category[]> {
  const res: AxiosResponse<Category[]> = await api.get('/categories')
  return res.data
}

export async function createCategory(data: Partial<Category>): Promise<Category> {
  const res: AxiosResponse<Category> = await api.post('/categories', data)
  return res.data
}

export async function updateCategory(id: number, data: Partial<Category>): Promise<Category> {
  const res: AxiosResponse<Category> = await api.put(`/categories/${id}`, data)
  return res.data
}

export async function deleteCategory(id: number): Promise<void> {
  await api.delete(`/categories/${id}`)
}

// Transactions
export async function getTransactions(filters?: TransactionFilters): Promise<PaginatedTransactions> {
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
  const res: AxiosResponse<Transaction> = await api.post('/transactions', data)
  return res.data
}

export async function updateTransaction(id: number, data: Partial<Transaction>): Promise<Transaction> {
  const res: AxiosResponse<Transaction> = await api.put(`/transactions/${id}`, data)
  return res.data
}

export async function deleteTransaction(id: number): Promise<void> {
  await api.delete(`/transactions/${id}`)
}

export async function deleteSheetsTransactions(): Promise<{ deleted: number }> {
  const res = await api.delete('/transactions/bulk/sheets')
  return res.data
}

export async function deleteAllTransactions(): Promise<{ deleted: number }> {
  const res = await api.delete('/transactions/bulk/all')
  return res.data
}

export async function importTransactions(file: File): Promise<{ imported: number; errors: string[] }> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/transactions/import', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

// Recurring Rules
export async function getRecurringRules(scenarioId?: number): Promise<RecurringRule[]> {
  const params = scenarioId ? `?scenario_id=${scenarioId}` : ''
  const res: AxiosResponse<RecurringRule[]> = await api.get(`/recurring${params}`)
  return res.data
}

export async function createRecurringRule(data: Partial<RecurringRule>): Promise<RecurringRule> {
  const res: AxiosResponse<RecurringRule> = await api.post('/recurring', data)
  return res.data
}

export async function updateRecurringRule(id: number, data: Partial<RecurringRule>): Promise<RecurringRule> {
  const res: AxiosResponse<RecurringRule> = await api.put(`/recurring/${id}`, data)
  return res.data
}

export async function deleteRecurringRule(id: number): Promise<void> {
  await api.delete(`/recurring/${id}`)
}

// Life Events
export async function getLifeEvents(scenarioId?: number): Promise<LifeEvent[]> {
  const params = scenarioId ? `?scenario_id=${scenarioId}` : ''
  const res: AxiosResponse<LifeEvent[]> = await api.get(`/events${params}`)
  return res.data
}

export async function createLifeEvent(data: Partial<LifeEvent>): Promise<LifeEvent> {
  const res: AxiosResponse<LifeEvent> = await api.post('/events', data)
  return res.data
}

export async function updateLifeEvent(id: number, data: Partial<LifeEvent>): Promise<LifeEvent> {
  const res: AxiosResponse<LifeEvent> = await api.put(`/events/${id}`, data)
  return res.data
}

export async function deleteLifeEvent(id: number): Promise<void> {
  await api.delete(`/events/${id}`)
}

export async function deleteAllLifeEvents(): Promise<void> {
  await api.delete('/events')
}

// Scenarios
export async function getScenarios(): Promise<Scenario[]> {
  const res: AxiosResponse<Scenario[]> = await api.get('/scenarios')
  return res.data
}

export async function createScenario(data: Partial<Scenario>): Promise<Scenario> {
  const res: AxiosResponse<Scenario> = await api.post('/scenarios', data)
  return res.data
}

export async function updateScenario(id: number, data: Partial<Scenario>): Promise<Scenario> {
  const res: AxiosResponse<Scenario> = await api.put(`/scenarios/${id}`, data)
  return res.data
}

export async function deleteScenario(id: number): Promise<void> {
  await api.delete(`/scenarios/${id}`)
}

export async function cloneScenario(id: number, name: string): Promise<Scenario> {
  const res: AxiosResponse<Scenario> = await api.post(`/scenarios/${id}/clone`, { name })
  return res.data
}

// Forecast
export async function getForecast(scenarioId?: number, months?: number, pastMonths?: number): Promise<ForecastResponse> {
  const params = new URLSearchParams()
  if (scenarioId) params.append('scenario_id', String(scenarioId))
  if (months) params.append('months', String(months))
  if (pastMonths) params.append('past_months', String(pastMonths))
  const res: AxiosResponse<ForecastResponse> = await api.get(`/forecast?${params.toString()}`)
  return res.data
}

// Auth
export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  await api.post('/auth/change-password', { current_password: currentPassword, new_password: newPassword })
}

// Budget
export async function getBudgetSummary(month?: string): Promise<BudgetSummary[]> {
  const params = month ? `?month=${month}` : ''
  const res: AxiosResponse<BudgetSummary[]> = await api.get(`/budget/summary${params}`)
  return res.data
}


// Alerts
export async function getAlerts(month?: string, lookaheadDays = 30): Promise<AlertItem[]> {
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
  const res = await api.get('/recurring/suggestions')
  return res.data
}

// Google Sheets Sync
export async function getSyncConfig(): Promise<SyncConfig> {
  const res: AxiosResponse<SyncConfig> = await api.get('/sync/google-sheets/config')
  return res.data
}

export async function updateSyncConfig(data: { sheet_id?: string; is_enabled?: boolean }): Promise<SyncConfig> {
  const res: AxiosResponse<SyncConfig> = await api.put('/sync/google-sheets/config', data)
  return res.data
}

export async function runSync(): Promise<SyncResult> {
  const res: AxiosResponse<SyncResult> = await api.post('/sync/google-sheets/run')
  return res.data
}

// Financial Profile
export async function getFinancialProfile(): Promise<FinancialProfile> {
  const res: AxiosResponse<FinancialProfile> = await api.get('/financial-profile')
  return res.data
}

export async function updateFinancialProfile(data: Partial<FinancialProfile>): Promise<FinancialProfile> {
  const res: AxiosResponse<FinancialProfile> = await api.put('/financial-profile', data)
  return res.data
}

// Student Loans
export async function getStudentLoans(): Promise<StudentLoan[]> {
  const res: AxiosResponse<StudentLoan[]> = await api.get('/financial-profile/loans')
  return res.data
}

export async function createStudentLoan(data: Partial<StudentLoan>): Promise<StudentLoan> {
  const res: AxiosResponse<StudentLoan> = await api.post('/financial-profile/loans', data)
  return res.data
}

export async function updateStudentLoan(id: number, data: Partial<StudentLoan>): Promise<StudentLoan> {
  const res: AxiosResponse<StudentLoan> = await api.put(`/financial-profile/loans/${id}`, data)
  return res.data
}

export async function deleteStudentLoan(id: number): Promise<void> {
  await api.delete(`/financial-profile/loans/${id}`)
}

// Investment Holdings
export async function getHoldings(): Promise<InvestmentHolding[]> {
  const res: AxiosResponse<InvestmentHolding[]> = await api.get('/financial-profile/holdings')
  return res.data
}

export async function createHolding(data: Partial<InvestmentHolding>): Promise<InvestmentHolding> {
  const res: AxiosResponse<InvestmentHolding> = await api.post('/financial-profile/holdings', data)
  return res.data
}

export async function updateHolding(id: number, data: Partial<InvestmentHolding>): Promise<InvestmentHolding> {
  const res: AxiosResponse<InvestmentHolding> = await api.put(`/financial-profile/holdings/${id}`, data)
  return res.data
}

export async function deleteHolding(id: number): Promise<void> {
  await api.delete(`/financial-profile/holdings/${id}`)
}

// Compensation Events
export async function getCompensationEvents(): Promise<CompensationEvent[]> {
  const res: AxiosResponse<CompensationEvent[]> = await api.get('/financial-profile/compensation')
  return res.data
}

export async function createCompensationEvent(data: Partial<CompensationEvent>): Promise<CompensationEvent> {
  const res: AxiosResponse<CompensationEvent> = await api.post('/financial-profile/compensation', data)
  return res.data
}

export async function updateCompensationEvent(id: number, data: Partial<CompensationEvent>): Promise<CompensationEvent> {
  const res: AxiosResponse<CompensationEvent> = await api.put(`/financial-profile/compensation/${id}`, data)
  return res.data
}

export async function deleteCompensationEvent(id: number): Promise<void> {
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
  const res = await api.get('/joint/accounts')
  return res.data
}

export async function getJointTransactions(limit = 50, offset = 0): Promise<PaginatedTransactions> {
  const res = await api.get(`/joint/transactions?limit=${limit}&offset=${offset}`)
  return res.data as PaginatedTransactions
}

// Paystubs
export async function parsePaystub(file: File): Promise<ParsedPaystub> {
  const formData = new FormData()
  formData.append('file', file)
  const res = await api.post('/paystubs/parse', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
  return res.data
}

export async function savePaystub(data: Partial<Paystub>): Promise<Paystub> {
  const res: AxiosResponse<Paystub> = await api.post('/paystubs', data)
  return res.data
}

export async function getPaystubs(): Promise<Paystub[]> {
  const res: AxiosResponse<Paystub[]> = await api.get('/paystubs')
  return res.data
}

export async function updatePaystub(id: number, data: Partial<Paystub>): Promise<Paystub> {
  const res: AxiosResponse<Paystub> = await api.put(`/paystubs/${id}`, data)
  return res.data
}

export async function deletePaystub(id: number): Promise<void> {
  await api.delete(`/paystubs/${id}`)
}

export async function deleteAllPaystubs(): Promise<void> {
  await api.delete('/paystubs')
}

// Home Buying
export async function getHomeBuyingGoal(): Promise<HomeBuyingGoal> {
  const res: AxiosResponse<HomeBuyingGoal> = await api.get('/home-buying/goal')
  return res.data
}

export async function getHomeBuyingGoals(): Promise<HomeBuyingGoal[]> {
  const res: AxiosResponse<HomeBuyingGoal[]> = await api.get('/home-buying/goals')
  return res.data
}

export async function updateHomeBuyingGoal(data: HomeBuyingGoal): Promise<HomeBuyingGoal> {
  const res: AxiosResponse<HomeBuyingGoal> = await api.put('/home-buying/goal', data)
  return res.data
}

export async function createHomeBuyingGoal(data: Omit<HomeBuyingGoal, 'id'>): Promise<HomeBuyingGoal> {
  const res: AxiosResponse<HomeBuyingGoal> = await api.post('/home-buying/goals', data)
  return res.data
}

export async function updateHomeBuyingGoalById(id: number, data: HomeBuyingGoal): Promise<HomeBuyingGoal> {
  const res: AxiosResponse<HomeBuyingGoal> = await api.put(`/home-buying/goals/${id}`, data)
  return res.data
}

export async function activateHomeBuyingGoal(id: number): Promise<HomeBuyingGoal> {
  const res: AxiosResponse<HomeBuyingGoal> = await api.post(`/home-buying/goals/${id}/activate`)
  return res.data
}

export async function deleteHomeBuyingGoal(id: number): Promise<void> {
  await api.delete(`/home-buying/goals/${id}`)
}

// AI Monthly Report
export async function getAiReport(year?: number, month?: number): Promise<{ year: number; month: number; report: string }> {
  const params = new URLSearchParams()
  if (year) params.append('year', String(year))
  if (month) params.append('month', String(month))
  const query = params.toString()
  const res = await api.get(`/ai-report${query ? '?' + query : ''}`)
  return res.data
}

// Notifications
export async function getNotificationSettings(): Promise<{ notification_email: string | null; weekly_digest_enabled: boolean }> {
  const res = await api.get('/notifications/settings')
  return res.data
}

export async function updateNotificationSettings(data: { notification_email?: string; weekly_digest_enabled?: boolean }): Promise<{ notification_email: string | null; weekly_digest_enabled: boolean }> {
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
  const res = await api.get('/notifications/weekly-preview')
  return res.data
}

export async function sendWeeklyDigestNow(email?: string): Promise<{ sent: boolean; to: string }> {
  const res = await api.post('/notifications/send-weekly', email ? { email } : {})
  return res.data
}
