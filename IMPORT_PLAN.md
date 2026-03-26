# Historical Data Import Plan — KK Finances: Rework.xlsx
_Last updated: 2026-03-19_

---

## What This Does

Reads `KK Finances_ Rework.xlsx` and retroactively populates:
1. **Balance snapshots** — per-account balance at each paystub date → feeds account history charts
2. **Paystub records** — full pay period breakdown → feeds `/paystubs` timeline
3. **Monthly summary transactions** — one income + one per-expense-category transaction per month → feeds cash flow charts and forecast accuracy

This gives the app real historical data from **September 2024 → present** instead of starting from nothing.

---

## Source Sheets and What to Pull

### Sheet A — "Keaton PayStub"

**What it is:** One row per pay period. Both paystub income/tax data AND account balance snapshots per check.

**Row layout:**
- Row 4 = header row
- Rows 5+ = data (one row per paystub)

**Columns to extract:**

| Excel Col | Header | Maps to | Notes |
|-----------|--------|---------|-------|
| B | Date | `pay_date` (mid-point of range) | Format: "3/16-3/31" → parse end date |
| C | income | `regular_pay` (net? gross?) | Verify — likely net per paycheck |
| D | taxes | `tax_total` | Sum of all tax lines |
| E | deductions (401k and benefits) | `deduction_total` | |
| F | 401k | `deduction_401k` | Employee 401k per check |
| G | benefits | `deduction_dental` + others | Lumped |
| H | gross income | `gross_pay` | Pre-tax, pre-deduction |
| AA | md | `tax_state` | MD state income tax |
| AB | md cal | `tax_county` | MD county (CAL1) |
| AC | fed | `tax_federal` | Federal withholding |
| AD | med | `tax_medicare` | Medicare |
| AE | ss | `tax_social_security` | Social Security |
| AF | 401k (tax col) | `employer_401k` | Employer Safe Harbor match |
| K | Spending | Balance snapshot → Checking acct | Per-check balance |
| L | Savings | Balance snapshot → Savings acct | |
| M | EverBank | Balance snapshot → HYSA acct | |
| N | 401k | Balance snapshot → 401k acct | |
| O | IRA | Balance snapshot → IRA acct | |

**Paystubs available:** ~7 entries, Feb 2025 – Aug 2025

---

### Sheet B — "Katherine PayStub"

**Same structure as Keaton PayStub.** Fewer entries (~2–3 recorded). Extract same fields. Maps to Katherine's accounts.

---

### Sheet C — "KD Ongoing Tracker"

**What it is:** Month-by-month projection table. Columns = months (Sep 2024 → Mar 2027). Rows = categories.

**What to use it for:** This is the only source for **Sep 2024 → Jan 2025** balance data (before paystubs were recorded). The paystub sheet only starts Feb 2025.

**Key rows to extract:**
- Row for "Spending" balance → Keaton checking snapshot per month
- Row for "EverBank" balance → Keaton HYSA snapshot per month
- Row for "401k" balance → Keaton 401k snapshot per month
- Row for "IRA" balance → Keaton IRA snapshot per month
- Row for income (pre-deduction) → monthly gross income value

**Date coverage:** Sep 2024 – Aug 2025 (overlaps with paystub data; paystub data wins for Feb+ due to more detail)

---

### Sheet D — "GO support" (General Overview Support)

**What it is:** Katherine's monthly expense breakdown by category.

**Status:** Many cells are `IMPORTRANGE` formulas pulling from Keaton's Google Sheet (`1zq-UuBUmZIx70lM_EYajSv3suXwUaMDjhxuW4m-Eqac`). Most are broken/showing `#REF!` in the file. **We skip this sheet for now** unless values can be resolved.

**Fallback:** The Google Sheet sync feature in FinanceTrack already handles this data source directly. Configure it in Settings → Google Sheets Sync instead of trying to extract from the broken formulas.

---

## Data → App Field Mapping

### Balance Snapshots → `POST /api/v1/balance-snapshots`

```json
{
  "account_id": 5,          // looked up by name before import
  "date": "2025-03-31",     // end of pay period
  "balance": 48265.92,
  "notes": "From paystub 3/16-3/31"
}
```

**Accounts to map (exact names must exist in the app first):**

| Spreadsheet column | Account type | Account name to create in app |
|--------------------|-------------|-------------------------------|
| Keaton → Spending | checking | "Keaton Checking" |
| Keaton → Savings | savings | "Keaton Savings" |
| Keaton → EverBank | hysa | "EverBank HYSA" |
| Keaton → 401k | 401k | "Keaton 401k" |
| Keaton → IRA | ira | "Keaton IRA" |
| Katherine → Spending | checking | "Katherine Checking" |
| Katherine → Savings | savings | "Katherine Savings" |
| Katherine → EverBank | hysa | "Katherine EverBank" (or joint) |
| Katherine → 401k | 401k | "Katherine 401k" |
| Katherine → IRA | ira | "Katherine IRA" |

---

