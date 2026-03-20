# Muni — Complete Setup & Data Entry Guide

This guide tells you exactly what to do, in what order, to get the app fully populated
with accurate historical data and working correctly for ongoing use.

---

## The Three Data Sources

| Source | What it covers | How it enters the app |
|--------|---------------|----------------------|
| **KK Finances Rework.xlsx** | Historical data Sep 2024 – Aug 2025 (paystubs, account balances, student loan payments, bonuses) | One-time import script (`import_xlsx.py`) |
| **Keaton Monthly Spending Google Sheet** | Ongoing transactions (expenses, income) — the accurate per-transaction record | Google Sheets sync (Settings → auto-polls every 30 min) |
| **Katherine Monthly Spending Google Sheet** | Same as above for Katherine | Same Google Sheets sync |

> **Rule of thumb:** If a number is in both the Rework sheet AND the monthly spending
> Google Sheet, the Google Sheet wins — it has the actual transaction detail. The Rework
> sheet fills in history that predates your Google Sheets setup.

---

## Phase 1 — First-Time Setup

### 1.1 Create accounts

Log in as **keaton** → go to `/accounts` → "Add Account" for each:

| Account Name | Type | Starting Balance | Notes |
|---|---|---|---|
| Keaton Checking | Checking | $0 (set from transactions) | |
| Keaton Savings | Savings | $0 | |
| EverBank HYSA | HYSA | $12,526.74 | Your starting HYSA balance |
| Keaton 401k | 401k | $68,534.76 | Balance as of Jan 2025 |
| Keaton IRA | IRA | $3,516.68 | Balance as of Jan 2025 |
| Keaton Student Loans | Student Loan | $0 | Will set balance snapshot after import |

Log out → log in as **katherine** → go to `/accounts` → "Add Account" for each:

| Account Name | Type | Starting Balance | Notes |
|---|---|---|---|
| Katherine Checking | Checking | $0 | |
| Katherine Savings | Savings | $0 | |
| Katherine 401k | 401k | $0 (enter her value) | |
| Katherine IRA | IRA | $0 (enter her value) | |
| Katherine Student Loans | Student Loan | $0 | Paid off Sep 2025; create for history |

> Note on HYSA: EverBank HYSA is a joint account. Create it under **keaton**. Katherine
> can see and contribute to it via the joint account feature (coming soon / configure in
> account settings with `is_joint=true`).

---

### 1.2 Add Financial Profile data

Go to `/financial-profile` (Settings → Financial Profile) for each user:

**Keaton:**
- Salary: $130,935/yr gross | $5,455.63/paycheck | Semi-monthly (24/yr)
- 401k contribution: $380/paycheck employee | $327.34/paycheck employer (6% safe harbor)
- HYSA contribution: $1,600/month
- IRA contributions: $225/month → SWPPX | $225/month → SWISX (2 holdings)

**Katherine:**
- Enter her salary, 401k, and IRA numbers (she knows them)

---

### 1.3 Add Recurring Rules

Go to `/budget` → "Recurring Rules" → add rules so the forecast knows what to expect:

**Keaton recurring (monthly):**
- HYSA contribution: $1,600/month (savings transfer)
- IRA contribution: $450/month ($225 × 2)
- Student loan payment: $800/month until payoff (~Mar 2026)

**Katherine recurring:**
- Her equivalents

---

## Phase 2 — Run the Historical Import

### 2.1 Start the backend

