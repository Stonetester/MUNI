# Local Testing Guide — Historical Import

This guide walks you through running the import end-to-end on your local machine
so you can verify every record before it's permanent, tune date ranges or field
mappings, and re-run as many times as needed.

> **One-time import** — this script is designed to be run once to fill in the
> historical financial picture (Sep 2024 – Aug 2025). After that, ongoing
> transactions come from the Google Sheets sync (more accurate, actual transaction-
> level data — see the bottom of this guide).

---

## Prerequisites checklist

- [ ] Python 3.11, pip, openpyxl, requests all installed
- [ ] Excel file at `C:\Users\keato\Downloads\KK Finances_ Rework.xlsx`
- [ ] Two terminal windows ready

---

## Step 1 — Start the backend

Open Terminal 1:

```bash
cd C:\Users\keato\financeTool\backend
venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

You should see:
```
INFO:     Uvicorn running on http://127.0.0.1:8000
INFO:     Application startup complete.
```

Leave this terminal open. If the DB is fresh (first run):
```bash
# Only if you get "no such table" errors:
alembic upgrade head
python seed/seed_data.py
```

---

## Step 2 — Start the frontend (optional but useful for visual verification)

Open Terminal 2:

```bash
cd C:\Users\keato\financeTool\frontend
npm run dev
```

Open http://localhost:3000 and log in as **keaton**

---

## Step 3 — Create the accounts in the app

The import needs accounts to exist so it can auto-discover their IDs. Create
these in the app UI if they don't already exist.

**Log in as keaton → go to /accounts → Add Account:**

| Name | Type | Notes |
|------|------|-------|
| Keaton Checking | Checking | |
| Keaton Savings | Savings | |
| EverBank HYSA | HYSA / High-Yield Savings | |
| Keaton 401k | 401k | |
| Keaton IRA | IRA | |
| Keaton Student Loans | Student Loan | Set balance to **$0** for now — you'll add a starting snapshot after import |

**Log out → log in as katherine → go to /accounts → Add Account:**

| Name | Type | Notes |
|------|------|-------|
| Katherine Checking | Checking | |
| Katherine Savings | Savings | |
| Katherine 401k | 401k | |
| Katherine IRA | IRA | |
| Katherine Student Loans | Student Loan | Katherine paid these off. Create the account so her payment history imports. Set balance to $0. |

> **No manual ID lookup needed** — the script calls `GET /accounts` and
> `GET /categories` at runtime to discover all IDs automatically.

### After import — add starting balance snapshots for student loans

The import posts the monthly payment transactions, but you need to add the
**Sep 2024 starting balance** manually so the balance history chart is accurate.

**Keaton:** Go to `/accounts` → click "Keaton Student Loans" → Add Snapshot:
- Date: `2024-09-01`
- Balance: (your combined loan balance as of Sep 2024 — check your loan servicer)
- Estimated: ~$12,000–15,000 (you can refine this later)

**Katherine:** Go to `/accounts` → click "Katherine Student Loans" → Add Snapshot:
- Date: `2024-09-01`
- Balance: (her loan balance as of Sep 2024 — she paid off in Sep 2025)
- The payment transactions will show the payoff progression

---

## Step 4 — Dry run (always do this first)

Open a third terminal:

```bash
cd C:\Users\keato\financeTool\backend\import
python import_xlsx.py --dry-run
```

The script will log in as both users, auto-discover their account IDs, then
print a preview of every record it would post:

```
============================================================
  FinanceTrack Historical Import
  Mode:    DRY RUN
============================================================

--- KEATON ---
  Logging in as keaton...
  OK  Found 5 accounts: ['checking', 'savings', 'hysa', '401k', 'ira']
  OK  Income category id = 1

  [Paystubs]
  Found 7 paystub records
    [DRY RUN] POST /paystubs  pay_date=2025-02-28  gross=3635.41  net=2228.43
    [DRY RUN] POST /paystubs  pay_date=2025-03-15  gross=5213.58  net=3041.63
    [DRY RUN] POST /paystubs  pay_date=2025-03-31  gross=4877.53  net=3037.35
    [DRY RUN] POST /paystubs  pay_date=2025-04-30  gross=4877.53  net=3037.35
    [DRY RUN] POST /paystubs  pay_date=2025-06-15  gross=5381.6   net=3315.41
    [DRY RUN] POST /paystubs  pay_date=2025-06-23  gross=690.0    net=584.08
    [DRY RUN] POST /paystubs  pay_date=2025-08-15  gross=5220.32  net=3227.33

  [Balance Snapshots]
  Found 10 snapshot records
    [DRY RUN] POST /balance-snapshots  acct=checking  date=2025-01-31  balance=5656.12
    [DRY RUN] POST /balance-snapshots  acct=savings   date=2025-01-31  balance=2398.27
    [DRY RUN] POST /balance-snapshots  acct=hysa      date=2025-01-31  balance=48265.92
    [DRY RUN] POST /balance-snapshots  acct=401k      date=2025-01-31  balance=68534.76
    [DRY RUN] POST /balance-snapshots  acct=ira       date=2025-01-31  balance=3516.68
    ...

--- MONTHLY INCOME TRANSACTIONS (from tracker) ---
  Importing months before 2025-02-01 (Sep 2024 - Jan 2025)
    [keaton] [DRY RUN] 2024-09-30  $6,979.00  Monthly income Sep 2024 (xlsx import)
    [keaton] [DRY RUN] 2024-10-31  $6,979.00  Monthly income Oct 2024 (xlsx import)
    ...

