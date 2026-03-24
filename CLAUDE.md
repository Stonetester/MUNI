# Muni — Claude Project Context
_Last updated: 2026-03-23 (session 7). Active branch: `main`._

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
Services auto-start on Proxmox boot via systemd. Manual start:
```bash
ssh root@10.0.0.48
systemctl start muni-backend muni-frontend nginx
systemctl status muni-backend muni-frontend nginx
```

### Production Shutdown
```bash
systemctl stop muni-backend muni-frontend nginx   # stop services only
shutdown -h now                                    # full container shutdown
```

### Deploy an Update
```bash
ssh root@10.0.0.48
muni-deploy
```
The `muni-deploy` script: pulls `main`, runs `alembic upgrade head`, rebuilds frontend (`npm run build`), restarts services.

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

## Git State (as of 2026-03-23)
- **Active branch**: `main` — all features merged, working directly on main
- **Latest commits**: session 7 sheets/dupe-review fixes, session 6 PWA icons (947639e8), UX features (0eb98660)
- **Workflow**: develop on main → `muni-deploy` on server
- **Branch history (all merged into main)**:
  - `dev` — Docker, cleanup, bug fixes
  - `feature/insights` — calendar, insights, profile switcher, tutorial, getting started
  - `feature/mobile-ai-reports` — AI report page, email notifications
  - `feature/paystub-income-sync` — paystub → income transaction auto-creation, bulk upload

---

## How Data Gets Into the App

### Income → Paystub PDFs
1. User uploads a Paylocity PDF at `/paystubs`
2. Backend (`paystub_parser.py`) uses **pdfplumber** to extract all fields via regex — free, no API needed
3. User reviews the pre-filled form, corrects any fields, hits **Save**
4. On save, backend automatically creates:
   - A **Salary** (or **Bonus**) income transaction for `net_pay` posted to the user's checking account on the pay date
   - An **Employer 401k** income transaction for `employer_401k` (the "401 Safe H" line from Paylocity)
   - Both transactions tagged `import_source = "paystub:{id}"` for traceability
5. Deleting a paystub removes its transactions too

### Expenses → Google Sheets Sync
1. User enters their Google Sheet ID in **Settings → Google Sheets Sync**
2. APScheduler polls the sheet every 30 minutes (or manual "Sync Now")
3. Each monthly tab is read (format: `Jan 2025`, `Feb 2025`, etc.)
4. Rows are mapped: `Date` → date, `Description`/`Expense` → description, `Amount` → amount (negated to negative)
5. Deduplication by hash of (date + description + amount) — safe to sync repeatedly
6. Service account credentials: `backend/credentials/google-sheets-key.json` (gitignored)
7. Keaton's sheet ID: `1zq-UuBUmZIx70lM_EYajSv3suXwUaMDjhxuW4m-Eqac`

### Backfill → CSV Import
- `Transactions → Import` accepts CSV with Date, Description, Amount columns
- Columns are auto-mapped; import source tagged `"csv"`
- Use for historical bank data backfill

---

## All Completed Features

### Infrastructure & Auth
1. ✅ **No-password auth** — login page is a profile picker; `/auth/switch/{username}` issues JWT, no password
2. ✅ **Profile Switcher** — header button stores second user's JWT, toggles without logout
3. ✅ **Settings page** — Keaton/Katherine profile cards, Google Sheets sync card, email notifications, about card
4. ✅ **bcrypt pinned** — `bcrypt==4.0.1` in `requirements.txt` (passlib 1.7.4 compatibility fix)
5. ✅ **Seed script** — `seed/seed_data.py` creates users + categories only; no personal data
6. ✅ **Production deploy** — `muni-deploy` script, systemd auto-start, nginx reverse proxy on CT 102
7. ✅ **Tailscale subnet routing** — Roman (10.0.0.11) advertises 10.0.0.0/24; muni at 10.0.0.48
8. ✅ **`backend/venv/` removed from git** — Windows venv broke Linux server; gitignored properly

