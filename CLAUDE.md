# Muni — Claude Project Context
_Last updated: 2026-03-29 (session 10). Active branch: `main`._

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

## Git State (as of 2026-03-29)
- **Active branch**: `main` — all session 10 features merged
- **Branches**:
  - `main` — production-ready, working branch
  - `feature/ios-redesign` — full visual redesign experiment (jade green, DM Serif, iOS nav); NOT merged — needs local review before deciding
- **Workflow**: develop on `feature/*` branch → merge to `main` → `muni-deploy` on server
- **Branch history (all merged into main)**:
  - `dev` — Docker, cleanup, bug fixes
  - `feature/insights` — calendar, insights, profile switcher, tutorial, getting started
  - `feature/mobile-ai-reports` — AI report page, email notifications
  - `feature/paystub-income-sync` — paystub → income transaction auto-creation, bulk upload
  - `feature/todo-fixes` — session 7 sheets + dupe-review fixes
  - `feature/ux-fixes` — session 6 UX improvements
  - `feature/data-import-and-paystubs` — import scripts, test suite, joint labels, MonthlyFlowCard scroll
  - `feature/session-9-todo` — session 9 features
  - `feature/statement-import` — statement PDF import for balance snapshots (session 10)

---

## How Data Gets Into the App

### Income → Paystub PDFs
1. User uploads a Paylocity PDF at `/paystubs`
2. Backend (`paystub_parser.py`) uses **pdfplumber** to extract all fields via regex — free, no API needed
3. User reviews the pre-filled form, corrects any fields, hits **Save**
4. On save, backend automatically creates:
   - A **Salary** (or **Bonus**) income transaction for `net_pay` posted to the user's checking account on the pay date
   - An **Employer 401k** income transaction for `employer_401k` posted to 401k account (not checking)
   - Both transactions tagged `import_source = "paystub:{id}"` for traceability
5. Deleting a paystub removes its transactions too
6. Updating a paystub (`PUT /paystubs/{id}`) deletes old transactions then recreates from new values

### Expenses → Google Sheets Sync
1. User enters their Google Sheet ID in **Settings → Google Sheets Sync**
2. APScheduler polls the sheet every 30 minutes (or manual "Sync Now")
3. Each monthly tab is read (format: `Jan 2025`, `Feb 2025`, etc.)
4. Rows are mapped: `Date` → date, `Description`/`Expense` → description, `Amount` → amount
5. **Income detection**: if category label contains income/salary/freelance/wages/commission/stipend → amount kept positive, mapped to "Salary" or "Side Income" category (NOT negated as expense)
6. **HYSA auto-detect**: descriptions containing "hysa"/"everbank"/"high yield" → "Savings Transfer" category
7. Deduplication by hash of (date + description + amount) — safe to sync repeatedly
8. Upsert: if a sheet row's amount changes, the app transaction updates on next sync
9. Service account credentials: `backend/credentials/google-sheets-key.json` (gitignored)
10. Keaton's sheet ID: `1zq-UuBUmZIx70lM_EYajSv3suXwUaMDjhxuW4m-Eqac`
11. Katherine's format: Item ID/Type/Price/Status columns; roth/roth ira → Savings Transfer

### Account Snapshots → Statement PDFs
1. User goes to `/statements` and uploads one or more PDF statements
2. Backend (`statement_parser.py`) uses **pdfplumber** to extract institution, date, and ending balance
3. Supported institutions: **EverBank** (HYSA), **John Hancock** (401k), **Charles Schwab** (IRA/brokerage)
4. Account is auto-matched by type (HYSA → EverBank, 401k → JH, IRA/brokerage → Schwab)
5. User reviews pre-filled form, adjusts account/date/balance if needed, hits **Save Snapshot**
6. Calls existing `POST /balance-snapshots` — no new DB model needed
7. Parser handles whitespace-stripped PDFs; picks the *last* "Total Value on" line for JH (ending, not beginning)

