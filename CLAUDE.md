# Muni — Claude Project Context
_Last updated: 2026-03-20 (session 5). See NEXT_PHASE_PLAN.md for the full build plan._

---

## Stack
- **Backend**: Python FastAPI + SQLAlchemy + SQLite + Alembic + Uvicorn port 8000
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS (dark theme) + Recharts port 3000
- **Auth**: JWT 30-day tokens, **no passwords** — two profiles: `keaton` / `katherine`. Login is a profile picker that calls `/auth/switch/{username}` (no password required). Tailscale subnet routing is the security layer.
- **Repo**: https://github.com/Stonetester/MUNI.git

---

## Production Server
- **Proxmox host**: Roman — `10.0.0.11`
- **Muni container**: CT 102 — `10.0.0.48`
- **Access URL**: `http://10.0.0.48` (via Tailscale subnet routing on Roman)
- **Tailscale**: runs on Roman only — advertises `10.0.0.0/24` so all LAN devices including CT 102 are reachable from any Tailscale device without installing Tailscale in each container
- **Full setup guide**: `PROXMOX_SETUP.md` — covers initial setup, daily startup, shutdown, deploy, rollback, and troubleshooting

### Production Startup
The container and all services start automatically on Proxmox boot via systemd. Manual start:
```bash
# SSH into muni container
ssh root@10.0.0.48
systemctl start muni-backend muni-frontend nginx
# Verify
systemctl status muni-backend muni-frontend nginx
```

### Production Shutdown
```bash
# Stop services only (keep container running)
systemctl stop muni-backend muni-frontend nginx
# Full container shutdown
shutdown -h now
# Or: Proxmox UI → CT 102 → Shutdown
```

### Deploy an Update
```bash
# SSH into muni container
ssh root@10.0.0.48
muni-deploy
```
The `muni-deploy` script: pulls from `main`, runs alembic migrations, rebuilds frontend, restarts services.

### Re-seed Database (if login fails / empty DB)
```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic upgrade head
python seed/seed_data.py
'
systemctl restart muni-backend
```

---

## Git State (as of 2026-03-20)
- **Active branch**: `feature/paystub-income-sync` — paystub → income transaction auto-creation, docs cleanup
- **Main branch**: all previously merged work
- **Workflow**: develop on feature branch, merge to `main`, then `muni-deploy` on the server

---

## All Completed Features

### Infrastructure & Auth
1. ✅ **No-password auth** — login page is a profile picker; backend `/auth/switch/{username}` issues JWT with no password
2. ✅ **Profile Switcher** — header button stores second user's JWT, toggles without logout
3. ✅ **Settings page** — shows Keaton/Katherine profile cards (active/inactive), Google Sheets sync config, email notifications, about card
4. ✅ **bcrypt pinned** — `bcrypt==4.0.1` in `requirements.txt` (passlib 1.7.4 compatibility)
5. ✅ **Seed script** — creates users + categories only, no personal data
6. ✅ **Production deploy** — `muni-deploy` script, systemd auto-start, nginx reverse proxy
7. ✅ **Tailscale subnet routing** — Roman (10.0.0.11) advertises 10.0.0.0/24; muni at 10.0.0.48
8. ✅ **`backend/venv/` removed from git** — Windows venv broke Linux server; now gitignored properly

### App Features
9. ✅ Dashboard: net worth, monthly flow (clickable months), accounts grid, spending chart, forecast preview, recent transactions
10. ✅ Transactions: paginated list, import CSV/XLSX, add/edit/delete, filters
11. ✅ Accounts: CRUD, balance history chart (via `/balance-snapshots?account_id=`)
12. ✅ Budget: categories with budget_amount, recurring rules, spending vs budget
13. ✅ Forecast: 60-month net worth + cash flow charts (both clickable months), category table, scenario selector
14. ✅ Life Events: CRUD
15. ✅ What-If Scenarios: clone baseline, compare two scenarios
16. ✅ Alerts: over-budget categories + upcoming event payments
17. ✅ Spending Calendar (`/calendar`): monthly grid with day-level pie charts, click for transaction detail
18. ✅ Spending Insights (`/insights`): health scorecard, trend analysis, z-score anomaly detection, debt payoff scenarios
19. ✅ AI Financial Report (`/ai-report`): Claude-powered monthly report
20. ✅ Notifications (`/notifications`): weekly email digest, SMTP config, preview
21. ✅ Google Sheets Sync (`/settings`): connect sheet ID, auto-sync every 30 min, manual sync
22. ✅ Tutorial modal: `?` button in sidebar → step-by-step walkthrough
23. ✅ Getting Started (`/getting-started`): interactive setup checklist (auto-completes as you use the app)
24. ✅ **Paystubs** (`/paystubs`): upload Paylocity PDF → parse all fields → save → auto-creates income transactions (Salary + Employer 401k) in transaction history; bonus paystub detection; YTD tracking; avg net excludes bonus stubs
25. ✅ **Financial Profile** (`/financial-profile`): salary, loans, investment holdings, compensation history

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
  - `TutorialModal.tsx` — 10-step app walkthrough
