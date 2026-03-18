# FinanceTrack — Claude Project Context
_Last updated: 2026-03-18. See NEXT_PHASE_PLAN.md for the full next-phase build plan._

---

## Stack
- **Backend**: Python FastAPI + SQLAlchemy + SQLite (default) / PostgreSQL + Alembic + Uvicorn port 8000
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS (dark theme) + Recharts port 3000
- **Auth**: JWT 30-day tokens, two seeded users: `keaton` / `katherine`
- **Repo**: https://github.com/Stonetester/MUNI.git

---

## Git State (as of 2026-03-18)
- **Current branch**: `feature/insights` (active development — all recent work here)
- **Branches**:
  - `main` — stable, clean, pushed to origin
  - `dev` — all cleanup + Docker + bug fixes committed and pushed
  - `feature/insights` — all new feature work, committed and pushed to origin
- **Remote codex branches**: both deleted
- **Next step**: when new phase (Google Sheets + Financial Profile) is complete, merge `feature/insights` → `dev` → `main`

---

## All Completed Tasks

### Done on `dev` branch
1. ✅ Untracked personal/binary files (`finance.db*`, `seed_transactions.json`, `backend_log.txt`) — added to `.gitignore` + `git rm --cached`
2. ✅ Added `backend/Dockerfile`, `frontend/Dockerfile`, `backend/.dockerignore`, `frontend/.dockerignore`
3. ✅ Fixed `api.ts` `createSnapshot()` — now calls `/balance-snapshots` (was `/snapshots`)
4. ✅ Cleaned `README.md` — removed real account balances and personal transaction counts
5. ✅ Cleaned `USER_GUIDE.md` — replaced Keaton/Katherine with User 1/User 2
6. ✅ Removed hardcoded credentials from `settings/page.tsx` About card
7. ✅ Added Tailscale section (§11) to `PROXMOX_SETUP.md`
8. ✅ Fixed `docker-compose.yml` CORS_ORIGINS to include production domain
9. ✅ Pushed `dev` to origin; deleted remote codex branches
10. ✅ Updated `.gitignore` to exclude `__pycache__/` and `frontend/.next/`

### Done on `feature/insights` branch
11. ✅ **Tutorial modal** — `?` button in sidebar footer + mobile More drawer → 10-step walkthrough
12. ✅ **Spending Calendar** (`/calendar`) — monthly grid with SVG pie charts per day (category color-coded), click day → transaction detail modal
13. ✅ **Profile Switcher** — header button to store a second user's JWT and toggle between keaton/katherine without logging out
14. ✅ **Clickable chart months** — Monthly Cash Flow, Net Worth Projection, Cash Flow Forecast → click any bar/point → MonthDetailModal with category breakdown
15. ✅ **Spending Insights** (`/insights`) — health scorecard, trend analysis, z-score anomaly detection, debt payoff scenarios
16. ✅ **Seed script cleaned** — `backend/seed/seed_data.py` now creates only users + default categories (no personal financial data). App starts clean.
17. ✅ **Getting Started guide** (`/getting-started`) — interactive 6-section checklist: add accounts, import CSV, enter balances, recurring rules, budgets, life events. In sidebar + mobile nav.
18. ✅ **bcrypt pinned** — `bcrypt==4.0.1` in `requirements.txt` to fix passlib 1.7.4 incompatibility with bcrypt 4.1+
19. ✅ **NEXT_PHASE_PLAN.md** — full plan for Google Sheets sync + Financial Profile page saved at repo root

---

## Known Working Features
- ✅ Login (`/login`)
- ✅ Dashboard: net worth, monthly flow (clickable months), accounts grid, spending chart, forecast preview, recent transactions
- ✅ Transactions: paginated list, import CSV/XLSX, add/edit/delete, filters
- ✅ Accounts: CRUD, balance history chart (via `/balance-snapshots?account_id=`)
- ✅ Budget: categories with budget_amount, recurring rules, spending vs budget
- ✅ Forecast: 60-month net worth + cash flow charts (both clickable months), category table, scenario selector
- ✅ Life Events: CRUD
- ✅ What-If Scenarios: clone baseline, compare two scenarios
- ✅ Alerts: over-budget categories + upcoming event payments
- ✅ Settings: change password (POST /auth/change-password)
- ✅ Calendar (`/calendar`): day-level spending pie charts, click for detail
- ✅ Insights (`/insights`): health scorecard, trend analysis, debt payoff scenarios
- ✅ Tutorial: `?` button in sidebar → step-by-step walkthrough modal
- ✅ Getting Started (`/getting-started`): interactive setup checklist for new users
- ✅ Profile Switcher: toggle between keaton/katherine JWT without logging out