### Backfill → CSV/Excel Import
- `Transactions → Import` accepts CSV with Date, Description, Amount columns
- Columns are auto-mapped; import source tagged `"csv"`
- Full Excel import utility in `backend/import/` — auto-discovers account/category IDs, README included
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
9. ✅ **Test suite** — `backend/tests/` covers all endpoints (934 lines, 100% pass rate)

### App Features
10. ✅ **Dashboard** — net worth card (expandable with HYSA-excluded figure + asset/liability breakdown), quick stats, accounts grid, monthly flow chart (clickable, scrollable to earliest transaction), spending by category, forecast preview, upcoming events, alerts card, recent transactions
11. ✅ **Transactions** — paginated list, CSV/XLSX import, add/edit/delete, filter by date/account/category/search, export CSV; mobile delete button always visible
12. ✅ **Accounts** — CRUD, balance history chart, backdated snapshot entry, joint badge; account types: checking/savings/hysa/brokerage/ira/401k/hsa/credit_card/student_loan/car_loan/mortgage/other
13. ✅ **Budget** — categories with `budget_amount`, recurring rules, spending vs budget comparison, over-budget alerts, 3-month avg spending estimate hint per category
14. ✅ **Forecast** — 60-month net worth + cash flow charts (both clickable months → `MonthDetailModal`), category contribution table, scenario selector; income labeled as "net (after taxes & deductions)"
15. ✅ **Life Events** — CRUD (name, type, start/end dates, total cost, monthly breakdown, active toggle); bulk "Clear All" with confirm dialog
16. ✅ **What-If Scenarios** — clone baseline, compare two scenarios side-by-side
17. ✅ **Alerts** — over-budget categories + upcoming event payments with severity levels
18. ✅ **Spending Calendar** (`/calendar`) — monthly grid with day-level pie charts, click day for transaction detail
19. ✅ **Spending Insights** (`/insights`) — health scorecard, trend analysis, z-score anomaly detection, debt payoff scenarios
20. ✅ **AI Financial Report** (`/ai-report`) — Claude-powered monthly analysis via Anthropic API
21. ✅ **Notifications** (`/notifications`) — weekly email digest + balance snapshot reminder; SMTP config, preview + send now; snapshot reminder lists stale accounts with days-since-update and why it matters; auto-sends Sundays 10am
22. ✅ **Google Sheets Sync** — Settings page: paste Sheet ID, auto-polls every 30 min, manual Sync Now; duplicate review (expandable skipped rows); upsert; HYSA auto-categorize; income row detection; Katherine's column format; dupe review with reason
23. ✅ **Tutorial modal** — `?` button in sidebar footer → 10-step app walkthrough including Joint View step
24. ✅ **Getting Started** (`/getting-started`) — interactive setup checklist (auto-completes as data is added), progress bar, quick links
25. ✅ **Paystubs** (`/paystubs`) — upload Paylocity or G&P PDF → pdfplumber parses all fields → review form (single) or BatchQueueView (multi/folder) → save → auto-creates income transactions; bonus detection; YTD stats; avg net excludes bonus stubs
26. ✅ **Financial Profile** (`/financial-profile`) — salary/pay frequency/net per paycheck (with "Auto-calculate from paystubs" button), HYSA APY + contributions, IRA contributions, student loans (per-loan balance/rate/payment), investment holdings (ticker/fund/value/contribution/return), compensation history
27. ✅ **Joint accounts** — `is_joint` flag on accounts; "Joint" badge on AccountCard; checkbox in AccountForm; both users can see joint accounts; `is_joint`/`joint_user_id` columns added inline on startup
28. ✅ **Balance snapshot reminder email** — `build_snapshot_reminder_html()` in email_service; lists stale accounts by type with last-updated date, days-ago, why it matters; scheduler job every Sunday 10am; preview + manual send on Notifications page
29. ✅ **Statement import** (`/statements`) — upload EverBank/John Hancock/Schwab PDFs → pdfplumber parser extracts institution, date, ending balance → review form with auto-matched account selector → saves via POST /balance-snapshots; supports batch upload

