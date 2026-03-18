# FinanceTrack User Guide (Complete)

This guide explains **everything you need to use FinanceTrack day-to-day**: setup, login, navigation, each page, recurring workflows, scenarios, alerts, and troubleshooting.

---

## 1) What FinanceTrack Is

FinanceTrack is a personal finance forecasting app for:
- **User 1**
- **User 2**

It combines:
- Historical transactions
- Account balances
- Recurring income/expenses
- Life events (e.g., wedding/honeymoon)
- Forecasting and what-if scenarios

So you can see:
- Current net worth
- Spending trends
- Budget status
- Projected net worth/cash flow over time

---

## 2) First-Time Setup

### Requirements
- Python 3.11+
- Node.js 18+

### Start the backend
```bash
cd backend
python -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows
pip install -r requirements.txt
alembic upgrade head
python seed/seed_data.py
uvicorn app.main:app --reload --port 8000
```

### Start the frontend
```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:3000`

---

## 3) Login Accounts

Default seeded users:

| Username | Password |
|---|---|
| `keaton` | `finance123` |
| `katherine` | `finance123` |

After login, go to **Settings** and change your password.

---

## 4) Navigation Overview

Desktop sidebar and mobile “More” menu include:
- Dashboard
- Transactions
- Accounts
- Budget
- Forecast
- Life Events
- What-If
- Alerts
- My Profile (Financial Profile)
- Paystubs
- Settings

---

## 5) Dashboard

Dashboard gives you the quickest full-picture view.

### Panels you’ll see
1. **Net Worth Card**
   - Assets
   - Liabilities
   - Net worth

2. **Quick Stats**
   - Total assets
   - Total liabilities
   - This month income
   - This month spending

3. **Accounts Grid**
   - Accounts grouped by account type

4. **Charts**
   - Monthly flow preview
   - Spending by category

5. **Forecast + Events + Alerts**
   - Forecast preview chart
   - Upcoming life events
   - Alerts card (top active alerts)

6. **Recent Transactions**
   - Latest transaction feed

### How to use it well
- Check Dashboard weekly for drift (overspending or low-cash signals).
- If an alert appears, click into **Alerts**, **Budget**, or **Life Events**.

---

## 6) Transactions

Use this page for search, filtering, import, and CRUD.

### Core actions
- Add transaction manually
- Edit/delete transaction
- Filter by date/account/category/search
- Import CSV/XLSX
- Export CSV

### Import workflow (recommended monthly)
1. Export monthly transaction file from your bank/card.
2. Go to Transactions → Import.
3. Upload file and confirm mapping.
4. Review imported rows and duplicates.

### Data conventions
- Positive amount = income
- Negative amount = expense
- Baseline transactions have no scenario ID

---

## 7) Accounts

Track all assets and liabilities:
- Checking, savings, HYSA
- Brokerage/IRA/401k/HSA
- Credit cards and loans

### Best practice
- Update balances monthly/quarterly.
- Keep loan balances current for realistic payoff projections.

---

## 8) Budget

Budget compares planned vs actual spending by category.

### Important setup
- Categories need a **budget amount** to evaluate over/under budget.
- Use categories tab/forms to set or update budget amounts.

### What to monitor
- Percentage used
- Remaining budget
- Over-budget categories (these feed alerts)

---

## 9) Forecast

Forecast projects future monthly outcomes (default up to 60 months).

### Inputs used
- Historical spending patterns
- Recurring rules
- Life event costs
- Scenario changes

### Outputs
- Net worth trajectory
- Cash flow trajectory
- Income vs expenses by month
- Category-level forecast contribution

### Tips
- Re-check after importing new month’s data.
- Forecast quality improves with cleaner category assignment.

---

## 10) Life Events

Model major known expenses/income shifts (wedding, move, vacation, etc.).

### Event fields
- Name and type
- Start/end dates
- Total cost
- Optional monthly breakdown
- Active toggle

### Use case
- Spread large costs over months with monthly breakdown to improve forecast accuracy.

---

## 11) What-If Scenarios

Scenarios let you compare alternatives against baseline.

### Typical flow
1. Create/clone a scenario.
2. Adjust transactions, recurring rules, or events in that scenario.
3. Compare baseline vs scenario.
4. Evaluate impact on net worth and cash.

### Example questions
- What if we reduce dining by 30%?
- What if we increase student loan payment by $200/month?
- What if wedding costs shift by 3 months?

---

## 12) Alerts

Alerts page centralizes proactive warnings.

### Alert types
1. **Budget alerts**
   - Trigger when a category spends above budget in selected month.
   - Severity increases with overspend percentage.

2. **Event alerts**
   - Trigger for upcoming life-event payment exposure in lookahead window.
   - Severity can be critical if near-term.

### Where alerts appear
- Full list on **Alerts** page
- Top alerts on Dashboard **Alerts** card

### How to respond
- Budget alert → open Budget page, adjust spending or budget
- Event alert → open Life Events and verify schedule/amounts

---

## 13) Settings

Use Settings to manage account security and Google Sheets sync integration.

### Recommended immediately after first login
- Change default password
- Verify account identity details

### Google Sheets Sync
Connect a Google Sheet to auto-import transactions. The sheet is synced every 30 minutes when enabled.