---

## Key File Locations
- Backend entry: `backend/app/main.py`
- All API routes: `backend/app/routers/`
- Forecasting engine: `backend/app/services/forecasting.py`
- Frontend API calls: `frontend/src/lib/api.ts`
- Types: `frontend/src/lib/types.ts`
- Layout + nav: `frontend/src/components/layout/`
  - `AppLayout.tsx` — top bar, toasts, ProfileSwitcher
  - `Sidebar.tsx` — desktop nav (includes `?` tutorial button in footer, "Get Started" link)
  - `MobileNavBar.tsx` — mobile bottom nav + More drawer
  - `ProfileSwitcher.tsx` — dual-user token switcher
  - `TutorialModal.tsx` — 10-step app walkthrough (step 1 links to /getting-started)
- All pages: `frontend/src/app/`
  - `/dashboard`, `/transactions`, `/accounts`, `/budget`, `/forecast`
  - `/events`, `/scenarios`, `/alerts`, `/settings`, `/login`
  - `/calendar` — spending calendar with day-level pie charts
  - `/insights` — statistical spending analysis page
  - `/getting-started` — interactive new-user setup guide
- UI components: `frontend/src/components/ui/`
  - `MonthDetailModal.tsx` — clickable month detail (forecast data + category breakdown)
- Auth: `frontend/src/lib/auth.ts` — includes `getAltToken`, `storeAltProfile`, `switchProfiles`
- Seed script: `backend/seed/seed_data.py` — creates users + categories only (no personal data)
- Next phase plan: `NEXT_PHASE_PLAN.md` — full plan for Phase 3 features

---

## User Financial Data (Keaton)
_Used when building projections, profile defaults, loan trackers._

- **Salary**: $116,500/yr gross; net ~$3,037.35/paycheck; semi-monthly (24 pay periods/yr)
- **Student Loans** (two loans, remaining balances as of 2026-03-18):
  - Loan 1: **$343.35** @ 4.80% — nearly paid off
  - Loan 2: **$1,921.40** @ 4.28% — nearly paid off
  - Payments tracked via "Student Loans" category transactions
- **401k** (Fidelity):
  - Employee contribution: $380/paycheck
  - Employer contribution: 6% of gross salary regardless of employee contribution ($291.25/paycheck)
  - Starting balance: $68,534.76
  - Fund allocations: to be entered by user in Financial Profile page (not yet built)
- **IRA** (Schwab funds):
  - $225/month → SWPPX (Schwab S&P 500 Index, ~10.4% historical return)
  - $225/month → SWISX (Schwab International Index, ~6.8% historical return)
  - Starting balance: $3,516.68
  - Allocation note: 50/50 split is solid; 60/40 SWPPX/SWISX also defensible
- **HYSA** (EverBank):
  - APY: 3.9%
  - Monthly contribution: $1,600/month
  - Starting balance: $12,526.74
- **Wedding**: Oct 2026, ~$62,702 total cost
- **Katherine**: same account types (401k, IRA, loans, HYSA) — different values, to be entered by her in her own Financial Profile

---

## Phase 4 — Planned Features (NOT YET BUILT)
_See NEXT_PHASE_PLAN.md — Phase 4 section for full details._

### A. Paystub Screenshot Parser
- Upload paystub image (JPG/PNG/PDF) → Claude Vision API parses every field
- Extracts: gross pay, all deductions (401k, health, dental, vision, HSA), all taxes (federal, state, SS, Medicare), employer match, net pay, YTD figures
- User reviews pre-filled form → confirms → saves to DB
- `/paystubs` page: upload, timeline, summary stats (YTD income, effective tax rate, YTD 401k)
- **Requires:** `ANTHROPIC_API_KEY` in `backend/.env`

### B. Historical Data Entry
- **Past paystubs**: same upload+parse flow, any date; multi-file batch upload
- **Investment statements**: manual entry form for 401k/IRA quarterly statements (beginning balance, ending balance, contributions, gains, fund breakdown)
- Once entered: projections use actual historical return rates instead of assumed percentages

