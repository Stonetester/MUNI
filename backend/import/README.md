# Historical Data Import — KK Finances_ Rework.xlsx

One-time script to retroactively populate FinanceTrack with historical data
from the spreadsheet. Run it once; it skips records that already exist.

## What Gets Imported

| Data | Source | Date Range |
|------|--------|------------|
| Keaton paystubs (7 records) | Keaton PayStub sheet | Feb 2025 – Aug 2025 |
| Katherine paystub (1 record) | Katherine PayStub sheet | Mar 2025 |
| Keaton balance snapshots (10 records) | Keaton PayStub sheet | Jan 2025, Mar 2025 |
| Monthly income transactions | KD / KAK Ongoing Tracker | Sep 2024 – Jan 2025 |

---

## Setup (5 steps)

### 1. Make sure the app is running
```bash
# Terminal 1 — Backend
cd backend && venv\Scripts\activate
uvicorn app.main:app --reload --port 8000
```

### 2. Create accounts in the app if they don't exist
Log in as **keaton** and create:
- Keaton Checking (checking)
- Keaton Savings (savings)
- EverBank HYSA (hysa)
- Keaton 401k (401k)
- Keaton IRA (ira)

Log in as **katherine** and create:
- Katherine Checking (checking)
- Katherine Savings (savings)
- Katherine 401k (401k)
- Katherine IRA (ira)

### 3. Get account IDs and income category ID
```bash
# Get Keaton's accounts
curl -s http://localhost:8000/api/v1/accounts \
  -H "Authorization: Bearer <keaton_token>" | python -m json.tool

# Get categories (find the "Income" category ID)
curl -s http://localhost:8000/api/v1/categories \
  -H "Authorization: Bearer <keaton_token>" | python -m json.tool
```
Or just browse to http://localhost:3000/accounts — the account ID is in the URL
when you click an account.

### 4. Fill in account_map.json
Edit `backend/import/account_map.json` and replace `null` with numeric IDs:
```json
{
  "keaton": {
    "checking_id":  12,
    "savings_id":   13,
    "hysa_id":      14,
    "k401_id":      15,
    "ira_id":       16
  },
  ...
  "income_category_id": 1
}
```

### 5. Install dependencies (if not already installed)
```bash
pip install openpyxl requests
```

---

## Running

```bash
cd backend/import

# Always preview first:
python import_xlsx.py --dry-run

# Import everything for both users:
python import_xlsx.py

# Keaton only:
python import_xlsx.py --user keaton

# Katherine only:
python import_xlsx.py --user katherine

# Paystubs only (skip balance snapshots and transactions):
python import_xlsx.py --skip-snapshots --skip-transactions

# Balance snapshots only:
python import_xlsx.py --skip-paystubs --skip-transactions
```

The script is **idempotent** — re-running it skips records that already exist.

---

## After Import

- **Accounts page** → click each account → chart should show historical data points
- **Paystubs page** → timeline should show Feb 2025 – Aug 2025 entries
- **Dashboard** → net worth card should show historical curve
- **Monthly cash flow** → Sep 2024 months should be populated

---

## Troubleshooting

| Error | Fix |
|-------|-----|
| `Connection refused` | Make sure the backend is running on port 8000 |
| `401 Unauthorized` | Check credentials in account_map.json credentials section |
| `422 Unprocessable` | A field type mismatch — check API is up to date |
| `Excel file not found` | Update `xlsx_path` in account_map.json |
| Snapshots show 0 records | Fill in account IDs in account_map.json |
| Transactions show 0 records | Fill in `income_category_id` in account_map.json |
