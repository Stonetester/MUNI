# FinanceTrack

Personal finance forecasting tool for Keaton & Katherine. Tracks expenses, income, investments, debt, life events, and projects your financial future.

## Features

## Proxmox Deployment Guide

For a production deployment on Proxmox (Ubuntu LXC), see **`PROXMOX_SETUP.md`**.

---



## Full User Guide

For complete, step-by-step usage instructions (all pages and workflows), see **`USER_GUIDE.md`**.

---


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
Click **Keaton** or **Katherine** on the login screen — no password required. Access is secured via Tailscale subnet routing.

---

## What's Pre-Loaded

Sample data seeded by `seed/seed_data.py`:
- **Transactions** — historical spending across multiple categories
- **Accounts**: Checking, HYSA, 401(k), IRA, Student Loans
- **Recurring rules**: Paychecks, 401k contributions, student loans, subscriptions
- **Life event**: Wedding example (multi-month cost breakdown)

---

## Getting Data In

### Income — Paystub PDFs
1. Go to **Paystubs** in the sidebar
2. Drag a Paylocity PDF onto the upload zone
3. Review the auto-extracted fields, then hit **Save**
4. A Salary income transaction is created automatically on the pay date — no manual entry needed

Bonus paystubs are detected automatically (yellow badge, excluded from avg-net stats).

### Expenses — Google Sheets Sync
1. Go to **Settings → Google Sheets Sync**
2. Paste your Spreadsheet ID (from the sheet URL)
3. Share the sheet with the service account email in `backend/credentials/google-sheets-key.json`
4. Hit **Sync Now** — expense transactions import from each monthly tab
5. Syncs automatically every 30 minutes when enabled

### CSV Import (backfill / one-off)
1. Export from your bank as CSV
2. Go to **Transactions → Import**
3. Upload — columns are mapped automatically

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

## Monthly Routine

1. **Each paycheck**: Upload the paystub PDF → income transaction created automatically
2. **Expenses**: Google Sheets auto-syncs every 30 min — or hit Sync Now after entering spending
3. **Quarterly**: Update account balances (401k, HYSA, student loans) via balance snapshots
4. **Annually**: Review recurring rules (salary changes, new subscriptions)
