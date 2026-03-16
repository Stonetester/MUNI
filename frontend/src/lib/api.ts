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
  const res: AxiosResponse<BalanceSnapshot> = await api.post('/snapshots', data)
  return res.data
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
export async function getForecast(scenarioId?: number, months?: number): Promise<ForecastResponse> {
  const params = new URLSearchParams()
  if (scenarioId) params.append('scenario_id', String(scenarioId))
  if (months) params.append('months', String(months))
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
