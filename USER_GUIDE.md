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

Use Settings to manage account-level preferences including password changes.

### Recommended immediately after first login
- Change default password
- Verify account identity details

---

## 14) Suggested Monthly Routine

1. Import last month transactions
2. Verify categories for uncategorized rows
3. Update key account balances
4. Review budget overages
5. Review alerts
6. Check forecast for next 3–6 months
7. Update life event schedule/cost assumptions if needed

---

## 15) Data Quality Tips

- Keep categories consistent (avoid near-duplicate names).
- Don’t leave recurring items only in ad-hoc transactions; use recurring rules.
- Maintain balance snapshots for investment and loan accounts.
- Keep life event breakdowns realistic and date-aligned.

---

## 16) Common Troubleshooting

### “Failed to load dashboard data”
- Confirm backend is running on port 8000.
- Confirm frontend is running on port 3000.
- Confirm token still valid; sign out/in if needed.

### Import problems
- Check date and amount columns are parseable.
- Ensure CSV delimiter is valid.
- Remove blank header rows before import.

### No alerts shown
- You may simply have no active alerts.
- Budget alerts need budget values set.
- Event alerts need active events in lookahead period.

---

## 17) API Surface (for advanced users)

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

Auth uses Bearer JWT token from login.

---

## 18) Backup & Safety

If using SQLite locally, your data file is in:
- `backend/finance.db`

Back it up regularly (e.g., weekly copy + cloud backup).

---

## 19) Version

Current app UX/docs target: **v0.1.1**.

