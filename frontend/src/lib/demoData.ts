import type {
  Account,
  Category,
  Transaction,
  RecurringRule,
  BalanceSnapshot,
  LifeEvent,
  Scenario,
  ForecastResponse,
  ForecastPoint,
  DashboardData,
  PaginatedTransactions,
  BudgetSummary,
  AlertItem,
  SyncConfig,
  FinancialProfile,
  StudentLoan,
  InvestmentHolding,
  CompensationEvent,
  Paystub,
  HomeBuyingGoal,
} from './types'

// ── helpers ─────────────────────────────────────────────────────────────────

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function monthsAgo(n: number): string {
  const d = new Date()
  d.setMonth(d.getMonth() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function monthsAgoDate(n: number): string {
  return monthsAgo(n) + '-01'
}

// ── accounts ────────────────────────────────────────────────────────────────

export const DEMO_ACCOUNTS: Account[] = [
  { id: 1, name: 'Chase Checking', account_type: 'checking', institution: 'Chase', balance: 4820.55, is_active: true, forecast_enabled: true, exclude_from_estimate: false, is_joint: false, created_at: '2024-01-15T00:00:00' },
  { id: 2, name: 'Chase Savings', account_type: 'savings', institution: 'Chase', balance: 9200.00, is_active: true, forecast_enabled: true, exclude_from_estimate: false, is_joint: false, created_at: '2024-01-15T00:00:00' },
  { id: 3, name: 'EverBank HYSA', account_type: 'hysa', institution: 'EverBank', balance: 18750.00, is_active: true, forecast_enabled: true, exclude_from_estimate: false, is_joint: true, created_at: '2024-03-01T00:00:00' },
  { id: 4, name: 'Fidelity 401k', account_type: '401k', institution: 'Fidelity', balance: 52400.00, is_active: true, forecast_enabled: true, exclude_from_estimate: false, is_joint: false, created_at: '2024-01-15T00:00:00' },
  { id: 5, name: 'Fidelity Brokerage', account_type: 'brokerage', institution: 'Fidelity', balance: 11300.00, is_active: true, forecast_enabled: true, exclude_from_estimate: false, is_joint: false, created_at: '2024-06-01T00:00:00' },
  { id: 6, name: 'Chase Sapphire', account_type: 'credit_card', institution: 'Chase', balance: -1840.22, is_active: true, forecast_enabled: false, exclude_from_estimate: false, is_joint: false, created_at: '2024-01-15T00:00:00' },
  { id: 7, name: 'Capital One Quicksilver', account_type: 'credit_card', institution: 'Capital One', balance: -620.45, is_active: true, forecast_enabled: false, exclude_from_estimate: false, is_joint: false, created_at: '2024-02-01T00:00:00' },
]

// ── categories ───────────────────────────────────────────────────────────────

export const DEMO_CATEGORIES: Category[] = [
  { id: 1, name: 'Salary', kind: 'income', color: '#22c55e', budget_amount: 0 },
  { id: 2, name: 'Groceries', kind: 'expense', color: '#f97316', budget_amount: 600 },
  { id: 3, name: 'Dining Out', kind: 'expense', color: '#ef4444', budget_amount: 300 },
  { id: 4, name: 'Rent', kind: 'expense', color: '#6366f1', budget_amount: 1850 },
  { id: 5, name: 'Utilities', kind: 'expense', color: '#8b5cf6', budget_amount: 200 },
  { id: 6, name: 'Subscriptions', kind: 'expense', color: '#3b82f6', budget_amount: 100 },
  { id: 7, name: 'Gas', kind: 'expense', color: '#f59e0b', budget_amount: 150 },
  { id: 8, name: 'Entertainment', kind: 'expense', color: '#ec4899', budget_amount: 200 },
  { id: 9, name: 'Health', kind: 'expense', color: '#14b8a6', budget_amount: 100 },
  { id: 10, name: 'Shopping', kind: 'expense', color: '#a855f7', budget_amount: 250 },
  { id: 11, name: 'Savings Transfer', kind: 'savings', color: '#10b981', budget_amount: 0 },
  { id: 12, name: 'Travel', kind: 'expense', color: '#0ea5e9', budget_amount: 200 },
  { id: 13, name: 'Freelance', kind: 'income', color: '#84cc16', budget_amount: 0 },
]

// ── transactions ─────────────────────────────────────────────────────────────

export const DEMO_TRANSACTIONS: Transaction[] = [
  { id: 1, account_id: 1, account_name: 'Chase Checking', category_id: 1, category_name: 'Salary', date: daysAgo(2), amount: 3250.00, description: 'Direct Deposit – Acme Corp', is_verified: true, created_at: daysAgo(2) + 'T00:00:00' },
  { id: 2, account_id: 6, account_name: 'Chase Sapphire', category_id: 2, category_name: 'Groceries', date: daysAgo(3), amount: -127.84, description: 'Whole Foods Market', is_verified: true, created_at: daysAgo(3) + 'T00:00:00' },
  { id: 3, account_id: 6, account_name: 'Chase Sapphire', category_id: 3, category_name: 'Dining Out', date: daysAgo(4), amount: -58.40, description: 'The Local Tap Room', is_verified: true, created_at: daysAgo(4) + 'T00:00:00' },
  { id: 4, account_id: 1, account_name: 'Chase Checking', category_id: 4, category_name: 'Rent', date: daysAgo(5), amount: -1850.00, description: 'Rent – Maple Ridge Apartments', is_verified: true, created_at: daysAgo(5) + 'T00:00:00' },
  { id: 5, account_id: 7, account_name: 'Capital One Quicksilver', category_id: 6, category_name: 'Subscriptions', date: daysAgo(6), amount: -15.99, description: 'Netflix', is_verified: true, created_at: daysAgo(6) + 'T00:00:00' },
  { id: 6, account_id: 7, account_name: 'Capital One Quicksilver', category_id: 7, category_name: 'Gas', date: daysAgo(7), amount: -52.10, description: 'Shell Gas Station', is_verified: true, created_at: daysAgo(7) + 'T00:00:00' },
  { id: 7, account_id: 6, account_name: 'Chase Sapphire', category_id: 8, category_name: 'Entertainment', date: daysAgo(8), amount: -34.00, description: 'Regal Cinemas', is_verified: true, created_at: daysAgo(8) + 'T00:00:00' },
  { id: 8, account_id: 1, account_name: 'Chase Checking', category_id: 11, category_name: 'Savings Transfer', date: daysAgo(9), amount: -500.00, description: 'Transfer to EverBank HYSA', is_verified: true, created_at: daysAgo(9) + 'T00:00:00' },
  { id: 9, account_id: 7, account_name: 'Capital One Quicksilver', category_id: 5, category_name: 'Utilities', date: daysAgo(10), amount: -94.20, description: 'BGE – Electric & Gas', is_verified: true, created_at: daysAgo(10) + 'T00:00:00' },
  { id: 10, account_id: 6, account_name: 'Chase Sapphire', category_id: 2, category_name: 'Groceries', date: daysAgo(11), amount: -89.55, description: 'Trader Joe\'s', is_verified: true, created_at: daysAgo(11) + 'T00:00:00' },
  { id: 11, account_id: 6, account_name: 'Chase Sapphire', category_id: 10, category_name: 'Shopping', date: daysAgo(12), amount: -74.99, description: 'Amazon', is_verified: true, created_at: daysAgo(12) + 'T00:00:00' },
  { id: 12, account_id: 7, account_name: 'Capital One Quicksilver', category_id: 6, category_name: 'Subscriptions', date: daysAgo(13), amount: -13.99, description: 'Spotify', is_verified: true, created_at: daysAgo(13) + 'T00:00:00' },
  { id: 13, account_id: 6, account_name: 'Chase Sapphire', category_id: 3, category_name: 'Dining Out', date: daysAgo(14), amount: -42.60, description: 'Chipotle Mexican Grill', is_verified: true, created_at: daysAgo(14) + 'T00:00:00' },
  { id: 14, account_id: 1, account_name: 'Chase Checking', category_id: 1, category_name: 'Salary', date: daysAgo(16), amount: 3250.00, description: 'Direct Deposit – Acme Corp', is_verified: true, created_at: daysAgo(16) + 'T00:00:00' },
  { id: 15, account_id: 6, account_name: 'Chase Sapphire', category_id: 9, category_name: 'Health', date: daysAgo(17), amount: -30.00, description: 'CVS Pharmacy', is_verified: true, created_at: daysAgo(17) + 'T00:00:00' },
  { id: 16, account_id: 7, account_name: 'Capital One Quicksilver', category_id: 7, category_name: 'Gas', date: daysAgo(18), amount: -48.75, description: 'Costco Gas', is_verified: true, created_at: daysAgo(18) + 'T00:00:00' },
  { id: 17, account_id: 6, account_name: 'Chase Sapphire', category_id: 2, category_name: 'Groceries', date: daysAgo(20), amount: -112.30, description: 'Giant Food', is_verified: true, created_at: daysAgo(20) + 'T00:00:00' },
  { id: 18, account_id: 1, account_name: 'Chase Checking', category_id: 13, category_name: 'Freelance', date: daysAgo(22), amount: 850.00, description: 'Freelance Invoice #42 – Design Work', is_verified: true, created_at: daysAgo(22) + 'T00:00:00' },
  { id: 19, account_id: 6, account_name: 'Chase Sapphire', category_id: 12, category_name: 'Travel', date: daysAgo(25), amount: -189.00, description: 'United Airlines', is_verified: true, created_at: daysAgo(25) + 'T00:00:00' },
  { id: 20, account_id: 6, account_name: 'Chase Sapphire', category_id: 10, category_name: 'Shopping', date: daysAgo(28), amount: -145.00, description: 'Target', is_verified: true, created_at: daysAgo(28) + 'T00:00:00' },
]

export const DEMO_PAGINATED_TRANSACTIONS: PaginatedTransactions = {
  items: DEMO_TRANSACTIONS,
  total: DEMO_TRANSACTIONS.length,
  skip: 0,
  limit: 50,
}

// ── recurring rules ──────────────────────────────────────────────────────────

export const DEMO_RECURRING_RULES: RecurringRule[] = [
  { id: 1, name: 'Rent', amount: -1850.00, frequency: 'monthly', start_date: '2024-01-01', next_date: daysAgo(-5), category_id: 4, category_name: 'Rent', account_id: 1, is_active: true },
  { id: 2, name: 'Salary – Acme Corp', amount: 3250.00, frequency: 'biweekly', start_date: '2024-01-05', next_date: daysAgo(-12), category_id: 1, category_name: 'Salary', account_id: 1, is_active: true },
  { id: 3, name: 'Netflix', amount: -15.99, frequency: 'monthly', start_date: '2024-01-15', next_date: daysAgo(-8), category_id: 6, category_name: 'Subscriptions', account_id: 7, is_active: true },
  { id: 4, name: 'Spotify', amount: -13.99, frequency: 'monthly', start_date: '2024-01-20', next_date: daysAgo(-6), category_id: 6, category_name: 'Subscriptions', account_id: 7, is_active: true },
  { id: 5, name: 'HYSA Transfer', amount: -500.00, frequency: 'monthly', start_date: '2024-01-10', next_date: daysAgo(-3), category_id: 11, category_name: 'Savings Transfer', account_id: 1, is_active: true },
  { id: 6, name: 'BGE Utilities', amount: -95.00, frequency: 'monthly', start_date: '2024-01-18', next_date: daysAgo(-4), category_id: 5, category_name: 'Utilities', account_id: 7, is_active: true },
]

// ── balance snapshots ────────────────────────────────────────────────────────

export const DEMO_SNAPSHOTS: BalanceSnapshot[] = [
  { id: 1, account_id: 3, account_name: 'EverBank HYSA', date: daysAgo(5), balance: 18750.00 },
  { id: 2, account_id: 4, account_name: 'Fidelity 401k', date: daysAgo(5), balance: 52400.00 },
  { id: 3, account_id: 5, account_name: 'Fidelity Brokerage', date: daysAgo(5), balance: 11300.00 },
]

// ── life events ──────────────────────────────────────────────────────────────

export const DEMO_LIFE_EVENTS: LifeEvent[] = [
  {
    id: 1,
    name: 'Wedding',
    event_type: 'wedding',
    start_date: '2026-10-10',
    end_date: '2026-10-12',
    total_cost: 28000,
    description: 'Wedding at Moonlight Farm, Frederick MD',
    is_active: true,
    is_joint: true,
    monthly_breakdown: [
      { month: monthsAgo(2), amount: 2500 },
      { month: monthsAgo(1), amount: 3200 },
      { month: monthsAgo(0), amount: 1800 },
    ],
  },
  {
    id: 2,
    name: 'Home Purchase',
    event_type: 'home_purchase',
    start_date: '2027-06-01',
    total_cost: 45000,
    description: 'Down payment + closing costs for first home',
    is_active: true,
    is_joint: true,
  },
]

// ── scenarios ────────────────────────────────────────────────────────────────

export const DEMO_SCENARIOS: Scenario[] = [
  { id: 0, name: 'Baseline', description: 'Current financial trajectory', is_baseline: true, created_at: '2024-01-01T00:00:00' },
  { id: 1, name: 'Job Change +15%', description: 'Scenario if salary increases 15% mid-year', is_baseline: false, parent_id: 0, created_at: '2024-06-01T00:00:00' },
  { id: 2, name: 'Buy Home 2027', description: 'Impact of home purchase in mid-2027', is_baseline: false, parent_id: 0, created_at: '2024-09-01T00:00:00' },
]

// ── forecast ─────────────────────────────────────────────────────────────────

function buildForecastPoints(): ForecastPoint[] {
  const points: ForecastPoint[] = []
  let cash = 14020.55
  let netWorth = 95430.33
  for (let i = 0; i < 60; i++) {
    const income = 6500 + (Math.random() * 500 - 250)
    const expenses = 4200 + (Math.random() * 400 - 200)
    const net = income - expenses
    cash += net * 0.4
    netWorth += net * 0.8
    points.push({
      month: monthsAgo(-i),
      income: Math.round(income),
      expenses: Math.round(expenses),
      net: Math.round(net),
      cash: Math.round(cash),
      net_worth: Math.round(netWorth),
      savings_total: Math.round(netWorth * 0.45),
      low_cash: Math.round(cash * 0.85),
      high_cash: Math.round(cash * 1.15),
      event_impact: i === 18 ? -28000 : i === 30 ? -45000 : 0,
      by_category: {
        Groceries: Math.round(550 + Math.random() * 100),
        'Dining Out': Math.round(280 + Math.random() * 80),
        Rent: 1850,
        Utilities: Math.round(90 + Math.random() * 30),
        Gas: Math.round(100 + Math.random() * 50),
      },
    })
  }
  return points
}

const FORECAST_POINTS = buildForecastPoints()

export const DEMO_FORECAST: ForecastResponse = {
  months: 60,
  points: FORECAST_POINTS,
  starting_net_worth: 95430,
  ending_net_worth: FORECAST_POINTS[59].net_worth,
  total_income: FORECAST_POINTS.reduce((s, p) => s + p.income, 0),
  total_expenses: FORECAST_POINTS.reduce((s, p) => s + p.expenses, 0),
  account_forecasts: [
    { account_id: 1, account_name: 'Chase Checking', account_type: 'checking', starting_balance: 4820, ending_balance: 6400, monthly_balances: FORECAST_POINTS.map((_, i) => 4820 + i * 30), annual_return_pct: 0, monthly_contribution: 0 },
    { account_id: 3, account_name: 'EverBank HYSA', account_type: 'hysa', starting_balance: 18750, ending_balance: 36200, monthly_balances: FORECAST_POINTS.map((_, i) => 18750 + i * 300), annual_return_pct: 4.75, monthly_contribution: 500 },
    { account_id: 4, account_name: 'Fidelity 401k', account_type: '401k', starting_balance: 52400, ending_balance: 98700, monthly_balances: FORECAST_POINTS.map((_, i) => 52400 + i * 780), annual_return_pct: 7.0, monthly_contribution: 650 },
  ],
}

// ── dashboard ────────────────────────────────────────────────────────────────

export const DEMO_DASHBOARD: DashboardData = {
  total_assets: 96470.55,
  total_liabilities: 2460.67,
  net_worth: 94009.88,
  balances_by_type: [
    { account_type: 'checking', total: 4820.55, accounts: [{ id: 1, name: 'Chase Checking', balance: 4820.55, institution: 'Chase' }] },
    { account_type: 'savings', total: 9200.00, accounts: [{ id: 2, name: 'Chase Savings', balance: 9200.00, institution: 'Chase' }] },
    { account_type: 'hysa', total: 18750.00, accounts: [{ id: 3, name: 'EverBank HYSA', balance: 18750.00, institution: 'EverBank' }] },
    { account_type: '401k', total: 52400.00, accounts: [{ id: 4, name: 'Fidelity 401k', balance: 52400.00, institution: 'Fidelity' }] },
    { account_type: 'brokerage', total: 11300.00, accounts: [{ id: 5, name: 'Fidelity Brokerage', balance: 11300.00, institution: 'Fidelity' }] },
    { account_type: 'credit_card', total: -2460.67, accounts: [
      { id: 6, name: 'Chase Sapphire', balance: -1840.22, institution: 'Chase' },
      { id: 7, name: 'Capital One Quicksilver', balance: -620.45, institution: 'Capital One' },
    ]},
  ],
  this_month: {
    income: 7350.00,
    spending: 3820.42,
    savings: 3529.58,
    by_category: {
      Groceries: 329.69,
      'Dining Out': 101.00,
      Rent: 1850.00,
      Utilities: 94.20,
      Subscriptions: 29.98,
      Gas: 100.85,
      Entertainment: 34.00,
      Shopping: 74.99,
      Health: 30.00,
      'Savings Transfer': 500.00,
    },
  },
  last_month: {
    income: 6500.00,
    spending: 4102.30,
    savings: 2397.70,
    by_category: {
      Groceries: 498.10,
      'Dining Out': 278.45,
      Rent: 1850.00,
      Utilities: 101.50,
      Subscriptions: 29.98,
      Gas: 148.20,
      Entertainment: 95.00,
      Shopping: 234.60,
      Health: 55.00,
      Travel: 189.00,
      'Savings Transfer': 500.00,
    },
  },
  upcoming_events: DEMO_LIFE_EVENTS,
  forecast_preview: FORECAST_POINTS.slice(0, 12),
  flow_months: FORECAST_POINTS.slice(0, 6),
  recent_transactions: DEMO_TRANSACTIONS.slice(0, 8),
}

// ── budget summary ────────────────────────────────────────────────────────────

export const DEMO_BUDGET: BudgetSummary[] = [
  { category_id: 2, category_name: 'Groceries', kind: 'expense', color: '#f97316', budget_amount: 600, actual_amount: 329.69, remaining: 270.31, percentage: 54.9 },
  { category_id: 3, category_name: 'Dining Out', kind: 'expense', color: '#ef4444', budget_amount: 300, actual_amount: 101.00, remaining: 199.00, percentage: 33.7 },
  { category_id: 4, category_name: 'Rent', kind: 'expense', color: '#6366f1', budget_amount: 1850, actual_amount: 1850.00, remaining: 0, percentage: 100 },
  { category_id: 5, category_name: 'Utilities', kind: 'expense', color: '#8b5cf6', budget_amount: 200, actual_amount: 94.20, remaining: 105.80, percentage: 47.1 },
  { category_id: 6, category_name: 'Subscriptions', kind: 'expense', color: '#3b82f6', budget_amount: 100, actual_amount: 29.98, remaining: 70.02, percentage: 30.0 },
  { category_id: 7, category_name: 'Gas', kind: 'expense', color: '#f59e0b', budget_amount: 150, actual_amount: 100.85, remaining: 49.15, percentage: 67.2 },
  { category_id: 8, category_name: 'Entertainment', kind: 'expense', color: '#ec4899', budget_amount: 200, actual_amount: 34.00, remaining: 166.00, percentage: 17.0 },
  { category_id: 10, category_name: 'Shopping', kind: 'expense', color: '#a855f7', budget_amount: 250, actual_amount: 219.99, remaining: 30.01, percentage: 88.0 },
  { category_id: 9, category_name: 'Health', kind: 'expense', color: '#14b8a6', budget_amount: 100, actual_amount: 30.00, remaining: 70.00, percentage: 30.0 },
]

// ── alerts ───────────────────────────────────────────────────────────────────

export const DEMO_ALERTS: AlertItem[] = [
  { type: 'budget', severity: 'warning', title: 'Shopping near budget', message: 'Shopping is at 88% of monthly budget ($219.99 / $250)', amount: 30.01, meta: { category: 'Shopping' } },
  { type: 'event', severity: 'info', title: 'Wedding payment due', message: 'Wedding venue deposit of $2,500 due in 12 days', amount: 2500, due_date: daysAgo(-12), meta: { event: 'Wedding' } },
  { type: 'budget', severity: 'info', title: 'Rent paid', message: 'Rent recorded for this month — 100% of budget used', amount: 0, meta: { category: 'Rent' } },
]

// ── sync config ───────────────────────────────────────────────────────────────

export const DEMO_SYNC_CONFIG: SyncConfig = {
  id: 1,
  user_id: 1,
  sheet_id: '1BxiMVs0XRA5nFMdKvBdBZjgm_demo_example',
  is_enabled: true,
  last_sync_at: daysAgo(1) + 'T08:30:00',
  last_sync_status: 'ok',
  last_sync_message: '18 rows imported',
  created_at: '2024-01-15T00:00:00',
}

// ── financial profile ─────────────────────────────────────────────────────────

export const DEMO_FINANCIAL_PROFILE: FinancialProfile = {
  id: 1,
  user_id: 1,
  gross_annual_salary: 85000,
  pay_frequency: 'biweekly',
  net_per_paycheck: 2800,
  employer_401k_percent: 4,
  employee_401k_per_paycheck: 325,
  hysa_apy: 4.75,
  hysa_monthly_contribution: 500,
  ira_monthly_contribution: 583,
  updated_at: daysAgo(10) + 'T00:00:00',
}

// ── student loans ─────────────────────────────────────────────────────────────

export const DEMO_STUDENT_LOANS: StudentLoan[] = [
  { id: 1, user_id: 1, loan_name: 'Federal Direct Loan', servicer: 'MOHELA', original_balance: 32000, current_balance: 18420.55, interest_rate: 5.05, minimum_payment: 285, is_active: true, created_at: '2024-01-01T00:00:00' },
  { id: 2, user_id: 1, loan_name: 'Graduate Plus Loan', servicer: 'MOHELA', original_balance: 15000, current_balance: 6840.00, interest_rate: 6.54, minimum_payment: 120, is_active: true, created_at: '2024-01-01T00:00:00' },
]

// ── investment holdings ───────────────────────────────────────────────────────

export const DEMO_HOLDINGS: InvestmentHolding[] = [
  { id: 1, user_id: 1, account_id: 4, ticker: 'FXAIX', fund_name: 'Fidelity 500 Index Fund', current_value: 38400, monthly_contribution: 650, assumed_annual_return: 7.0, weight_percent: 73, created_at: '2024-01-01T00:00:00' },
  { id: 2, user_id: 1, account_id: 4, ticker: 'FSKAX', fund_name: 'Fidelity Total Market Index', current_value: 14000, monthly_contribution: 0, assumed_annual_return: 7.2, weight_percent: 27, created_at: '2024-01-01T00:00:00' },
  { id: 3, user_id: 1, account_id: 5, ticker: 'VTI', fund_name: 'Vanguard Total Stock Market ETF', current_value: 11300, monthly_contribution: 200, assumed_annual_return: 8.0, weight_percent: 100, created_at: '2024-06-01T00:00:00' },
]

// ── compensation events ────────────────────────────────────────────────────────

export const DEMO_COMPENSATION_EVENTS: CompensationEvent[] = [
  { id: 1, user_id: 1, event_type: 'raise', effective_date: '2025-01-01', old_salary: 78000, new_salary: 85000, description: 'Annual performance raise', created_at: '2024-12-15T00:00:00' },
  { id: 2, user_id: 1, event_type: 'bonus', effective_date: '2024-12-20', gross_amount: 4200, net_amount: 2940, description: 'Year-end performance bonus', created_at: '2024-12-20T00:00:00' },
]

// ── paystubs ──────────────────────────────────────────────────────────────────

export const DEMO_PAYSTUBS: Paystub[] = [
  {
    id: 1,
    user_id: 1,
    employer: 'Acme Corp',
    pay_date: daysAgo(2),
    period_start: daysAgo(16),
    period_end: daysAgo(3),
    pay_type: 'regular',
    gross_pay: 3269.23,
    regular_pay: 3269.23,
    net_pay: 2802.10,
    tax_federal: 285.50,
    tax_state: 98.00,
    tax_county: 45.20,
    tax_social_security: 202.69,
    tax_medicare: 47.40,
    tax_total: 678.79,
    deduction_401k: 326.92,
    deduction_dental: 8.50,
    deduction_vision: 3.20,
    deduction_life_insurance: 12.00,
    deduction_total: 350.62,
    ytd_gross: 42500.00,
    ytd_net: 36427.30,
    created_at: daysAgo(2) + 'T00:00:00',
  },
]

// ── home buying goal ──────────────────────────────────────────────────────────

export const DEMO_HOME_BUYING_GOAL: HomeBuyingGoal = {
  id: 1,
  name: 'Frederick County Home',
  is_active: true,
  target_price_min: 380000,
  target_price_max: 450000,
  target_date: '2027-06-01',
  down_payment_target: 45000,
  current_savings: 18750,
  monthly_savings_contribution: 700,
  mortgage_structure: 'both',
  keaton_income: 85000,
  katherine_income: 72000,
  notes: 'Targeting Frederick County MD. Exploring MMP down payment assistance.',
}

// ── joint summary ──────────────────────────────────────────────────────────────

export const DEMO_JOINT_SUMMARY = {
  net_worth: 152800,
  total_assets: 158200,
  total_liabilities: 5400,
  this_month_income: 12800,
  this_month_spending: 6940,
}
