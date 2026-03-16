export type AccountType = 'checking' | 'savings' | 'hysa' | 'brokerage' | 'ira' | '401k' | 'hsa' | 'credit_card' | 'student_loan' | 'car_loan' | 'mortgage' | 'paycheck' | 'other'

export interface Account {
  id: number
  name: string
  account_type: AccountType
  institution?: string
  balance: number
  is_active: boolean
  forecast_enabled: boolean
  notes?: string
  created_at: string
}

export type CategoryKind = 'income' | 'expense' | 'transfer' | 'savings'

export interface Category {
  id: number
  name: string
  parent_id?: number
  parent_name?: string
  kind: CategoryKind
  color: string
  budget_amount?: number
  budget_period?: string
}

export interface Transaction {
  id: number
  account_id?: number
  account_name?: string
  category_id?: number
  category_name?: string
  date: string
  amount: number
  description: string
  merchant?: string
  notes?: string
  payment_method?: string
  is_verified: boolean
  scenario_id?: number
  created_at: string
}

export type Frequency = 'weekly' | 'biweekly' | 'monthly' | 'bimonthly' | 'quarterly' | 'annual' | 'one_time'

export interface RecurringRule {
  id: number
  account_id?: number
  category_id?: number
  category_name?: string
  name: string
  amount: number
  frequency: Frequency
  start_date: string
  end_date?: string
  next_date?: string
  description?: string
  is_active: boolean
  scenario_id?: number
}

export interface BalanceSnapshot {
  id: number
  account_id: number
  account_name?: string
  date: string
  balance: number
  notes?: string
}

export type EventType = 'wedding' | 'marriage' | 'move' | 'new_job' | 'baby' | 'home_purchase' | 'vacation' | 'loan_payoff' | 'other'

export interface LifeEvent {
  id: number
  name: string
  event_type: EventType
  start_date: string
  end_date?: string
  total_cost: number
  description?: string
  is_active: boolean
  scenario_id?: number
  monthly_breakdown?: Array<{month: string, amount: number}>
}

export interface Scenario {
  id: number
  name: string
  description?: string
  is_baseline: boolean
  parent_id?: number
  created_at: string
}

// Matches backend ForecastPoint schema exactly
export interface ForecastPoint {
  month: string          // "YYYY-MM"
  income: number
  expenses: number       // backend uses "expenses" not "spending"
  net: number
  cash: number           // backend uses "cash" not "net_cash"
  net_worth: number
  savings_total: number
  low_cash: number
  high_cash: number
  event_impact: number
  by_category?: Record<string, number>
}

// Matches backend ForecastResponse schema exactly
export interface ForecastResponse {
  scenario_id?: number
  months: number
  points: ForecastPoint[]
  starting_net_worth: number
  ending_net_worth: number
  total_income: number
  total_expenses: number
}

export interface AccountBalanceSummary {
  account_type: string
  total: number
  accounts: Array<{id: number, name: string, balance: number, institution?: string}>
}

export interface MonthSummary {
  income: number
  spending: number
  savings: number
  by_category: Record<string, number>
}

// Matches backend DashboardResponse schema exactly
export interface DashboardData {
  total_assets: number
  total_liabilities: number
  net_worth: number
  balances_by_type: AccountBalanceSummary[]  // backend uses this, not "balances"
  this_month: MonthSummary
  last_month: MonthSummary
  upcoming_events: LifeEvent[]
  forecast_preview: ForecastPoint[]
  recent_transactions: Transaction[]
}

export interface TransactionFilters {
  from_date?: string
  to_date?: string
  account_id?: number
  category_id?: number
  search?: string
  payment_method?: string
  limit?: number
  offset?: number
}

// Backend uses skip/limit pagination
export interface PaginatedTransactions {
  items: Transaction[]
  total: number
  skip: number
  limit: number
}

export interface BudgetSummary {
  category_id: number
  category_name: string
  kind: CategoryKind
  color: string
  budget_amount: number
  actual_amount: number
  remaining: number
  percentage: number
}