---

## Key File Locations

### Backend
- Entry point: `backend/app/main.py` — FastAPI app, CORS, router registration, lifespan (APScheduler: sheets sync 30min, weekly digest Mon 8am, snapshot reminder Sun 10am)
- Routers: `backend/app/routers/`
  - `auth.py` — `/auth/switch/{username}` (no-password JWT login)
  - `dashboard.py` — `/dashboard` aggregated response; `flow_months` goes back to earliest transaction date (up to 60mo)
  - `transactions.py` — CRUD, CSV/XLSX import, filters, pagination (skip/limit)
  - `accounts.py` — account CRUD; queries own + joint accounts
  - `balance_snapshots.py` — `/balance-snapshots?account_id=` (chart data)
  - `categories.py` — category CRUD + budget amounts
  - `budget.py` — `/budget/summary` (spending vs budget); `/budget/estimates` (3-month avg per category)
  - `forecast.py` — 60-month projection engine endpoint
  - `events.py` — life events CRUD + bulk DELETE `/events`
  - `scenarios.py` — scenario CRUD + clone
  - `alerts.py` — budget + event alerts
  - `import_data.py` — CSV/XLSX import
  - `sync.py` — `/sync/google-sheets/config` (GET/PUT) + `/sync/google-sheets/run` (POST)
  - `financial_profile.py` — GET/PUT profile; `/financial-profile/infer-salary` (auto-calc from paystubs); sub-routes for `/loans`, `/holdings`, `/compensation`
  - `paystubs.py` — POST `/paystubs/parse`, POST `/paystubs` (save+create transactions), GET `/paystubs`, DELETE `/paystubs/{id}`, PUT `/paystubs/{id}` (recreates transactions)
  - `notifications.py` — email digest config + send; `/notifications/snapshot-preview` GET; `/notifications/send-snapshot` POST
  - `ai_report.py` — Claude API monthly report
  - `joint.py` — joint view transaction list with `owner` field for color-coded display
  - `statements.py` — `POST /statements/parse` — upload PDF, returns parsed institution/date/balance
- Services: `backend/app/services/`
  - `forecasting.py` — 60-month projection engine (historical avgs + recurring rules + life events + debt amortization + investment growth)
  - `statement_parser.py` — pdfplumber + regex for EverBank, John Hancock, Schwab statements; `parse_statement(pdf_path)` returns `ParsedStatement` dataclass; handles whitespace-stripped PDFs; JH uses `findall` + last match to get ending (not beginning) balance
  - `paystub_parser.py` — pdfplumber + regex for Paylocity AND G&P (Grimm & Parker); bonus detection (requires period+YTD pair, lone YTD carry-forwards ignored); `pay_type = "bonus"` only when `bonus_pay > 0` and `regular_pay == 0`; employee 401k: tries `401K`, `401(k)`, `401K-EE`, `Employee 401k`; employer 401k: tries `401 Safe H`, `401K-ER`, `Employer 401k`, `401(k) Match/Employer`
  - `google_sheets_sync.py` — sheets API, tab parsing, SHA-256 dedup, upsert, HYSA auto-categorize, income row detection (salary/freelance → keeps positive, maps to Salary/Side Income), Katherine's format, duplicate review list
  - `email_service.py` — weekly digest + snapshot reminder (`build_snapshot_reminder_html`, `send_snapshot_reminder_for_user`, `send_snapshot_reminders_all`); stale threshold: 35 days for monthly accounts, 95 days for quarterly