- All pages: `frontend/src/app/`
  - `/dashboard`, `/transactions`, `/accounts`, `/budget`, `/forecast`
  - `/events`, `/scenarios`, `/alerts`, `/settings`, `/notifications`, `/login`
  - `/calendar` — spending calendar with day-level pie charts
  - `/insights` — statistical spending analysis page
  - `/ai-report` — Claude-powered monthly financial report
  - `/getting-started` — interactive new-user setup guide
  - `/paystubs` — PDF upload, parse review, history, income transaction auto-creation
- UI components: `frontend/src/components/ui/`
  - `MonthDetailModal.tsx` — clickable month detail (forecast data + category breakdown)
- Auth: `frontend/src/lib/auth.ts` — `login()`, `switchProfiles()`, `getAltUser()`, `storeAltProfile()`
- Seed script: `backend/seed/seed_data.py` — creates users + categories only
- Production guide: `PROXMOX_SETUP.md` — complete server setup + ops docs
- Next phase plan: `NEXT_PHASE_PLAN.md` — Phase 3 & 4 planned features

---

## User Financial Data (Keaton)
_Used when building projections, profile defaults, loan trackers._

- **Salary**: ~$130,935/yr gross ($5,455.63/period × 24 — verified from March 2026 paystub); net ~$3,503.78/paycheck; semi-monthly (24 pay periods/yr)
- **Student Loans** (balances as of 2026-03-18):
  - Loan 1: **$343.35** @ 4.80% — nearly paid off
  - Loan 2: **$1,921.40** @ 4.28% — nearly paid off
- **401k** (Fidelity):
  - Employee contribution: $380/paycheck
  - Employer Safe Harbor: 6% = **$327.34/paycheck**
  - Starting balance: $68,534.76
- **IRA** (Schwab): $225/month → SWPPX + $225/month → SWISX; starting balance: $3,516.68
- **HYSA** (EverBank): 3.9% APY, $1,600/month contribution, starting balance: $12,526.74
- **Wedding**: Oct 2026, ~$62,702 total cost
- **Katherine**: same account types — different values, to be entered in her Financial Profile

---

## Phase 4 — Feature Status

### ✅ A. Paystub PDF Parser (DONE — `feature/paystub-income-sync`)
- Upload paystub PDF → pdfplumber extracts all fields (Paylocity format)
- Saving auto-creates income transactions (net pay + employer 401k)
- Bonus paystub detection (`pay_type`, `bonus_pay` fields)
- Alembic migration 002 adds the two new columns

### B. Historical Data Entry (still planned)
- Past paystubs: batch upload + parse
- Investment statements: manual form for 401k/IRA quarterly statements

### C. Joint HYSA (Keaton + Katherine)
- `is_joint` + `joint_user_id` on accounts table; "Joint" badge in UI
- Keaton: $1,600/month | Katherine: $1,600/month

### D. Compensation History
- Log raises, bonuses, awards, stipends
- `CompensationEvent` model; timeline on Financial Profile

### Build order for Phase 4:
1. Joint HYSA (DB migration + API + UI badge)
2. Compensation History (pure CRUD)
3. Paystub parser (`pip install pdfplumber>=0.10.0`)
4. Historical statement entry

---

## Phase 3 — Planned Features (NOT YET BUILT)
_See NEXT_PHASE_PLAN.md for full details._

### 1. Google Sheets Auto-Sync _(backend built, needs Google credentials setup)_
- Service account credentials JSON → `backend/credentials/google-sheets-key.json`
- Sheet ID entered in Settings → auto-polls every 30 min

### 2. Financial Profile Page (`/financial-profile`)
- Per-user: salary, loans, 401k, IRA, HYSA with visibility toggles
- New models: `UserSyncConfig`, `StudentLoan`, `InvestmentHolding`, `FinancialProfile`
- New deps: `google-api-python-client`, `google-auth`, `apscheduler`

### 3. Student Loan Auto-Tracker
- Balance reduces automatically as "Student Loans" transactions post

### 4. Investment Growth Projections
- 401k, IRA, HYSA projected with compound interest; milestone dates (wedding, 1yr, 5yr, 20yr)

---

## API Base URL
- Local dev: `http://localhost:8000/api/v1`
- Production: `http://10.0.0.48/api/v1` (nginx proxies to port 8000)

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
Open http://localhost:3000 — click Keaton or Katherine to log in (no password)

---

## Common Issues
- `ModuleNotFoundError: email_validator` → `pip install "pydantic[email]"` or `pip install -r requirements.txt`
- `'next' is not recognized` → run `npm install` in `frontend/` first
- `bcrypt version error` in passlib → `pip install bcrypt==4.0.1` (already pinned)
- `seed_data.py` fails with "already seeded" → delete `backend/finance.db` and re-run
- Login fails on production → database empty; run the re-seed command above
- `npm EACCES permission denied` after git reset → `chown -R muni:muni /opt/muni/app`
- Windows venv committed accidentally → `git rm -r --cached backend/venv/` then commit
