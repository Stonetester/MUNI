# FinanceTrack — Claude Project Context

## Stack
- **Backend**: Python FastAPI + SQLAlchemy + SQLite (default) / PostgreSQL + Alembic + Uvicorn port 8000
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS (dark theme) + Recharts port 3000
- **Auth**: JWT 30-day tokens, two seeded users: `keaton` / `katherine`
- **Repo**: https://github.com/Stonetester/MUNI.git

## Git State (as of 2026-03-18)
- **Current branch**: `feature/insights` (active development)
- **Branches**:
  - `main` — stable, clean, pushed to origin
  - `dev` — all cleanup + Docker + bug fixes committed and pushed
  - `feature/insights` — new features branch, committed and pushed to origin
- **Remote codex branches**: both deleted (`codex/complete-remaining-tasks-and-create-new-branch` and `-5gjrkr`)
- **Next step**: merge `feature/insights` → `dev` → `main` when ready

## All Completed Tasks (as of 2026-03-18)

### Done on `dev` branch
1. ✅ Untracked personal/binary files (`finance.db*`, `seed_transactions.json`, `backend_log.txt`) — added to `.gitignore` + `git rm --cached`
2. ✅ Added `backend/Dockerfile`, `frontend/Dockerfile`, `backend/.dockerignore`, `frontend/.dockerignore`
3. ✅ Fixed `api.ts` `createSnapshot()` — now calls `/balance-snapshots` (was `/snapshots`)
4. ✅ Cleaned `README.md` — removed real account balances and personal transaction counts
5. ✅ Cleaned `USER_GUIDE.md` — replaced Keaton/Katherine with User 1/User 2
6. ✅ Removed hardcoded credentials from `settings/page.tsx` About card
7. ✅ Added Tailscale section (§11) to `PROXMOX_SETUP.md`, renumbered §12–17
8. ✅ Fixed `docker-compose.yml` CORS_ORIGINS to include production domain
9. ✅ Pushed `dev` to origin; deleted remote codex branches
10. ✅ Updated `.gitignore` to exclude `__pycache__/` and `frontend/.next/`

### Done on `feature/insights` branch (2026-03-18)
11. ✅ **Tutorial modal** — `?` button in sidebar footer + mobile More drawer → 10-step walkthrough
12. ✅ **Spending Calendar** (`/calendar`) — monthly grid with SVG pie charts per day (category color-coded), click day → transaction detail modal
13. ✅ **Profile Switcher** — header button to store a second user's JWT and toggle between keaton/katherine without logging out
14. ✅ **Clickable chart months** — Monthly Cash Flow (dashboard), Net Worth Projection, Cash Flow Forecast → click any bar/point → month detail modal with category breakdown
15. ✅ **Spending Insights** (`/insights`) — new page applying skill frameworks:
    - Financial health scorecard: emergency fund months, savings rate %, debt-to-income, avg monthly net
    - Income vs Spending trend chart (3/6/12 month period selector) with savings rate overlay
    - Category Trend Analysis table: rolling 3mo avg, trend arrows (↑↓→), MoM % change, z-score anomaly detection
    - Debt Payoff Scenarios: amortization math for 3 payment scenarios, adjustable interest rate
    - Anomaly summary card flagging statistically unusual months

## Known Working Features
- ✅ Login (`/login`)
- ✅ Dashboard: net worth, monthly flow (clickable months), accounts grid, spending chart, forecast preview, recent transactions
- ✅ Transactions: paginated list, import CSV/XLSX, add/edit/delete, filters
- ✅ Accounts: CRUD, balance history chart (via `/balance-snapshots?account_id=`)
- ✅ Budget: categories with budget_amount, recurring rules, spending vs budget
- ✅ Forecast: 60-month net worth + cash flow charts (both clickable months), category table, scenario selector
- ✅ Life Events: CRUD, wedding/honeymoon pre-loaded
- ✅ What-If Scenarios: clone baseline, compare two scenarios
- ✅ Alerts: over-budget categories + upcoming event payments
- ✅ Settings: change password (POST /auth/change-password)
- ✅ Calendar (`/calendar`): day-level spending pie charts, click for detail
- ✅ Insights (`/insights`): health scorecard, trend analysis, debt payoff scenarios
- ✅ Tutorial: `?` button in sidebar → step-by-step walkthrough modal

## Key File Locations
- Backend entry: `backend/app/main.py`
- All API routes: `backend/app/routers/`
- Forecasting engine: `backend/app/services/forecasting.py`
- Frontend API calls: `frontend/src/lib/api.ts`
- Types: `frontend/src/lib/types.ts`
- Layout + nav: `frontend/src/components/layout/`
  - `AppLayout.tsx` — top bar, toasts, ProfileSwitcher
  - `Sidebar.tsx` — desktop nav (includes `?` tutorial button in footer)
  - `MobileNavBar.tsx` — mobile bottom nav + More drawer
  - `ProfileSwitcher.tsx` — dual-user token switcher
  - `TutorialModal.tsx` — 10-step app walkthrough
- All pages: `frontend/src/app/`
  - `/dashboard`, `/transactions`, `/accounts`, `/budget`, `/forecast`
  - `/events`, `/scenarios`, `/alerts`, `/settings`, `/login`
  - `/calendar` — spending calendar with pie charts
  - `/insights` — statistical spending analysis page
- UI components: `frontend/src/components/ui/`
  - `MonthDetailModal.tsx` — clickable month detail (forecast data + category breakdown)
- Auth: `frontend/src/lib/auth.ts` — includes `getAltToken`, `storeAltProfile`, `switchProfiles`

## API Base URL
`http://localhost:8000/api/v1`

## Schema Notes (do not revert)
| Feature | Backend field | Frontend field |
|---------|--------------|----------------|
| Forecast month | `month` | `month` |
| Forecast spending | `expenses` | `expenses` |
| Pagination | `skip`/`limit` | `offset`/`limit` |
| Balance snapshots | `/balance-snapshots?account_id=` | `getAccountSnapshots()` |

## Run Locally (no Docker)
```bash
# Terminal 1 — Backend
cd backend && venv\Scripts\activate
uvicorn app.main:app --reload --port 8000

# First time only (if finance.db doesn't exist):
# alembic upgrade head && python seed/seed_data.py

# Terminal 2 — Frontend
cd frontend && npm run dev
```
Open http://localhost:3000 — login: `keaton / finance123` or `katherine / finance123`

## Common Issues
- `ModuleNotFoundError: email_validator` → `pip install "pydantic[email]"` or `pip install -r requirements.txt`
- `'next' is not recognized` → run `npm install` in `frontend/` first
- npm install warnings (deprecated packages, vulnerabilities) → ignore for local dev, app works fine