- Models: `backend/app/models/`
  - `user.py`, `account.py` (has `is_joint`, `joint_user_id`), `transaction.py`, `category.py`, `recurring_rule.py`
  - `balance_snapshot.py`, `life_event.py`, `scenario.py`
  - `sync_config.py` — `UserSyncConfig` (sheet_id, is_enabled, last_sync_at, last_sync_status)
  - `financial_profile.py` — `FinancialProfile` (field: `gross_annual_salary` — NOT `salary`), `StudentLoan`, `InvestmentHolding`, `CompensationEvent`
  - `paystub.py` — `Paystub` model with all parsed fields including `pay_type`, `bonus_pay`
- Seed: `backend/seed/seed_data.py` — users (keaton, katherine) + categories only
- Import utility: `backend/import/` — Excel/CSV historical import scripts with auto-discovery of account/category IDs; includes README and testing guide
- Tests: `backend/tests/` — full endpoint test suite (934 lines)
- Migrations: `backend/alembic/versions/`
  - `001_initial_schema.py` — all base tables
  - `002_paystub_bonus_fields.py` — adds `pay_type` (String) and `bonus_pay` (Float) to paystubs
  - `003_home_buying_profiles.py` — home buying profile fields; `down_revision = "002"`
- Credentials (gitignored): `backend/credentials/google-sheets-key.json`
- PDF uploads (gitignored): `backend/uploads/paystubs/`

### Frontend
- API calls: `frontend/src/lib/api.ts` — all fetch wrappers including: `getBudgetEstimates`, `inferSalaryFromPaystubs`, `getSnapshotReminderPreview`, `sendSnapshotReminderNow`, `parseStatement`, `createBalanceSnapshot`
- Types: `frontend/src/lib/types.ts` — all TypeScript interfaces; `FinancialProfile` uses `gross_annual_salary` (not `salary`)
- Auth utils: `frontend/src/lib/auth.ts` — `login()`, `switchProfiles()`, `getAltUser()`, `storeAltProfile()`
- Layout + nav: `frontend/src/components/layout/`
  - `AppLayout.tsx` — top bar, toast notifications, ProfileSwitcher
  - `Sidebar.tsx` — desktop nav with `?` tutorial button in footer and "Get Started" link
  - `MobileNavBar.tsx` — mobile bottom nav + More drawer
  - `ProfileSwitcher.tsx` — dual-user JWT switcher (stores both tokens)
  - `TutorialModal.tsx` — 10-step app walkthrough (includes Joint View step)
- Dashboard components: `frontend/src/components/dashboard/`
  - `MonthlyFlowCard.tsx` — horizontally scrollable bar chart; auto-scrolls to current month; current month highlighted with ReferenceLine; forecast months have reduced opacity; fed `flowMonths` prop from dashboard (dynamic months_back)
  - `NetWorthCard.tsx` — expandable; shows HYSA-excluded figure; total assets/liabilities breakdown; uses `mode` from `useViewMode()`
- Accounts: `frontend/src/components/accounts/`
  - `AccountCard.tsx` — shows blue "Joint" badge when `is_joint=true`
  - `AccountForm.tsx` — Joint account checkbox; student loan sync option (create Financial Profile loan entry when adding new student_loan account)
- UI components: `frontend/src/components/ui/`
  - `MonthDetailModal.tsx` — clickable month detail (forecast data + category breakdown)
- All pages: `frontend/src/app/`
  - `/dashboard`, `/transactions`, `/accounts`, `/budget`, `/forecast`
  - `/events`, `/scenarios`, `/alerts`, `/settings`, `/notifications`, `/login`
  - `/calendar` — spending calendar with day-level pie charts
  - `/insights` — statistical spending analysis
  - `/ai-report` — Claude-powered monthly financial report
  - `/getting-started` — interactive setup checklist
  - `/paystubs` — single ReviewForm (1 file) or BatchQueueView (multi/folder upload)
  - `/financial-profile` — salary (with auto-calculate button), loans, holdings, compensation history
  - `/notifications` — weekly digest + snapshot reminder (stale account list + manual send)
  - `/statements` — upload EverBank/JH/Schwab PDFs, review parsed results, save balance snapshots

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
3. Creates a Salary/Bonus income transaction for `net_pay` on the pay date → checking/savings account
4. Creates an Employer 401k income transaction for `employer_401k` (if > 0) → 401k account
5. Both tagged `import_source = f"paystub:{stub.id}"`