### App Features
9. ✅ **Dashboard** — net worth card, quick stats, accounts grid, monthly flow chart (clickable), spending by category, forecast preview, upcoming events, alerts card, recent transactions
10. ✅ **Transactions** — paginated list, CSV/XLSX import, add/edit/delete, filter by date/account/category/search, export CSV
11. ✅ **Accounts** — CRUD, balance history chart (via `/balance-snapshots?account_id=`), account types: checking/savings/hysa/brokerage/ira/401k/hsa/credit_card/student_loan/car_loan/mortgage/other
12. ✅ **Budget** — categories with `budget_amount`, recurring rules, spending vs budget comparison, over-budget alerts
13. ✅ **Forecast** — 60-month net worth + cash flow charts (both clickable months → `MonthDetailModal`), category contribution table, scenario selector
14. ✅ **Life Events** — CRUD (name, type, start/end dates, total cost, monthly breakdown, active toggle)
15. ✅ **What-If Scenarios** — clone baseline, compare two scenarios side-by-side
16. ✅ **Alerts** — over-budget categories + upcoming event payments with severity levels
17. ✅ **Spending Calendar** (`/calendar`) — monthly grid with day-level pie charts, click day for transaction detail
18. ✅ **Spending Insights** (`/insights`) — health scorecard, trend analysis, z-score anomaly detection, debt payoff scenarios
19. ✅ **AI Financial Report** (`/ai-report`) — Claude-powered monthly analysis via Anthropic API
20. ✅ **Notifications** (`/notifications`) — weekly email digest, SMTP config, preview + send now
21. ✅ **Google Sheets Sync** — Settings page: paste Sheet ID, auto-polls every 30 min via APScheduler, manual Sync Now, shows last sync time/result/row counts; duplicate review (expandable list of skipped rows post-sync); upsert (amount updates when sheet row edited); HYSA auto-categorize; Katherine's column format (Item ID/Type/Price/Status) fully supported
22. ✅ **Tutorial modal** — `?` button in sidebar footer → 10-step app walkthrough
23. ✅ **Getting Started** (`/getting-started`) — interactive setup checklist (auto-completes as data is added), progress bar, quick links
24. ✅ **Paystubs** (`/paystubs`) — upload Paylocity PDF → pdfplumber parses all fields → review form → save → **auto-creates income transactions** (Salary/Bonus + Employer 401k); bonus detection (`pay_type`, `bonus_pay`); YTD stats; avg net excludes bonus stubs
25. ✅ **Financial Profile** (`/financial-profile`) — salary/pay frequency/net per paycheck, HYSA APY + contributions, IRA contributions, student loans (per-loan balance/rate/payment), investment holdings (ticker/fund/value/contribution/return), compensation history (raises/bonuses/awards)

---

## Key File Locations

### Backend
- Entry point: `backend/app/main.py` — FastAPI app, CORS, router registration, lifespan (APScheduler)
- Routers: `backend/app/routers/`
  - `auth.py` — `/auth/switch/{username}` (no-password JWT login)
  - `dashboard.py` — `/dashboard` aggregated response
  - `transactions.py` — CRUD, CSV/XLSX import, filters, pagination (skip/limit)
  - `accounts.py` — account CRUD
  - `balance_snapshots.py` — `/balance-snapshots?account_id=` (chart data)
  - `categories.py` — category CRUD + budget amounts
  - `budget.py` — `/budget/summary` (spending vs budget by category)
  - `forecast.py` — 60-month projection engine endpoint
  - `events.py` — life events CRUD
  - `scenarios.py` — scenario CRUD + clone
  - `alerts.py` — budget + event alerts
  - `import_data.py` — CSV/XLSX import
  - `sync.py` — `/sync/google-sheets/config` (GET/PUT) + `/sync/google-sheets/run` (POST)
  - `financial_profile.py` — GET/PUT profile; sub-routes for `/loans`, `/holdings`, `/compensation`
  - `paystubs.py` — POST `/paystubs/parse` (upload+extract), POST `/paystubs` (save+create transactions), GET `/paystubs`, DELETE `/paystubs/{id}`
  - `notifications.py` — email digest config + send
  - `ai_report.py` — Claude API monthly report
- Services: `backend/app/services/`
  - `forecasting.py` — 60-month projection engine (historical avgs + recurring rules + life events + debt amortization + investment growth)
  - `paystub_parser.py` — pdfplumber + regex extraction for Paylocity AND G&P (Grimm & Parker) formats; bonus detection (requires period+YTD pair, lone YTD carry-forwards ignored); `pay_type` = "bonus" only when `bonus_pay > 0` and `regular_pay == 0`
  - `google_sheets_sync.py` — sheets API client, tab parsing, deduplication (SHA-256 hash), upsert (amount updates), HYSA auto-categorize, Katherine's "Item ID/Type/Price/Status" column format, duplicate review list in sync result