```bash
cd C:\Users\keato\financeTool\backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

### 2.2 Dry run first

```bash
cd backend\import
python import_xlsx.py --dry-run
```

Review the output:
- Paystubs: 7 Keaton entries, 1 Katherine entry — check dates/amounts match the actual paystubs
- Balance snapshots: Jan 2025 and Mar 2025 balances — check against your actual accounts
- Monthly income: Sep 2024 – Jan 2025 — rough totals (Google Sheets replaces these once synced)
- Student loan payments: Sep 2024 – Jan 2025 for both users
- Bonuses: any months with non-zero bonus values

### 2.3 Run the live import

```bash
python import_xlsx.py
```

Script is idempotent — safe to re-run. Already-imported records are skipped.

### 2.4 Add student loan starting balance snapshots

After the import completes, go to `/accounts` and add a balance snapshot for each
student loan account so the balance history chart is accurate:

**Keaton Student Loans:**
- Go to `/accounts` → click "Keaton Student Loans" → "Add Snapshot"
- Date: `2024-09-01`
- Balance: your actual combined loan balance as of Sep 2024
  (check your servicer — Keaton's was roughly ~$12,000–14,000 in Sep 2024)

**Katherine Student Loans:**
- Date: `2024-09-01`
- Balance: her combined loan balance as of Sep 2024
  (she paid off in Sep 2025, so the balance should reach $0 by then)

---

## Phase 3 — Connect Google Sheets (Ongoing Transactions)

This is the accurate, per-transaction data source. Once connected, it replaces the
rough monthly income totals the import created for Sep 2024–Jan 2025.

### 3.1 Get Google service account credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a project (or use existing)
3. Enable the **Google Sheets API**
4. Create a **Service Account** → download the JSON key
5. Copy the JSON key to: `backend/credentials/google-sheets-key.json`
6. Share your spending Google Sheet with the service account email
   (it looks like `something@project-id.iam.gserviceaccount.com`)

### 3.2 Connect in the app

Go to `/settings` → Google Sheets Sync:
- Enter your Keaton monthly spending Sheet ID (from the URL: `docs.google.com/spreadsheets/d/SHEET_ID/`)
- Click Connect → it will auto-sync every 30 minutes

Repeat for Katherine if she has a separate sheet.

### 3.3 What happens after sync

New transactions from the Google Sheet will show up in `/transactions`. The monthly
spending sheet has actual transaction-level data (merchants, categories, amounts) that
is far more accurate than the Rework sheet's monthly totals.

For the historical period (Sep 2024–Jan 2025):
- The import created rough monthly income totals
- Once you have accurate Google Sheets data for those months, delete the rough monthly
  totals (`Monthly income Sep 2024 (xlsx import)` etc.) via `/transactions` → search
  for "xlsx import" → delete those entries
- Or leave them — they're useful for the cash flow charts even as approximations

---

## Phase 4 — Add Paystubs Going Forward

Each time you receive a paystub (semi-monthly for Keaton):

1. Go to `/paystubs`
2. Click "Upload Paystub" (PDF)
3. Review the parsed fields — the PDF parser extracts gross, net, all taxes, 401k, etc.
4. Confirm → it saves to the database

For **bonuses**: when you receive a bonus, go to `/transactions` → "Add Transaction":
- Date: the date it hit your account
- Amount: bonus amount (net after tax)
- Category: Bonus
- Description: e.g. "Q1 2026 performance bonus"

---

## Phase 5 — What Each App Section Shows

### Dashboard
Shows: net worth, this month's cash flow (income vs expenses), account balances grid,
spending donut chart, forecast preview, recent transactions, upcoming life events.

**What makes it accurate:** Having all accounts populated (Phase 1.1) + transactions
synced from Google Sheets (Phase 3) + paystubs entered (Phase 4).

### Accounts (`/accounts`)
Shows each account's current balance and a historical balance chart.

**For student loans:** The chart shows the balance declining as payment transactions
post against the account each month. The starting balance snapshot you added in
Phase 2.4 is the anchor point.

**For 401k/IRA:** Add balance snapshots quarterly (or whenever you check your statements)
to see the growth trend. The forecast extrapolates from the most recent snapshot.

### Transactions (`/transactions`)
Shows all transactions with filters by date, account, category.

**To find and clean up import data:** Filter by description containing "xlsx import"
to see everything the script posted. Delete anything that's now covered more accurately
by Google Sheets.

### Paystubs (`/paystubs`)
Shows all saved paystubs in a timeline with gross/net/taxes. Useful for year-over-year
comparisons and verifying tax withholding.

### Budget (`/budget`)
Shows spending vs budget by category, recurring rules, and alerts when you're over budget.

**Set up budget amounts:** Go to each category → set a monthly budget_amount.
Start with your monthly spending sheet data to figure out realistic numbers.

### Forecast (`/forecast`)
60-month projection of net worth and cash flow. Driven by:
- Your current account balances
- Recurring income rules (salary via Financial Profile)
- Recurring expense rules
- Life events (wedding, home purchase, etc.)

**Wedding:** Go to `/events` → "Add Event":
- Name: "Wedding"
- Date: October 2026
- Estimated cost: $62,702
- Category: Wedding

The forecast will show the dip in savings around Oct 2026 and the recovery after.

### Insights (`/insights`)
Statistical analysis of your spending — health scorecard, trend detection, anomaly
alerts when a month's spending in any category is unusually high.

**Best after:** Several months of Google Sheets sync data, so there's enough history
to compute z-scores and trends.

### AI Report (`/ai-report`)
Claude-powered monthly financial summary. Tells you: how this month compared to last,
biggest changes, what's on track / off track, suggested actions.

---

## Data Quality Checklist

After completing Phases 1–3, verify these in the app:

- [ ] **Net worth** on dashboard is roughly correct (your assets minus loans)
- [ ] **Keaton Checking** account shows a realistic balance
- [ ] **HYSA balance** matches EverBank (≈$12,500 Sep 2024 → growing by $1,600/mo)
- [ ] **Student loan history** shows declining balance → $0 for Katherine
- [ ] **Paystubs page** shows 7 Keaton entries (Feb–Aug 2025)
- [ ] **Bonus transactions** appear in transactions list for months you had bonuses
- [ ] **Forecast** shows the wedding dip in Oct 2026
- [ ] **Dashboard cash flow chart** has bars back to Sep 2024

---

## Common Questions

**Q: I see duplicate transactions after syncing Google Sheets — what happened?**
A: The monthly income totals from the import overlap with Google Sheets data for the
same months. Filter transactions by "xlsx import" in the description and delete the
rough totals for any month that the Google Sheet covers.

**Q: The student loan balance on the account page doesn't match reality — what do I do?**
A: Add a balance snapshot for today with the actual current balance. The chart will
anchor to that point and show the historical trajectory from your Sep 2024 starting
snapshot.

**Q: I want to delete all imported data and start fresh.**
A: Delete `backend/finance.db` and re-run:
```bash
alembic upgrade head
python seed/seed_data.py
```
Then re-run the import after recreating accounts.

**Q: Katherine's data looks incomplete — what's missing?**
A: Katherine has 1 paystub imported (Mar 2025). For her full income history,
either set up her Google Sheets sync or manually enter transactions for the months
before the import period.