### C. Joint HYSA (Keaton + Katherine)
- Add `is_joint` + `joint_user_id` columns to `accounts` table
- Joint accounts visible to both users; "Joint" badge in UI
- Each user has their own recurring rule pointing to the joint account (different contribution amounts)
- Katherine's HYSA contribution amount TBD (she'll enter in Financial Profile)
- Net worth: both users see full balance; couple combined view counts it once (future)

### New models needed (Phase 4):
- `Paystub` — all paystub fields (35+ columns)
- `InvestmentStatement` — quarterly statement data per account

### New dependencies (Phase 4):
- `anthropic>=0.25.0` — Claude Vision API for paystub parsing

### Build order for Phase 4:
1. Joint HYSA (DB migration + API + UI badge)
2. Paystub parser (needs ANTHROPIC_API_KEY first)
3. Historical statement entry (manual form, no dependencies)

---

## Phase 3 — Planned Features (NOT YET BUILT)
_See NEXT_PHASE_PLAN.md for full details, exact steps, and file plan._

### 1. Google Sheets Auto-Sync
- Connect "Keaton's monthly spending" Google Sheet directly to the app
- Auto-polls every 30 minutes; new rows appear in Transactions automatically
- Requires: Google Cloud service account + credentials JSON + Sheet ID in Settings
- **PREREQUISITE**: User must complete 7-step Google Cloud setup (in NEXT_PHASE_PLAN.md)

### 2. Financial Profile Page (`/financial-profile`)
- Per-user page for entering: salary, student loans, 401k, IRA, HYSA
- Each section has a **visibility toggle** — hide sections for accounts the user doesn't have
- Katherine logs in and fills in her own values independently
- All sections:
  - Salary & Paycheck
  - Student Loans (auto-tracks balance reduction from transactions)
  - 401k (fund allocations, employer match, projection chart)
  - IRA (SWPPX + SWISX, monthly contribution, projection)
  - HYSA (APY, monthly contribution, projected balance)
  - Google Sheets Sync config (Sheet ID, last sync, Sync Now button)

### 3. Student Loan Auto-Tracker
- Starting balance entered in Financial Profile; app reduces balance as "Student Loans" transactions post
- Shows payoff date, total interest remaining, amortization schedule

### 4. Investment Growth Projections
- 401k, IRA, HYSA all projected with compound interest math
- Milestone dates: wedding month, 1yr, 5yr, 20yr

### New Backend Models Needed
```
UserSyncConfig       — sheet_id, last_sync_at, sync_enabled per user
StudentLoan          — user_id, loan_name, current_balance, interest_rate, minimum_payment
InvestmentHolding    — account_id, ticker, fund_name, current_value, monthly_contribution
FinancialProfile     — user_id, gross_salary, pay_frequency, net_per_paycheck,
                       employer_401k_percent, hidden_sections (JSON list)
```

### New Dependencies Needed
```
google-api-python-client>=2.100.0
google-auth>=2.23.0
apscheduler>=3.10.0
```

---

## API Base URL
`http://localhost:8000/api/v1`

---

## Schema Notes (do not revert)
| Feature | Backend field | Frontend field |
|---------|--------------|----------------|
| Forecast month | `month` | `month` |
| Forecast spending | `expenses` | `expenses` |
| Pagination | `skip`/`limit` | `offset`/`limit` |
| Balance snapshots | `/balance-snapshots?account_id=` | `getAccountSnapshots()` |

---

## Run Locally (no Docker)
```bash
# Terminal 1 — Backend
cd backend && venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# First time only (fresh database):
# alembic upgrade head && python seed/seed_data.py

# Terminal 2 — Frontend
cd frontend && npm run dev
```
Open http://localhost:3000 — login: `keaton / finance123` or `katherine / finance123`

---

## Common Issues
- `ModuleNotFoundError: email_validator` → `pip install "pydantic[email]"` or `pip install -r requirements.txt`
- `'next' is not recognized` → run `npm install` in `frontend/` first
- `bcrypt version error` / `password cannot be longer than 72 bytes` in passlib → `pip install bcrypt==4.0.1` (already pinned in requirements.txt)
- `seed_data.py` fails with "already seeded" → delete `backend/finance.db` and re-run
- `frontend/.next/` or `__pycache__/` tracked by git → `git rm -rf --cached frontend/.next __pycache__` then commit
