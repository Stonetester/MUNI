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
  is_joint: boolean
  joint_user_id?: number
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
  owner?: string
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


export type AlertType = 'budget' | 'event'
export type AlertSeverity = 'critical' | 'warning' | 'info'

export interface AlertItem {
  type: AlertType
  severity: AlertSeverity
  title: string
  message: string
  amount?: number
  due_date?: string
  meta: Record<string, unknown>
}

// Google Sheets sync
export interface SyncConfig {
  id: number
  user_id: number
  sheet_id: string
  is_enabled: boolean
  last_sync_at?: string
  last_sync_status?: string
  last_sync_message?: string
  created_at: string
}

export interface SyncResult {
  imported: number
  skipped: number
  errors: number
  last_sync_at: string
  status: string
  message?: string
}

// Financial Profile
export interface FinancialProfile {
  id: number
  user_id: number
  salary?: number
  pay_frequency?: string
  net_per_paycheck?: number
  employer_401k_percent?: number
  employee_401k_per_paycheck?: number
  hysa_apy?: number
  hysa_monthly_contribution?: number
  ira_monthly_contribution?: number
  hidden_sections?: string
  updated_at?: string
}

// Student Loans
export interface StudentLoan {
  id: number
  user_id: number
  loan_name: string
  servicer?: string
  original_balance: number
  current_balance: number
  interest_rate: number
  minimum_payment: number
  is_active: boolean
  created_at: string
  updated_at?: string
}

// Investment Holdings
export interface InvestmentHolding {
  id: number
  user_id: number
  account_id: number
  ticker?: string
  fund_name: string
  current_value: number
  monthly_contribution: number
  assumed_annual_return: number
  weight_percent?: number
  created_at: string
  updated_at?: string
}

// Compensation Events
export type CompensationEventType = 'raise' | 'bonus' | 'spot_award' | 'stipend' | 'other'

export interface CompensationEvent {
  id: number
  user_id: number
  event_type: CompensationEventType
  effective_date: string
  old_salary?: number
  new_salary?: number
  gross_amount?: number
  net_amount?: number
  description?: string
  notes?: string
  created_at: string
}

// Paystubs — field names match the backend PaystubIn/PaystubOut schema exactly
export interface Paystub {
  id: number
  user_id: number
  employer?: string
  voucher_number?: string
  pay_date?: string
  period_start?: string
  period_end?: string
  gross_pay?: number
  regular_pay?: number
  holiday_pay?: number
  overtime_pay?: number
  salary_per_period?: number
  fed_taxable_income?: number
  employer_401k?: number
  tax_federal?: number
  tax_state?: number       // MD state tax
  tax_county?: number      // MD county (CAL1)
  tax_social_security?: number
  tax_medicare?: number
  tax_total?: number
  deduction_401k?: number
  deduction_dental?: number
  deduction_vision?: number
  deduction_life_insurance?: number
  deduction_ad_and_d?: number
  deduction_std_ltd?: number
  deduction_total?: number
  net_pay?: number
  ytd_gross?: number
  ytd_net?: number
  ytd_401k_employee?: number
  ytd_401k_employer?: number
  ytd_federal_tax?: number
  ytd_state_tax?: number
  ytd_ss?: number
  ytd_medicare?: number
  ytd_taxes_total?: number
  parse_method?: string
  raw_pdf_path?: string
  notes?: string
  created_at: string
}

export interface ParsedPaystub {
  parsed: Partial<Paystub>
  parse_method: string
  raw_text_excerpt?: string
}