--- STUDENT LOAN PAYMENTS (from tracker) ---
  NOTE: 'Student Loans' account must exist in app for each user.
    [keaton]    [DRY RUN] 2024-09-30  $800.00  Student loan payment Sep 2024 (xlsx import)
    [keaton]    [DRY RUN] 2024-10-31  $800.00  Student loan payment Oct 2024 (xlsx import)
    ...
    [katherine] [DRY RUN] 2024-09-30  $XXX.XX  Student loan payment Sep 2024 (xlsx import)
    ...

--- BONUS INCOME (from tracker) ---
  Bonuses are manual entries in Rework, not in monthly spending sheets.
    [keaton]    [DRY RUN] 2025-03-31  $X,XXX.XX  Bonus Mar 2025 (xlsx import)
    [katherine] [DRY RUN] ...
```

> If loan/bonus sections show `[SKIP] no 'student_loan' account found`, go back
> to Step 3 and create the Student Loans accounts first.

Check that the numbers look right. If anything looks off, stop here and tune
the script before running live.

---

## Step 5 — Run the actual import

Once the dry run looks correct:

```bash
# Import everything for both users
python import_xlsx.py

# Or one user at a time if you want to verify between users
python import_xlsx.py --user keaton
python import_xlsx.py --user katherine

# Run only specific sections (all can be combined)
python import_xlsx.py --skip-paystubs --skip-snapshots --skip-transactions  # loans + bonuses only
python import_xlsx.py --skip-loans --skip-bonuses                            # paystubs + snapshots + income only
```

The script outputs OK/FAIL for each record. If it says FAIL, it will show the
HTTP status and error message — fix and re-run. Already-imported records are
automatically skipped.

---

## Step 6 — Verify in the app

After the import:

**Paystubs:** Go to `/paystubs` — should show 7 Keaton entries, 1 Katherine entry
spanning Feb–Aug 2025.

**Account history:** Go to `/accounts` → click Keaton Checking → the balance
history chart should show data points at Jan 31, 2025 and Mar 31, 2025.

**Dashboard:** The net worth card and monthly cash flow should now show historical
bars going back to Sep 2024.

**Transactions:** Go to `/transactions` → filter by date → Sep–Jan months should
show monthly income entries.

---

## Tuning the import

If you need to change something (date ranges, amounts, field mappings):

1. Edit `import_xlsx.py`
2. Run `--dry-run` to preview the change
3. If records already exist in the DB, they'll be skipped (duplicate guard)
4. To re-import changed records: delete them from the DB first, then re-run

**Delete a paystub:**
```bash
curl -X DELETE http://localhost:8000/api/v1/paystubs/ID \
  -H "Authorization: Bearer TOKEN"
```

**Delete a balance snapshot:**
```bash
curl -X DELETE http://localhost:8000/api/v1/balance-snapshots/ID \
  -H "Authorization: Bearer TOKEN"
```

**Delete a transaction:**
```bash
curl -X DELETE http://localhost:8000/api/v1/transactions/ID \
  -H "Authorization: Bearer TOKEN"
```

Or just delete and recreate `backend/finance.db` to start fresh:
```bash
# Nuclear option — wipes everything and re-seeds
cd backend
rm finance.db
alembic upgrade head
python seed/seed_data.py
# Then re-run the import
```

---

## Key numbers to sanity-check

When you see the dry-run output, verify these match the actual spreadsheet:

| Paystub date | Gross | Net (take-home) |
|---|---|---|
| 2025-02-28 | $3,635.41 | $2,228.43 |
| 2025-03-15 | $5,213.58 | $3,041.63 |
| 2025-03-31 | $4,877.53 | $3,037.35 |
| 2025-04-30 | $4,877.53 | $3,037.35 |
| 2025-06-15 | $5,381.60 | $3,315.41 |
| 2025-06-23 | $690.00   | $584.08   |
| 2025-08-15 | $5,220.32 | $3,227.33 |

Balance snapshots (Jan 2025 and Mar 2025):
| Account | Jan 31, 2025 | Mar 31, 2025 |
|---|---|---|
| Keaton Checking | $5,656.12 | $5,656.12 |
| Keaton Savings | $2,398.27 | $2,398.27 |
| EverBank HYSA | $48,265.92 | $48,265.92 |
| Keaton 401k | $68,534.76 | $68,534.76 |
| Keaton IRA | $3,516.68 | $3,516.68 |

---

## After the import — what comes next

### Monthly transactions: use the Google Sheet (more accurate)

The import creates **rough monthly income totals** for Sep 2024–Jan 2025 from
the KD Ongoing Tracker (which only has monthly aggregates). These are good
enough for net worth history and cash flow charts, but they're not real
transaction-level data.

**The Keaton monthly spending Google Sheet is the accurate source** — it has
actual individual transaction data (amounts, dates, merchants, categories) that
matches what really hit the accounts. Once you set up Google Sheets sync
(Settings → Google Sheets Sync in the app), new transactions will auto-import
every 30 minutes.

For the historical period (before the sync was set up), you can:
1. Export the Google Sheet to CSV and use Transactions → Import CSV in the app
2. Or extend the import script to pull from the Google Sheet API directly

The plan is to **cross-compare**: after you run this import, compare the
monthly totals in the app against the Google Sheet rows for the same months.
If the Google Sheet shows more granular / more accurate numbers, prefer those
and delete the coarse monthly transactions this script created.

### What the import does NOT cover
- Individual transaction categories (only income totals, no spending breakdown)
- Katherine's account balance history (not in the spreadsheet)
- Months before Sep 2024 (the tracker only starts then)
- Paystub YTD fields (not in the spreadsheet)

These can be added manually or via CSV import as a follow-up.