1. Paste your **Google Spreadsheet ID** into the Spreadsheet ID field (found in the sheet URL between `/d/` and `/edit`).
2. Toggle **Auto-sync every 30 minutes** on if desired.
3. Click **Save Settings**.
4. Click **Sync Now** to trigger an immediate import.

**Sheet format expected:**
- Each tab = one month (e.g. `Jan 2025`, `Feb 2025`)
- Columns: `Date`, `Description` or `Expense`, `Amount` (positive = expense, negated on import)
- Blank rows and headers are skipped automatically
- Deduplication is automatic — safe to sync repeatedly

**Sync status** shows the last sync time, result, and number of rows imported vs skipped.

---

## 14) Financial Profile (My Profile)

Each user has their own financial profile page at `/financial-profile`. Fill in your data independently from your partner.

### Sections

**Income & Salary**
- Annual salary, pay frequency (semi-monthly = 24×/yr, biweekly = 26×/yr)
- Net pay per paycheck
- Employer 401k match % and employee 401k per paycheck

**HYSA & IRA Contributions**
- HYSA APY and monthly contribution amount
- IRA monthly contribution amount

**Student Loans**
- Add each loan individually: name, servicer, original balance, current balance, interest rate, minimum payment
- Total remaining balance shown at top of section

**Investment Holdings**
- Fund-level tracking: ticker, fund name, current value, monthly contribution, assumed annual return
- Linked to a specific account (401k, IRA, brokerage)

**Compensation History**
- Log raises (old salary → new salary), bonuses (gross + net), spot awards, stipends
- Timeline view ordered by date

---

## 15) Paystubs

Upload Paylocity PDF paystubs to extract and store all payroll data automatically.

### Upload workflow
1. Go to **Paystubs** in the sidebar.
2. Drag a PDF onto the upload zone or click to browse.
3. The parser (pdfplumber) extracts all fields automatically.
4. Review the pre-filled form — correct any fields if needed.
5. Click **Save Paystub** to store.

### Fields extracted automatically
- Gross pay, net pay, pay period dates, employer name
- Federal income tax (FITW)
- MD state tax, MD county tax (MD-CAL1)
- Social Security, Medicare
- 401k employee deduction
- Employer Safe Harbor 401k contribution
- Vision insurance deduction
- YTD: gross, net, federal, SS, Medicare, state, 401k (employee + employer)

### Summary stats (once you have saved stubs)
- YTD Gross and YTD Net from the most recent stub
- Average net pay per paycheck across all saved stubs

---

## 16) Suggested Monthly Routine

1. Run Google Sheets **Sync Now** to import new transactions (or wait for auto-sync)
2. Verify categories for uncategorized rows
3. Update key account balances (HYSA, 401k, student loans via balance snapshots)
4. Upload new paystub PDF for the month
5. Review budget overages
6. Review alerts
7. Check forecast for next 3–6 months
8. Update life event schedule/cost assumptions if needed

---

## 17) Data Quality Tips

- Keep categories consistent (avoid near-duplicate names).
- Don’t leave recurring items only in ad-hoc transactions; use recurring rules.
- Maintain balance snapshots for investment and loan accounts.
- Keep life event breakdowns realistic and date-aligned.
- Keep student loan balances current in Financial Profile so payoff projections are accurate.

---

## 18) Common Troubleshooting

### “Failed to load dashboard data”
- Confirm backend is running on port 8000.
- Confirm frontend is running on port 3000.
- Confirm token still valid; sign out/in if needed.

### Import problems
- Check date and amount columns are parseable.
- Ensure CSV delimiter is valid.
- Remove blank header rows before import.

### Google Sheets sync fails
- Confirm the sheet is shared with the service account `client_email` from `backend/credentials/google-sheets-key.json`.
- Confirm the Spreadsheet ID is correct (from the URL).
- Check the backend logs for detailed error output.

### Paystub parsing incomplete
- Only digital (text-based) PDFs work with pdfplumber. Scanned PDFs require tesseract (install separately).
- The parser is tuned for Paylocity format. Other formats may need manual field correction.

### No alerts shown
- You may simply have no active alerts.
- Budget alerts need budget values set.
- Event alerts need active events in lookahead period.

---

## 19) API Surface (for advanced users)

Base: `http://localhost:8000/api/v1`

Major endpoint groups:
- `/auth`
- `/dashboard`
- `/transactions`
- `/accounts`
- `/categories`
- `/budget/summary`
- `/forecast`
- `/events`
- `/scenarios`
- `/alerts`
- `/sync/google-sheets/config` — GET/PUT sync configuration
- `/sync/google-sheets/run` — POST to trigger manual sync
- `/financial-profile` — GET/PUT profile; sub-routes: `/loans`, `/holdings`, `/compensation`
- `/paystubs` — GET/POST list and save; `/paystubs/parse` — POST to extract PDF

Auth uses Bearer JWT token from login.

---

## 20) Backup & Safety

If using SQLite locally, your data file is in:
- `backend/finance.db`

Back it up regularly (e.g., weekly copy + cloud backup).

Paystub PDFs uploaded temporarily to `backend/uploads/paystubs/` — these are not committed to git.

---

## 21) Version

Current app UX/docs target: **v0.2.0**.

