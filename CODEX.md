# FinanceTrack – Codex Continuation Handoff

This document gives Codex (or any AI coding assistant) the full context to continue development.

---

## 1. What This Is

A personal finance forecasting web app for **Keaton Dick** and his fiancée/wife **Katherine**. Built as a self-hosted full-stack app with no paid APIs required.

**Stack:**
- Backend: Python FastAPI + SQLAlchemy + SQLite (default) or PostgreSQL + Alembic migrations
- Frontend: Next.js 14 (App Router) + TypeScript + Tailwind CSS (dark theme) + Recharts
- Auth: JWT (30-day tokens), two users: `keaton` / `katherine`
- No Docker required for local use (SQLite file at `backend/finance.db`)

---

## 2. Current Build State

**All TypeScript compiles cleanly. All 9 pages build.** Backend API tested and returning real data.

**What works:**
- ✅ Login page (`keaton` / `finance123`, `katherine` / `finance123`)
- ✅ Dashboard: net worth, monthly flow, accounts grid, spending chart, forecast preview, recent transactions
- ✅ Transactions: paginated list, import CSV/XLSX, add/edit/delete, filters
- ✅ Accounts: CRUD, balance history
- ✅ Budget: categories, recurring rules, spending vs budget
- ✅ Forecast: 60-month net worth + cash flow charts, category table, scenario selector
- ✅ Life Events: wedding + honeymoon pre-loaded, CRUD for new events
- ✅ What-If Scenarios: clone baseline, compare two scenarios side-by-side
- ✅ Seed data: 1,797 real transactions (Jul 2024 – Mar 2026), all accounts, recurring rules, wedding event