- Models: `backend/app/models/`
  - `user.py`, `account.py`, `transaction.py`, `category.py`, `recurring_rule.py`
  - `balance_snapshot.py`, `life_event.py`, `scenario.py`
  - `sync_config.py` — `UserSyncConfig` (sheet_id, is_enabled, last_sync_at, last_sync_status)
  - `financial_profile.py` — `FinancialProfile`, `StudentLoan`, `InvestmentHolding`, `CompensationEvent`
  - `paystub.py` — `Paystub` model with all parsed fields including `pay_type`, `bonus_pay`
- Seed: `backend/seed/seed_data.py` — users (keaton, katherine) + categories only
- Migrations: `backend/alembic/versions/`
  - `001_initial_schema.py` — all base tables
  - `002_paystub_bonus_fields.py` — adds `pay_type` (String) and `bonus_pay` (Float) to paystubs via `batch_alter_table`
- Credentials (gitignored): `backend/credentials/google-sheets-key.json`
- PDF uploads (gitignored): `backend/uploads/paystubs/`

### Frontend
- API calls: `frontend/src/lib/api.ts` — all `fetch()` wrappers
- Types: `frontend/src/lib/types.ts` — all TypeScript interfaces matching backend schemas exactly
- Auth utils: `frontend/src/lib/auth.ts` — `login()`, `switchProfiles()`, `getAltUser()`, `storeAltProfile()`
- Layout + nav: `frontend/src/components/layout/`
  - `AppLayout.tsx` — top bar, toast notifications, ProfileSwitcher
  - `Sidebar.tsx` — desktop nav with `?` tutorial button in footer and "Get Started" link
  - `MobileNavBar.tsx` — mobile bottom nav + More drawer
  - `ProfileSwitcher.tsx` — dual-user JWT switcher (stores both tokens)
  - `TutorialModal.tsx` — 10-step app walkthrough
- UI components: `frontend/src/components/ui/`
  - `MonthDetailModal.tsx` — clickable month detail (forecast data + category breakdown)
- All pages: `frontend/src/app/`
  - `/dashboard`, `/transactions`, `/accounts`, `/budget`, `/forecast`
  - `/events`, `/scenarios`, `/alerts`, `/settings`, `/notifications`, `/login`
  - `/calendar` — spending calendar with day-level pie charts
  - `/insights` — statistical spending analysis
  - `/ai-report` — Claude-powered monthly financial report
  - `/getting-started` — interactive setup checklist
  - `/paystubs` — PDF upload, parse review form, paystub history, income transaction indicator
  - `/financial-profile` — salary, loans, holdings, compensation history

---

## Paystub → Income Transaction Flow (Implementation Detail)

When a paystub is saved (`POST /paystubs`):

```python
# In backend/app/routers/paystubs.py
def save_paystub(data: PaystubIn, db: Session, current_user: User):
    stub = Paystub(**data.dict(), user_id=current_user.id)
    db.add(stub)
    db.flush()                          # get stub.id before commit
    _create_income_transactions(stub, db)  # create linked transactions atomically
    db.commit()
    return stub
```

`_create_income_transactions()` logic:
1. Finds the user's deposit account (priority: checking → savings → hysa → paycheck → other)
2. Finds income category: bonus stubs use "Bonus" category; regular use "Salary"
3. Creates a Salary/Bonus income transaction for `net_pay` on the pay date
4. Creates an Employer 401k income transaction for `employer_401k` (if > 0)
5. Both tagged `import_source = f"paystub:{stub.id}"`

Deleting a paystub (`DELETE /paystubs/{id}`) calls `_delete_paystub_transactions()` first — removes all transactions with `import_source = f"paystub:{id}"`.

Updating a paystub (`PUT /paystubs/{id}`) deletes old transactions then recreates from new values.

**Bonus detection** in `paystub_parser.py`:
- Regex searches for "Bonus", "Supp Bonus", "Performance Bonus", "Annual Bonus", "Supplemental" in PDF text
- If `bonus_pay > 0` → `pay_type = "bonus"` else `"regular"`
- Bonus stubs get yellow badge in UI; excluded from avg-net calculation

---