Deleting a paystub (`DELETE /paystubs/{id}`) calls `_delete_paystub_transactions()` first.
Updating a paystub (`PUT /paystubs/{id}`) deletes old transactions then recreates from new values.

**Bonus detection** in `paystub_parser.py`:
- G&P carries YTD bonus on EVERY subsequent stub — fix requires TWO numbers (period + YTD) after keyword
- `pay_type = "bonus"` only when `bonus_pay > 0` AND `regular_pay == 0`
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
| Financial profile salary | `gross_annual_salary` | `gross_annual_salary` | frontend type also has `salary?` as legacy alias — always write to `gross_annual_salary` |
| Joint accounts | `is_joint` + `joint_user_id` | `is_joint?: boolean` | columns added inline on startup; no separate migration file needed |

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

## Keaton's Money Flow & Account Structure
_Established 2026-03-24. Use when advising on account setup, forecasting, or sync behavior._

**Flow**: Paycheck → BofA Savings (direct deposit) → BofA Checking (pass-through) → Chase CC + Discover CC (purchases) → paid back to BofA

**Accounts to track in app:**
| Account | Type | Snapshot needed? |
|---|---|---|
| BofA Savings | `savings` | Yes — monthly, cash hub |
| BofA Checking | `checking` | No — Google Sheet captures all spending through it |
| Chase Credit Card | `credit_card` | No — paid in full monthly, pass-through |
| Discover Credit Card | `credit_card` | No — paid in full monthly, pass-through |
| 401k (Fidelity) | `retirement_401k` | Yes — market drift, update quarterly |
| IRA (Schwab) | `ira` | Yes — market drift, update quarterly |
| HYSA (EverBank) | `hysa` | Yes — interest compounds monthly |
| Student Loans | `student_loan` | Yes — confirm when they hit $0 |

**Key decisions:**
- Credit card accounts are NOT tracked — paid in full monthly, no meaningful standing balance
- BofA Checking does NOT need balance snapshots — all spending flows through Google Sheet sync already
- Neither Keaton nor Katherine record credit card payments in their Google Sheets — no double-counting risk
- Google Sheets track actual purchases only (not CC payments or internal transfers)

## Katherine's Setup
- **Employer**: G&P (Grimm & Parker) — paystub format differs from Paylocity; parser has fallback patterns
- **Side income**: Freelance graphic design — entered in her Google Sheet under an income category (e.g. "Income", "Freelance"); sync detects this and creates positive income transactions instead of negating
- **Taxes**: Records income taxes paid as expense under "Taxes" category in her sheet
- **Rent**: Keaton pays $2,075 total rent; Katherine pays him back $1,075; Keaton's net cost ~$1,000 + electricity + internet. Neither records CC payments or internal transfers in their sheets.
- **HYSA**: Both Keaton and Katherine contribute to the same EverBank HYSA. Currently Keaton owns the HYSA account in the app. Joint HYSA model (so her contributions apply to the same account without double-counting) is not yet fully implemented — see Planned Features.

---

## Session 10 Changes (2026-03-29)

### New Features
- **Statement import** (`/statements`) — upload EverBank, John Hancock, and Schwab PDF statements to auto-create balance snapshots; drag-and-drop batch upload, pre-matched accounts, editable review form

### New Backend
- `POST /statements/parse` — accepts PDF upload, returns `{ institution, account_type_hint, account_label, statement_date, ending_balance, account_number_hint }`
- `backend/app/services/statement_parser.py` — parser with 3 institution handlers; tested against all 18 actual statement PDFs