**Known issues / not yet done:**
- Forecast `month` field is `null` in first point — backend forecasting.py `generate_forecast()` month calculation may have a bug
- Budget page: categories don't have `budget_amount` set — user needs to manually set budgets per category
- Transaction import: only tested with Keaton's spreadsheet format; generic bank CSV needs testing
- No password change UI in settings (settings page doesn't exist yet)
- Account balance snapshots endpoint: frontend calls `/accounts/{id}/snapshots` but backend has `/balance-snapshots?account_id=`

---

## 3. Project File Structure

```
C:/Users/keato/financeTool/
├── CODEX.md                    ← this file
├── README.md                   ← user-facing setup instructions
├── start.bat                   ← Windows one-click start
├── docker-compose.yml          ← optional Docker deployment
├── .env.example
├── seed_transactions.json      ← 1,797 transactions extracted from Keaton's xlsx
│
├── backend/
│   ├── finance.db              ← SQLite database (created on first run)
│   ├── requirements.txt
│   ├── alembic.ini
│   ├── alembic/env.py
│   ├── alembic/versions/001_initial_schema.py
│   ├── app/
│   │   ├── main.py             ← FastAPI app, CORS, router registration
│   │   ├── config.py           ← pydantic-settings, env vars
│   │   ├── database.py         ← SQLAlchemy engine, Base, get_db
│   │   ├── auth.py             ← JWT, bcrypt, get_current_user
│   │   ├── models/             ← SQLAlchemy ORM models
│   │   │   ├── user.py
│   │   │   ├── account.py      ← account_type enum: checking/savings/hysa/brokerage/ira/401k/hsa/credit_card/student_loan/car_loan/mortgage/paycheck/other
│   │   │   ├── transaction.py  ← amount negative=expense, positive=income; scenario_id=null means baseline
│   │   │   ├── category.py     ← kind: income/expense/transfer/savings; self-referential parent_id
│   │   │   ├── recurring_rule.py ← frequency: weekly/biweekly/monthly/bimonthly/quarterly/annual/one_time
│   │   │   ├── balance_snapshot.py
│   │   │   ├── life_event.py   ← monthly_breakdown stored as JSON column (list of {month, amount})
│   │   │   └── scenario.py     ← is_baseline flag; parent_id for what-if clones
│   │   ├── schemas/            ← Pydantic v2 schemas (note: ForecastPoint uses "month" not "period", "expenses" not "spending")
│   │   ├── routers/
│   │   │   ├── auth.py         ← POST /api/v1/auth/login (OAuth2 form), GET /api/v1/auth/me, POST /register
│   │   │   ├── accounts.py     ← GET/POST/PUT/DELETE /api/v1/accounts/{id}
│   │   │   ├── transactions.py ← GET with pagination (skip/limit), POST /import (multipart), GET /export
│   │   │   ├── categories.py
│   │   │   ├── recurring.py
│   │   │   ├── balance_snapshots.py ← GET /api/v1/balance-snapshots?account_id=
│   │   │   ├── life_events.py
│   │   │   ├── scenarios.py    ← includes /{id}/clone and /compare
│   │   │   ├── forecast.py     ← GET /api/v1/forecast?months=60&scenario_id=
│   │   │   ├── budget.py       ← GET /api/v1/budget/summary?month=YYYY-MM
│   │   │   ├── dashboard.py    ← GET /api/v1/dashboard
│   │   │   └── import_data.py
│   │   └── services/
│   │       ├── forecasting.py  ← main forecast engine
│   │       └── import_service.py ← CSV/XLSX import with auto-detect
│   └── seed/
│       └── seed_data.py        ← creates users, accounts, categories, rules, events, imports transactions
│
└── frontend/
    ├── package.json            ← Next.js 14, Recharts, Axios, Lucide, date-fns
    ├── tailwind.config.ts      ← dark theme colors: background #0f1117, surface #1a1f2e, primary #10B981
    ├── tsconfig.json
    └── src/
        ├── app/
        │   ├── layout.tsx      ← root layout, dark bg
        │   ├── page.tsx        ← redirects to /dashboard
        │   ├── login/page.tsx
        │   ├── dashboard/page.tsx
        │   ├── transactions/page.tsx ← pagination uses offset/limit not page/per_page
        │   ├── accounts/page.tsx
        │   ├── budget/page.tsx
        │   ├── forecast/page.tsx
        │   ├── events/page.tsx
        │   └── scenarios/page.tsx
        ├── components/
        │   ├── layout/AppLayout.tsx    ← auth guard, sidebar + mobile nav
        │   ├── layout/Sidebar.tsx
        │   ├── layout/MobileNavBar.tsx
        │   ├── dashboard/              ← 7 dashboard components
        │   ├── transactions/           ← TransactionList, TransactionFilters, TransactionForm, ImportModal
        │   ├── accounts/               ← AccountCard, AccountForm
        │   ├── forecast/               ← ForecastChart, NetWorthForecastChart, CategoryForecastTable
        │   ├── events/                 ← EventCard, EventForm
        │   ├── scenarios/              ← ScenarioSelector, ScenarioComparison
        │   └── ui/                     ← Card, Button, Input, Select, Modal, Badge, LoadingSpinner
        └── lib/
            ├── api.ts          ← all API calls; base URL from NEXT_PUBLIC_API_URL
            ├── auth.ts         ← token stored in localStorage as 'finance_token'
            ├── types.ts        ← IMPORTANT: ForecastPoint uses {month, expenses, cash, by_category, low_cash, high_cash}
            └── utils.ts        ← formatCurrency, formatMonth, isLiability, accountTypeLabel, cn
```

---

## 4. Critical Schema Notes

These mismatches were fixed between backend and frontend. **Do not revert:**

| Field | Backend name | Frontend types.ts name |
|-------|-------------|----------------------|
| Forecast month | `month` | `month` ✅ |
| Forecast spending | `expenses` | `expenses` ✅ |
| Forecast cash | `cash` | `cash` ✅ |
| Forecast low band | `low_cash` | `low_cash` ✅ |
| Forecast high band | `high_cash` | `high_cash` ✅ |
| Forecast categories | `by_category` | `by_category` ✅ |
| Dashboard accounts | `balances_by_type[]` | `balances_by_type[]` ✅ |
| Pagination | `skip`/`limit` | `offset`/`limit` ✅ |
| ForecastResponse summary | no `.summary` field | accesses top-level fields ✅ |

**DashboardData `balances_by_type` structure:**
```typescript
{ account_type: string, total: number, accounts: [{id, name, balance, institution?}][] }
```
AccountsGrid flattens this via `data.balances_by_type.flatMap(g => g.accounts.map(a => ({...a, type: g.account_type})))`.

---

## 5. API Endpoints (Full List)

Base: `http://localhost:8000/api/v1`

```
Auth:
  POST  /auth/login           form: username, password → {access_token, token_type}
  GET   /auth/me              → {id, username, display_name, email}
  POST  /auth/register

Accounts:
  GET   /accounts             → Account[]
  POST  /accounts             → Account
  PUT   /accounts/{id}
  DELETE /accounts/{id}

Categories:
  GET   /categories           → Category[]  (all kinds)
  POST  /categories
  PUT   /categories/{id}
  DELETE /categories/{id}

Transactions:
  GET   /transactions?from_date=&to_date=&account_id=&category_id=&search=&limit=50&offset=0&scenario_id=
                              → {items: Transaction[], total: int, skip: int, limit: int}
  POST  /transactions
  PUT   /transactions/{id}
  DELETE /transactions/{id}
  POST  /transactions/import  multipart: file (CSV or XLSX) → {imported, duplicates, errors}
  GET   /transactions/export  → CSV download

Recurring Rules:
  GET   /recurring?scenario_id= → RecurringRule[]
  POST  /recurring
  PUT   /recurring/{id}
  DELETE /recurring/{id}

Balance Snapshots:
  GET   /balance-snapshots?account_id=&from_date=&to_date= → BalanceSnapshot[]
  POST  /balance-snapshots
  DELETE /balance-snapshots/{id}

Life Events:
  GET   /events → LifeEvent[]
  POST  /events
  PUT   /events/{id}
  DELETE /events/{id}

Scenarios:
  GET   /scenarios → Scenario[]
  POST  /scenarios
  PUT   /scenarios/{id}
  DELETE /scenarios/{id}
  POST  /scenarios/{id}/clone → Scenario
  GET   /scenarios/compare?baseline_id=&scenario_id= → comparison

Forecast:
  GET   /forecast?months=60&scenario_id= → ForecastResponse

Budget:
  GET   /budget/summary?month=YYYY-MM → BudgetSummary[]

Dashboard:
  GET   /dashboard → DashboardData
```

---

## 6. How to Run (No Docker)

```bash
# Terminal 1 — Backend
cd C:/Users/keato/financeTool/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
alembic upgrade head
python seed/seed_data.py
uvicorn app.main:app --reload --port 8000
```

```bash
# Terminal 2 — Frontend
cd C:/Users/keato/financeTool/frontend
npm install
npm run dev
```

Open http://localhost:3000 — login as `keaton` / `finance123`

---

## 7. Known Bugs / Fixes Applied

### Bug 1: Forecast `month` field — RESOLVED
Code in `forecasting.py` already generates `month_str = ms.strftime("%Y-%m")` correctly. No fix needed.

### Bug 2: Account snapshots endpoint — FIXED
`frontend/src/lib/api.ts` `getAccountSnapshots()` updated to call `/balance-snapshots?account_id=${accountId}`.

### Bug 3: Budget amounts UI — ALREADY IMPLEMENTED
`CategoryForm` in `budget/page.tsx` already has `budget_amount` input. Use the Categories tab in the Budget page to set monthly budgets per category.

### Added: Settings page (`/settings`)
- `frontend/src/app/settings/page.tsx` created
- `backend/app/routers/auth.py` — added `POST /auth/change-password` endpoint
- `frontend/src/lib/api.ts` — added `changePassword()` function
- Sidebar + MobileNavBar updated to include Settings link

### Added: `parent_name` in CategoryOut schema
`backend/app/schemas/category.py` — `CategoryOut` now includes `parent_name` via `model_validator`.

---

## 8. Keaton's Financial Data Context

**Keaton Dick:**
- Salary: $116,500/yr, semi-monthly paychecks
- Take-home: ~$3,037.35/paycheck (after taxes, 401k 10%, benefits)
- 401k: $68,534 balance @ Fidelity
- IRA: $3,516 @ Fidelity
- HYSA: $12,526 @ Everbank (joint with Katherine, wedding fund)
- Chase checking: $1,169
- Student loans: ~$24K, $800/mo payment
- Two cars: Camry (red), Bluebird

**Katherine:**
- Employer: G&P (and CFH)
- Paycheck: $3,062.50 gross → $2,353 net semi-monthly

**Wedding:**
- Total cost: $62,702 (wedding only, with parent help)
- Timeline: Jun 2025 – Oct 2026
- Honeymoon: Nov 2026, $6,000

**Spending categories used:**
Car Repair, Car Expense, Going Out, Eating Out, Discretionary, Family, Rent/Utilities, Medical, Groceries, Subscriptions, Gas, Transportation, Required, Gifts, Shopping, Student Loans, Internet, Electricity, Wedding, Work

---

## 9. Next Features to Build (Priority Order)

1. **Notifications/alerts** — over-budget categories, upcoming event payments
2. **Export** — download transactions/forecast as XLSX
3. **Mobile PWA** — add manifest.json and service worker for "Add to Home Screen"
4. **Katherine's transaction import** — separate transactions linked to katherine's user account
5. **Investment growth rate** — configurable % return on 401k/IRA for forecast
6. **Student loan payoff projection** — amortization schedule with extra payment scenarios