## Schema Notes (do not revert)
| Feature | Backend field | Frontend field | Notes |
|---------|--------------|----------------|-------|
| Forecast month | `month` | `month` | "YYYY-MM" string |
| Forecast spending | `expenses` | `expenses` | was "spending" in early versions — never revert |
| Forecast cash | `cash` | `cash` | was "net_cash" — never revert |
| Pagination | `skip` / `limit` | `offset` / `limit` | backend uses skip, frontend sends offset |
| Balance snapshots | `/balance-snapshots?account_id=` | `getAccountSnapshots(id)` | query param, not path param |
| Import source | `import_source` on Transaction | `import_source?: string` | format: "paystub:42", "sheets:JAN2025", "csv" |
| Paystub bonus | `pay_type` + `bonus_pay` | `pay_type?: string` + `bonus_pay?: number` | added in migration 002 |

---

## API Base URL
- Local dev: `http://localhost:8000/api/v1`
- Production: `http://10.0.0.48/api/v1` (nginx `/api/` → port 8000)

---

## User Financial Data (Keaton)
_Used when building projections, profile defaults, loan trackers._

- **Salary**: ~$130,935/yr gross ($5,455.63/period × 24); net ~$3,503.78/paycheck; semi-monthly (24 pay periods/yr) — verified from March 2026 paystub
- **Student Loans** (balances as of 2026-03-18):
  - Loan 1: **$343.35** @ 4.80% — nearly paid off (~1 payment remaining)
  - Loan 2: **$1,921.40** @ 4.28% — nearly paid off (~a few months)
- **401k** (Fidelity):
  - Employee contribution: $380/paycheck (24×/yr)
  - Employer Safe Harbor: $327.34/paycheck (6% of salary) — verified from March 2026 stub; "401 Safe H" line
  - Starting balance: $68,534.76
- **IRA** (Schwab): $225/month → SWPPX + $225/month → SWISX; starting balance: $3,516.68
- **HYSA** (EverBank): 3.9% APY, $1,600/month contribution, starting balance: $12,526.74
- **Wedding**: October 2026, ~$62,702 total cost
- **Katherine**: same account types — different values; she enters in her own Financial Profile

---

## Planned Features (Not Yet Built)

### ✅ Sidebar Collapse + Display Preferences Toggle (DONE — session 6)
- Hamburger button in AppLayout header toggles sidebar open/closed, persisted to localStorage (`sidebarOpen`)
- Main content margin adjusts when sidebar is hidden (`md:ml-0` vs `md:ml-[220px]`)
- Settings page → "Display Preferences" card with toggle to show/hide "Get Started" in sidebar
- Uses custom `muni:settingsChanged` DOM event for same-tab sync + `storage` event for cross-tab

### ✅ Getting Started Auto-Update + Cleanup (DONE — session 6)
- `visibilitychange` listener re-fetches completion status when user returns to tab
- Removed "Connect a checking account" step
- `load` converted to `useCallback` for proper dependency tracking

### ✅ Student Loan Auto-Import in Financial Profile (DONE — session 6)
- `student_loan` account types show as importable in Financial Profile → Loans section
- Orange banner with per-account import buttons pre-fills name, balance, institution
- Unlinked accounts detected by lowercased name comparison

