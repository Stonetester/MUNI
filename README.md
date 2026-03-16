# FinanceTrack

Personal finance forecasting tool for Keaton & Katherine. Tracks expenses, income, investments, debt, life events, and projects your financial future.

## Features

- **Dashboard**: Net worth, monthly cash flow, account balances, spending by category
- **Transactions**: Import from CSV/XLSX, auto-categorize, search & filter
- **Forecast**: 60-month projections with what-if scenarios
- **Life Events**: Wedding cost planning, honeymoon, major purchases
- **What-If Scenarios**: See how changes to spending affect your future
- **Mobile-First**: Works great on your phone

## Quick Start (Recommended — No Docker Needed)

**Requirements:** Python 3.11+ and Node.js 18+

### Windows:
```
Double-click start.bat
```

### Manual start:

**Backend (terminal 1):**
```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate    # Mac/Linux
pip install -r requirements.txt
alembic upgrade head
python seed/seed_data.py
uvicorn app.main:app --reload --port 8000
```

**Frontend (terminal 2):**
```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

### Login
| User | Password |
|------|----------|
| keaton | finance123 |
| katherine | finance123 |

> Change passwords in Settings after first login.

---

## What's Pre-Loaded

Your real financial data from your spreadsheets:
- **1,799 transactions** (Jul 2024 – Mar 2026) from Keaton's monthly spending
- **Accounts**: Chase Checking, Everbank HYSA, 401(k), IRA, Student Loans
- **Recurring rules**: Paychecks, 401k contributions, student loans, subscriptions
- **Life event**: Wedding (Jun 2025 – Oct 2026, $62,702 total)
- **Katherine's** accounts and paycheck data

---

## Adding Your Data

### Import Transactions (Easiest)
1. Export from your bank as CSV
2. Go to **Transactions → Import**
3. Map columns (the tool remembers your mapping)

### CSV Import Format Supported
Your existing spreadsheet format works directly:
```
Column 1, Transaction Date, Type, Price, Status
Chic fil a, 7/1/2024, Eating out, 12.82, Debit Card
```

Standard bank CSV format also works:
```
Date, Description, Amount, Type
2024-07-01, WALMART, -45.23, Debit
```

### Manual Entry
- **Transactions**: Add button on Transactions page
- **Balances**: Accounts page → add balance snapshot
- **Recurring**: Budget page → Recurring Rules section

---

## Architecture

```
financeTool/
├── backend/          FastAPI + SQLite (or PostgreSQL)
│   ├── app/          API code
│   │   ├── models/   Database models
│   │   ├── routers/  API endpoints
│   │   └── services/ Forecasting + import logic
│   └── seed/         Data seeding script
├── frontend/         Next.js 14 + Tailwind
│   └── src/          TypeScript source
├── docker-compose.yml  Optional Docker deployment
└── start.bat         Windows quick-start
```

## Docker Deployment (Optional)

```bash
cp .env.example .env
# Edit .env to set SECRET_KEY and POSTGRES_PASSWORD
docker compose up --build
```

---

## Forecast Logic

The forecasting engine uses:
1. **Historical averages**: 3/6/12-month trailing average per category
2. **Recurring schedules**: Your income and expense rules
3. **Life event overlays**: Wedding payments, honeymoon, etc.
4. **Debt amortization**: Student loan payoff projection
5. **Investment growth**: 401k/IRA with configurable return rate (default 7%)

Scenarios let you clone the baseline and ask "what if I cut dining out by 50%?" — the comparison view shows the impact on savings and net worth.

---

## Key Account Numbers (as of Mar 2026)

| Account | Balance |
|---------|---------|
| Chase Checking | $1,169.87 |
| Everbank HYSA | $12,526.74 |
| Keaton 401(k) | $68,534.76 |
| Keaton IRA | $3,516.68 |
| Student Loans | ~$24,000 |

> Update these in Accounts → Add Balance Snapshot to keep forecasts accurate.

---

## Updating Your Data

The app gets smarter as you add data. Best practice:
1. **Monthly**: Import previous month's transactions from your bank exports
2. **Quarterly**: Update account balances (401k, HYSA, student loan)
3. **Annually**: Review and update recurring rules (salary changes, new subscriptions)
