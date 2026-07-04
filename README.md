# FinanceTrack (MUNI)

Personal finance forecasting tool for Keaton & Katherine. Tracks expenses, income, investments, debt, life events, and projects your financial future.

## Documentation

| Doc | What it covers |
|---|---|
| **`docs/CALCULATIONS.md`** | The canonical "where does this number come from" reference — every formula, truth hierarchy, abstention rule, and provenance label (savings goals, HYSA, 401k, XIRR returns, forecast engine, Coast FI, salary inference, budgets) |
| **`docs/DATA-IMPORT.md`** | Every ingestion path (paystubs, statements, Sheets, CSV), dedup/idempotency/enrichment semantics, and the bulk re-upload playbook |
| **`docs/AI-SYSTEM.md`** | The AI chat + reports: grounding prompt contents, models & escalation ladder, report types, `num_ctx` gotcha, configuration |
| **`USER_GUIDE.md`** | Step-by-step usage for every page and workflow |
| **`PROXMOX_SETUP.md`** | Production deployment on Proxmox (Ubuntu LXC), daily ops, rollback |
| **`CLAUDE.md`** | Compact context for AI coding agents (settled decisions, schema notes, file map) |

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
1. **Historical averages**: recent-weighted blend per category (3-mo avg × 50% + 6-mo × 30% + 12-mo × 20%)
2. **Recurring schedules**: rules supplement only categories with no history
3. **Life event overlays**: wedding payments, honeymoon, etc.
4. **Investment growth**: measured XIRR blended toward a 10% market anchor when statements exist; holdings' assumed rates or per-type defaults otherwise — every rate labeled with its origin
5. **Measured contributions**: paystubs (401k), statement contributions, and real EverBank deposits (HYSA) beat manual profile values, each labeled

Scenarios let you clone the baseline and ask "what if I cut dining out by 50%?" — the comparison view shows the impact on savings and net worth. Full formulas, truth hierarchies, and abstention rules: **`docs/CALCULATIONS.md`**.

---

## Monthly Routine

1. **Each paycheck**: Upload the paystub PDF → income transaction created automatically
2. **Expenses**: Google Sheets auto-syncs every 30 min — or hit Sync Now after entering spending
3. **Quarterly**: Update account balances (401k, HYSA, student loans) via balance snapshots
4. **Annually**: Review recurring rules (salary changes, new subscriptions)