### ✅ PWA Home Screen Icon (DONE — session 6)
- `icon.tsx` — 192×192 green (#10B981) MUNI favicon via `ImageResponse`
- `apple-icon.tsx` — 180×180 Apple touch icon for iOS home screen
- `icon-512/route.tsx` — 512×512 edge route for Android PWA install (must be `.tsx` not `.ts`)
- `manifest.ts` — PWA manifest with standalone display, green theme
- `layout.tsx` — `Viewport` export, `appleWebApp` metadata, manifest link

### ✅ Bulk Paystub Upload (DONE — `feature/paystub-income-sync`)
- Multi-file drop, multi-file picker (`multiple` on `<input>`), **folder drop** (FileSystem API `webkitGetAsEntry()` traversal), and **folder picker** (`webkitdirectory` input)
- Single file → goes to existing single ReviewForm (review all fields before saving)
- Multiple files → `BatchQueueView`: parses sequentially, shows each stub status (queued/parsing/done/saved/error/skipped)
- Per-stub actions: inline Edit (4-field quick form), Skip, Save; global "Save All" saves all parsed non-skipped stubs
- File references stored in `window.__paystubFiles__` Map to avoid serialization issues
- Progress summary strip: X parsing / X ready / X saved / X skipped / X errors

### ✅ Session 7 Fixes (DONE — 2026-03-23)
- **Employer 401k routing**: employer 401k contribution now posts to 401k account (not checking); excluded from income totals in dashboard, forecast, and all income calculations
- **G&P paystub bonus fix**: `paystub_parser.py` regex rewritten — G&P 3-col format (hours+amount+YTD or lone-YTD) handled correctly; bonus requires two numbers (period+YTD), lone YTD carry-forwards ignored; `regular_pay == 0` required to classify as bonus
- **Forecast blank categories**: recurring rules now supplement historical averages — categories with no transaction history but active recurring rules now appear in predictions
- **Life Events Clear All**: bulk DELETE `/events` endpoint added; "Clear All" button with confirm dialog on events page
- **Mobile delete button**: Trash2 delete button added to mobile transaction cards
- **Date filter labels**: iOS date inputs now have visible labels (placeholder doesn't show on iOS)
- **Net Worth excl. HYSA**: dashboard net worth card shows a second figure excluding HYSA balance
- **Dashboard income label**: clarified as net (after taxes/deductions)
- **3-month spending average**: trailing 3-month avg shown as note under current month spending stat
- **Monthly flow bar labels**: short month abbreviations; Jan gets year suffix (e.g. "Jan '26")
- **Spending pie chart overflow**: reduced label radius; container gets `overflow-hidden`
- **Google Sheets HYSA auto-categorize**: descriptions containing "hysa"/"everbank"/"high yield" auto-categorize as Savings Transfer
- **Google Sheets upsert**: if a sheets transaction's amount changed in the sheet, it updates in app
- **Google Sheets Katherine format**: `"item id"` column alias added; `"roth"`/`"roth ira"` → Savings Transfer category; her MAR2026/FEB2026 tab format already supported by existing regex
- **Google Sheets dupe review**: sync result shows expandable list of skipped duplicates (date, description, amount, source tab)
- **App name**: version string updated to MUNI v0.3

### Balance Snapshots — Edit/Delete
- The retroactive balance snapshots added to accounts need to be editable and removable
- Currently they are append-only in the UI

### Joint HYSA (Keaton + Katherine)
- `is_joint` + `joint_user_id` on accounts table
- "Joint" badge in UI; both users see it; not double-counted in combined view
- Alembic migration needed

### Compensation History
- Log raises, bonuses, awards, stipends via Financial Profile → Compensation tab
- `CompensationEvent` model already partially designed — see `NEXT_PHASE_PLAN.md`
- ✅ Model and API already built as part of Feature 25; UI still needs polish

### Historical Investment Statements
- Manual entry form for 401k/IRA quarterly statements (beginning/ending balance, contributions, gains)
- `InvestmentStatement` model — see `NEXT_PHASE_PLAN.md`

---

## Run Locally (no Docker)
```bash
# Terminal 1 — Backend
cd backend
venv\Scripts\activate          # Windows
# source venv/bin/activate     # Mac/Linux
uvicorn app.main:app --reload --port 8000

# First-time only (fresh database):
# alembic upgrade head
# python seed/seed_data.py

# Terminal 2 — Frontend
cd frontend
npm run dev
```
Open http://localhost:3000 — click Keaton or Katherine to log in (no password)

---

## Common Issues
- `ModuleNotFoundError: email_validator` → `pip install "pydantic[email]"` or `pip install -r requirements.txt`
- `'next' is not recognized` → run `npm install` in `frontend/` first
- `bcrypt version error` in passlib → `pip install bcrypt==4.0.1` (already pinned in requirements.txt)
- `seed_data.py` fails "already seeded" → delete `backend/finance.db` and re-run
- Login fails on production → DB empty; run the re-seed command in the Production section above
- `npm EACCES permission denied` after git reset → `chown -R muni:muni /opt/muni/app`
- Windows venv committed accidentally → `git rm -r --cached backend/venv/` then commit
- Google Sheets sync "credentials not found" → copy `google-sheets-key.json` to `backend/credentials/`
- Alembic `KeyError` on migration IDs → check `down_revision` matches the previous migration's revision string exactly (use short form like `"001"` not `"001_initial_schema"`)