### Bug Fixes
- **`ANTHROPIC_API_KEY` not loading** — pydantic Settings had `extra=forbid`; adding key to `.env` crashed the backend with a validation error. Fixed by declaring `ANTHROPIC_API_KEY: str = ""` in `config.py`
- **Financial profile build error** — `LoansSection` was missing required `accounts` prop at call site in `financial-profile/page.tsx`

### Production Config — Anthropic API Key
Set in `/opt/muni/app/backend/.env` on the server:
```
ANTHROPIC_API_KEY=sk-ant-...
```
`ANTHROPIC_API_KEY` is now declared in `Settings` (defaults to `""`) so the backend starts cleanly whether or not the key is present.

---

## Session 9 Changes (2026-03-27)

### New Backend Endpoints
- `GET /budget/estimates?months=3` — returns N-month average spending per expense/savings category (excludes current month)
- `GET /financial-profile/infer-salary` — averages recent regular (non-bonus) paystubs; returns avg net/gross per paycheck, inferred annual salary, detected pay frequency
- `GET /notifications/snapshot-preview` — returns list of stale accounts for snapshot reminder preview
- `POST /notifications/send-snapshot` — manually triggers snapshot reminder email

### New Scheduler Jobs
- **Snapshot reminder**: every Sunday at 10:00 AM — emails users with stale account balances

### Key Bug Fixes
- **`gross_annual_salary` field name**: frontend was sending `salary` but backend expects `gross_annual_salary` — now correctly reads and writes; `FinancialProfile` type has both (`gross_annual_salary` primary, `salary` as legacy alias)
- **Google Sheets income rows**: positive amounts were being negated even when category = income/salary/freelance; now detected and kept positive, mapped to appropriate income category
- **Katherine's 401k parsing**: parser now tries 4 fallback patterns per 401k field type to handle non-Paylocity formats

### Branch Cleanup (2026-03-27)
Cleaned up 6 stale/empty branches. Kept only:
- `main` — all work merged here
- `feature/ios-redesign` — pending review (full visual redesign, not ready)

---

## Planned Features (Not Yet Built)

### Mobile Transactions Page Redesign
- Current layout is functional but hard to use on mobile
- Needs: better filter UI (collapsible), swipe actions, cleaner card layout

### Joint HYSA — Full Shared Account Model
- `is_joint` + `joint_user_id` columns already exist on accounts table
- "Joint" badge and checkbox already in UI
- Still needed: Katherine's HYSA contributions should apply to Keaton's HYSA account without double-counting in combined/joint net worth view
- Currently: Keaton owns the HYSA account; Katherine should NOT create a separate HYSA account

### Balance Snapshots — Edit/Delete
- Retroactive balance snapshots are append-only in the UI
- Need to be able to correct or remove wrong entries

### Compensation History Polish
- `CompensationEvent` model and API already built (Feature 26)
- UI in Financial Profile → Compensation tab needs polish

### Historical Investment Statements
- Manual entry form for 401k/IRA quarterly statements (beginning/ending balance, contributions, gains)
- `InvestmentStatement` model planned

### iOS Redesign (`feature/ios-redesign`)
- Full visual redesign: jade green base, DM Serif Display fonts, iOS-style nav bubbles, frosted glass
- Built but NOT merged — preview with `git checkout feature/ios-redesign` before deciding

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
- `gross_annual_salary` not saving in Financial Profile → ensure frontend sends `gross_annual_salary` not `salary`
- Backend crashes on startup with `pydantic_core.ValidationError: ANTHROPIC_API_KEY Extra inputs are not permitted` → add `ANTHROPIC_API_KEY: str = ""` to `Settings` in `config.py` (already fixed in main)
- Statement parser returns `None` for balance/date → check pdfplumber can extract text; some PDFs strip spaces between words — parser handles EverBank/JH/Schwab known formats