### Paystubs → `POST /api/v1/paystubs`

```json
{
  "pay_date": "2025-03-31",
  "period_start": "2025-03-16",
  "period_end": "2025-03-31",
  "employer": "Paylocity employer",
  "gross_pay": 5455.63,
  "regular_pay": 5455.63,
  "tax_federal": 616.02,
  "tax_state": 203.17,
  "tax_county": 136.96,
  "tax_social_security": 302.30,
  "tax_medicare": 70.70,
  "tax_total": 1328.88,
  "deduction_401k": 485.42,
  "deduction_total": 511.30,
  "net_pay": 3614.62,
  "parse_method": "xlsx_import"
}
```

**Date parsing rule for "3/16-3/31" format:**
- `period_start` = "3/16" → `2025-03-16` (infer year from surrounding rows)
- `period_end` = "3/31" → `2025-03-31`
- `pay_date` = `period_end`

---

### Monthly Income Transactions → `POST /api/v1/transactions`

For months NOT covered by paystubs (Sep 2024 – Jan 2025, from KD Ongoing Tracker), create one income transaction per month:

```json
{
  "date": "2024-09-30",
  "amount": 10440.64,
  "description": "Semi-monthly income (imported)",
  "category_id": <income category id>,
  "account_id": <Keaton Checking id>,
  "is_verified": true
}
```

---

## What the Import Script Does (Step by Step)

### Prerequisites (do first in the app UI)

1. Verify these accounts exist in the app (create if missing):
   - Keaton: Checking, Savings, EverBank HYSA, 401k, IRA
   - Katherine: Checking, Savings, 401k, IRA (she can add her own if logged in as her)

2. Note each account's numeric `id` (shown in URL or via `GET /api/v1/accounts`)

3. Note the `id` for your "Income" category (from `GET /api/v1/categories`)

### Script Phases

```
Phase 1 — Read Excel
  → Load "Keaton PayStub" sheet
  → Load "Katherine PayStub" sheet
  → Load "KD Ongoing Tracker" sheet

Phase 2 — Extract Balance Snapshots
  → From PayStub sheets: for each data row, extract (date, Spending, Savings, EverBank, 401k, IRA)
  → From KD Ongoing Tracker: for each month column (Sep 2024 – Jan 2025), extract account balances
  → Deduplicate: if same account + date appears in both sources, prefer PayStub data

Phase 3 — Extract Paystubs
  → From each PayStub sheet row: extract all income/tax/deduction fields
  → Parse date ranges ("3/16-3/31") into period_start / period_end / pay_date
  → Infer year from surrounding context (all 2025 entries unless date shows otherwise)

Phase 4 — POST to API (dry-run first)
  → Authenticate as keaton (POST /api/v1/auth/switch/keaton → get JWT)
  → POST balance snapshots for Keaton's accounts
  → POST paystub records for Keaton
  → Authenticate as katherine
  → POST balance snapshots for Katherine's accounts
  → POST paystub records for Katherine

Phase 5 — Verify
  → GET /api/v1/balance-snapshots?account_id=X for each account
  → Confirm all expected dates are present
  → Open Accounts page in UI → click each account → verify chart shows history
```

---

## What Gets Unlocked in the App After Import

| Feature | Before import | After import |
|---------|--------------|--------------|
| Account balance charts | Flat line from today | Sep 2024 → present curve |
| Net worth history | No history | 18-month growth curve |
| Monthly cash flow chart | Current month only | Sep 2024 → present scrollable |
| Forecast accuracy | Uses assumed averages | Trained on real 18-month history |
| Paystub timeline | Only manual uploads | Full 2025 history populated |
| Tax effective rate | Unknown | Calculated from YTD fields |
| 401k contribution history | Unknown | Per-paycheck data available |

---

## Files to Create

```
backend/
  import/
    import_xlsx.py       ← main import script
    account_map.json     ← maps spreadsheet names → app account IDs (user fills this out)
    README.md            ← how to run it
```

---

## Caveats

- **GO support is broken** — IMPORTRANGE formulas reference the Google Sheet. Use the built-in Google Sheets Sync feature instead.
- **KD Ongoing Tracker has projected rows too** (Apr 2026+) — skip any month after today's date.
- **Year inference for paystub dates** — "3/16-3/31" has no year. The script will infer year from context (rows near "2025-06-23" datetime in row 13 confirm 2025).
- **Katherine's paystub data is sparse** — only 2–3 entries. We'll import what's there.
- **Duplicate guard** — the script checks existing snapshots before inserting to avoid double-posting.

---

## Next Step

Say **"build the import script"** and I'll create `backend/import/import_xlsx.py` with:
- Full openpyxl/pandas parsing of both paystub sheets and the tracker
- Auto-discovery of data rows (finds the header row dynamically)
- `account_map.json` template you fill with your account IDs
- `--dry-run` flag to preview without writing to the DB
- `--user keaton` / `--user katherine` flags
- Clear console output showing what's being imported and any skipped rows
