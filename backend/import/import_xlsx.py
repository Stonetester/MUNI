"""
FinanceTrack -- One-Time Historical Data Import
Reads KK Finances_ Rework.xlsx and posts historical data to the FinanceTrack API.

Usage:
    python import_xlsx.py --dry-run          # Preview without writing anything
    python import_xlsx.py                    # Full import (both users)
    python import_xlsx.py --user keaton      # Keaton only
    python import_xlsx.py --user katherine   # Katherine only
    python import_xlsx.py --skip-paystubs    # Balance snapshots + transactions only
    python import_xlsx.py --skip-snapshots   # Paystubs + transactions only

Prerequisites:
    1. Edit account_map.json -- fill in account IDs and category ID
    2. Make sure the API is running on localhost:8000
    3. pip install openpyxl requests
"""

import argparse
import json
import re
import sys
from datetime import date, datetime
from pathlib import Path

import openpyxl
import requests

# -----------------------------------------------------------------------------
# Config
# -----------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
MAP_FILE   = SCRIPT_DIR / "account_map.json"

# Tax breakdown reference extracted from Keaton PayStub right-side table:
# "old" = gross ~3635 (pre-raise); "401k now old pay" row = actual taxes for that pay level + 401k rate
KEATON_TAX_REF = {
    # gross -> (md, md_cal, fed, med, ss)
    3635.41: (141.22, 95.14, 330.33, 52.69, 225.29),   # "401k now old pay" row matches 844.67 total
    4877.53: (203.17, 136.96, 616.02, 70.70, 302.30),   # "new" rate row
}


# -----------------------------------------------------------------------------
# Date Parsing
# -----------------------------------------------------------------------------

def parse_pay_period(cell_value, default_year: int = 2025):
    """
    Parse pay period date strings into (period_start, period_end, pay_date).

    Handles:
      '3/16-3/31'   -> (2025-03-16, 2025-03-31, 2025-03-31)
      '2/16 -2/28'  -> (2025-02-16, 2025-02-28, 2025-02-28)
      datetime obj  -> (that date, that date, that date)

    Returns None if not parseable or if cell is empty/None.
    """
    if cell_value is None:
        return None

    if isinstance(cell_value, (datetime, date)):
        d = cell_value.date() if isinstance(cell_value, datetime) else cell_value
        return d, d, d

    if not isinstance(cell_value, str):
        return None

    cell_value = cell_value.strip()
    if not cell_value:
        return None

    # Pattern: "M/D-M/D" with optional spaces around the dash
    m = re.match(r'^(\d{1,2})/(\d{1,2})\s*[--]\s*(\d{1,2})/(\d{1,2})$', cell_value)
    if not m:
        return None

    s_mo, s_day, e_mo, e_day = (int(m.group(i)) for i in range(1, 5))

    # All paystub dates in this spreadsheet are 2025
    year = default_year
    try:
        start = date(year, s_mo, s_day)
        end   = date(year, e_mo, e_day)
        return start, end, end
    except ValueError:
        return None


def last_day_of_month(year: int, month: int) -> date:
    """Return the last calendar day of a given month."""
    if month == 12:
        return date(year, 12, 31)
    return date(year, month + 1, 1).replace(day=1) - __import__('datetime').timedelta(days=1)


# -----------------------------------------------------------------------------
# Excel Extraction
# -----------------------------------------------------------------------------

def extract_keaton_paystubs(ws) -> list[dict]:
    """
    Extract paystub records from the 'Keaton PayStub' sheet.
    Returns a list of dicts ready to POST to /api/v1/paystubs.

    Sheet layout (1-indexed rows, 0-indexed cols from A):
      Row 5  = most recent paystub (col B = date string, C=income/gross, D=taxes,
               E=deductions, F=401k_employee, G=benefits, H=net_pay)
      Row 7  = second header row (skip)
      Rows 8-14 = historical paystubs (same column layout)

    Spreadsheet naming quirk: 'income' col = GROSS pay; 'gross income' col = NET pay.
    """
    records = []

    # Rows to parse: row 5 (most recent) + rows 8-14 (historical)
    data_rows = [5] + list(range(8, 15))

    # Track which pay_dates we've already added (row 5 may duplicate row 10)
    seen_dates = set()

    for row_num in data_rows:
        row = [ws.cell(row_num, col).value for col in range(1, 17)]
        # col indices: 0=A(None), 1=B(date), 2=C(income/gross), 3=D(taxes),
        #              4=E(deductions_total), 5=F(401k_employee), 6=G(benefits),
        #              7=H(net_pay), 9=J(month_label), 10-14=K-O(balances)

        date_cell = row[1]
        parsed = parse_pay_period(date_cell)
        if parsed is None:
            continue

        period_start, period_end, pay_date = parsed

        # Skip duplicates (most-recent row and historical row share same date)
        if pay_date in seen_dates:
            continue
        seen_dates.add(pay_date)

        gross_pay     = _num(row[2])   # spreadsheet "income" = gross pay
        tax_total     = _num(row[3])
        deduction_tot = _num(row[4])
        deduction_401k = _num(row[5])
        net_pay       = _num(row[7])   # spreadsheet "gross income" = net pay

        # Individual tax breakdown -- available for known pay rates, else 0
        tax_ref = KEATON_TAX_REF.get(gross_pay)
        if tax_ref:
            md, md_cal, fed, med, ss = tax_ref
        else:
            # Scale proportionally from nearest reference rate
            nearest_gross = min(KEATON_TAX_REF, key=lambda k: abs(k - gross_pay)) if gross_pay else None
            if nearest_gross:
                ratio = gross_pay / nearest_gross
                md, md_cal, fed, med, ss = (round(v * ratio, 2) for v in KEATON_TAX_REF[nearest_gross])
            else:
                md = md_cal = fed = med = ss = 0.0

        records.append({
            "pay_date":             pay_date.isoformat(),
            "period_start":         period_start.isoformat(),
            "period_end":           period_end.isoformat(),
            "employer":             "ACE (xlsx import)",
            "gross_pay":            gross_pay,
            "regular_pay":          gross_pay,
            "tax_total":            tax_total,
            "tax_state":            md,
            "tax_county":           md_cal,
            "tax_federal":          fed,
            "tax_medicare":         med,
            "tax_social_security":  ss,
            "deduction_total":      deduction_tot,
            "deduction_401k":       deduction_401k,
            "net_pay":              net_pay,
            "parse_method":         "xlsx_import",
            "notes":                f"Imported from KK Finances_ Rework.xlsx ({date_cell})",
        })

    return records


def extract_keaton_snapshots(ws, account_map: dict) -> list[dict]:
    """
    Extract balance snapshots from 'Keaton PayStub' sheet.

    Only rows where the Month label column (col J, index 9) is non-empty
    have balance snapshots. In practice this is row 8 ('Jan') and possibly
    the most-recent row 5 (which has balances but no month label -- use paystub
    period_end as the snapshot date).

    Columns (0-indexed from A):  K=10 Spending, L=11 Savings, M=12 EverBank, N=13 401k, O=14 IRA
    """
    kacc = account_map.get("keaton", {})
    col_account = [
        (10, kacc.get("checking_id"),  "Keaton Checking"),
        (11, kacc.get("savings_id"),   "Keaton Savings"),
        (12, kacc.get("hysa_id"),      "EverBank HYSA"),
        (13, kacc.get("k401_id"),      "Keaton 401k"),
        (14, kacc.get("ira_id"),       "Keaton IRA"),
    ]
    snapshots = []

    # Row 5 = most recent (use period_end as snapshot date)
    row5_date_cell = ws.cell(5, 2).value
    parsed5 = parse_pay_period(row5_date_cell)
    if parsed5:
        snap_date = parsed5[2]  # period_end
        row5 = [ws.cell(5, col).value for col in range(1, 16)]
        for col_idx, acct_id, label in col_account:
            bal = _num(row5[col_idx])
            if bal is not None and acct_id:
                snapshots.append({
                    "account_id": acct_id,
                    "date":       snap_date.isoformat(),
                    "balance":    bal,
                    "notes":      f"From paystub {row5_date_cell} (xlsx import)",
                })

    # Rows 8-14 = historical; only snapshot when Month label (col J) is set
    for row_num in range(8, 15):
        month_label = ws.cell(row_num, 10).value  # col J (1-indexed col 10)
        if not month_label:
            continue

        date_cell = ws.cell(row_num, 2).value
        parsed = parse_pay_period(date_cell)
        if parsed is None:
            continue

        # The month label (e.g. 'Jan') marks which month these are end-of-month balances for
        # Best guess: use period_start month's last day
        # Row 8 is '2/16-2/28' labeled 'Jan' -> Jan 2025 month-end
        period_start = parsed[0]
        # If period starts in February, the labeled month is January (prior month)
        snap_month = period_start.month - 1 if period_start.month > 1 else 12
        snap_year  = period_start.year if period_start.month > 1 else period_start.year - 1
        snap_date  = last_day_of_month(snap_year, snap_month)

        row = [ws.cell(row_num, col).value for col in range(1, 16)]
        for col_idx, acct_id, label in col_account:
            bal = _num(row[col_idx])
            if bal is not None and acct_id:
                snapshots.append({
                    "account_id": acct_id,
                    "date":       snap_date.isoformat(),
                    "balance":    bal,
                    "notes":      f"Month: {month_label} (xlsx import from paystub row)",
                })

    return snapshots


def extract_katherine_paystubs(ws) -> list[dict]:
    """
    Extract paystub records from 'Katherine PayStub' sheet.

    Layout differs from Keaton: headers start at col A (not col B).
      Row 4 = header: ('Date', 'income', 'taxes', 'deductions', '401k', 'benefits', 'gross income')
      Row 5 = most recent
      Row 8 = historical (same date as row 5 in this dataset)

    Col indices (0-indexed from A=0):
      0=Date, 1=income(gross), 2=taxes, 3=deductions, 4=401k, 5=benefits, 6=net_pay
    """
    records = []
    seen_dates = set()

    for row_num in [5, 8]:
        row = [ws.cell(row_num, col).value for col in range(1, 9)]
        date_cell = row[0]
        parsed = parse_pay_period(date_cell)
        if parsed is None:
            continue

        period_start, period_end, pay_date = parsed
        if pay_date in seen_dates:
            continue
        seen_dates.add(pay_date)

        gross_pay     = _num(row[1])
        tax_total     = _num(row[2])
        deduction_tot = _num(row[3])
        deduction_401k = _num(row[4])
        net_pay       = _num(row[6])

        records.append({
            "pay_date":       pay_date.isoformat(),
            "period_start":   period_start.isoformat(),
            "period_end":     period_end.isoformat(),
            "employer":       "G&P (xlsx import)",
            "gross_pay":      gross_pay,
            "regular_pay":    gross_pay,
            "tax_total":      tax_total,
            "deduction_total":  deduction_tot,
            "deduction_401k":   deduction_401k,
            "net_pay":        net_pay,
            "parse_method":   "xlsx_import",
            "notes":          f"Imported from KK Finances_ Rework.xlsx ({date_cell})",
        })

    return records


def extract_tracker_income_transactions(ws_kd, ws_kak, account_map: dict, cutoff_date: date) -> list[tuple[str, dict]]:
    """
    Extract monthly income transactions from KD/KAK Ongoing Trackers
    for months before cutoff_date (i.e. before paystub data starts).

    Returns list of (username, transaction_dict) tuples.

    Sheet structure (both KD and KAK):
      Row 6  = month headers ('month', datetime(2024,9,1), datetime(2024,10,1), ...)
      Row 20 = monthly 'Income' totals for each month column (1-indexed cols B+)
    """
    results = []
    cat_id = account_map.get("income_category_id")

    for username, ws, acct_key in [
        ("keaton",    ws_kd,  "keaton"),
        ("katherine", ws_kak, "katherine"),
    ]:
        checking_id = account_map.get(acct_key, {}).get("checking_id")
        if not checking_id:
            print(f"  [SKIP] {username}: checking_id not set in account_map.json")
            continue
        if not cat_id:
            print(f"  [SKIP] income_category_id not set -- skipping tracker transactions")
            break

        # Find month header row (row 6) and income row (row 20)
        month_row_num  = 6
        income_row_num = 20  # 'Income' (monthly totals, not cumulative)

        month_row  = [ws.cell(month_row_num, col).value  for col in range(1, 40)]
        income_row = [ws.cell(income_row_num, col).value for col in range(1, 40)]

        # Walk columns: col A (idx 0) = row label, cols B+ = month data
        for col_idx in range(1, len(month_row)):
            month_dt = month_row[col_idx]
            if not isinstance(month_dt, datetime):
                continue

            month_date = month_dt.date()

            # Only import months BEFORE the cutoff (before paystubs start)
            # Use last day of month as the transaction date
            snap_date = last_day_of_month(month_date.year, month_date.month)
            if snap_date >= cutoff_date:
                continue

            amount = _num(income_row[col_idx])
            if amount is None or amount <= 0:
                continue

            results.append((username, {
                "date":         snap_date.isoformat(),
                "amount":       amount,
                "description":  f"Monthly income {month_date.strftime('%b %Y')} (xlsx import)",
                "category_id":  cat_id,
                "account_id":   checking_id,
                "is_verified":  True,
            }))

    return results


# -----------------------------------------------------------------------------
# API Helpers
# -----------------------------------------------------------------------------

def login(api_base: str, username: str, password: str) -> str:
    """Login and return the JWT access token."""
    resp = requests.post(
        f"{api_base}/auth/login",
        data={"username": username, "password": password},
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()["access_token"]


def get_existing_paystub_dates(api_base: str, token: str) -> set[str]:
    """Return set of existing pay_date strings to avoid duplicates."""
    resp = requests.get(
        f"{api_base}/paystubs",
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code == 404:
        return set()
    resp.raise_for_status()
    data = resp.json()
    items = data if isinstance(data, list) else data.get("items", data.get("paystubs", []))
    return {item["pay_date"] for item in items}


def get_existing_snapshot_dates(api_base: str, token: str, account_id: int) -> set[str]:
    """Return set of existing snapshot date strings for an account."""
    resp = requests.get(
        f"{api_base}/balance-snapshots",
        params={"account_id": account_id},
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code == 404:
        return set()
    resp.raise_for_status()
    data = resp.json()
    items = data if isinstance(data, list) else data.get("items", [])
    return {item["date"] for item in items}


def post_paystub(api_base: str, token: str, payload: dict, dry_run: bool) -> bool:
    if dry_run:
        print(f"    [DRY RUN] POST /paystubs  pay_date={payload['pay_date']}"
              f"  gross={payload.get('gross_pay')}  net={payload.get('net_pay')}")
        return True
    resp = requests.post(
        f"{api_base}/paystubs",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code in (200, 201):
        print(f"    OK Created paystub {payload['pay_date']}")
        return True
    print(f"    FAIL Failed paystub {payload['pay_date']}: {resp.status_code} {resp.text[:120]}")
    return False


def post_snapshot(api_base: str, token: str, payload: dict, dry_run: bool) -> bool:
    if dry_run:
        print(f"    [DRY RUN] POST /balance-snapshots  acct_id={payload['account_id']}"
              f"  date={payload['date']}  balance={payload['balance']}")
        return True
    resp = requests.post(
        f"{api_base}/balance-snapshots",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code in (200, 201):
        print(f"    OK Snapshot acct={payload['account_id']} {payload['date']} ${payload['balance']:,.2f}")
        return True
    print(f"    FAIL Failed snapshot acct={payload['account_id']} {payload['date']}: {resp.status_code} {resp.text[:120]}")
    return False


def post_transaction(api_base: str, token: str, payload: dict, dry_run: bool) -> bool:
    if dry_run:
        print(f"    [DRY RUN] POST /transactions  date={payload['date']}"
              f"  amount={payload['amount']}  desc={payload['description'][:40]}")
        return True
    resp = requests.post(
        f"{api_base}/transactions",
        json=payload,
        headers={"Authorization": f"Bearer {token}"},
        timeout=10,
    )
    if resp.status_code in (200, 201):
        print(f"    OK Transaction {payload['date']} ${payload['amount']:,.2f}")
        return True
    print(f"    FAIL Failed transaction {payload['date']}: {resp.status_code} {resp.text[:120]}")
    return False


# -----------------------------------------------------------------------------
# Utilities
# -----------------------------------------------------------------------------

def _num(v):
    """Return float if numeric, else None."""
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", "").strip())
        except ValueError:
            return None
    return None


def validate_map(account_map: dict, user: str | None) -> list[str]:
    """Return list of warning strings for un-filled map entries."""
    warnings = []
    users_to_check = (["keaton"] if user == "keaton" else
                      ["katherine"] if user == "katherine" else
                      ["keaton", "katherine"])

    for u in users_to_check:
        block = account_map.get(u, {})
        for key, label in [
            ("checking_id", "Checking"), ("savings_id", "Savings"),
            ("hysa_id", "HYSA"), ("k401_id", "401k"), ("ira_id", "IRA"),
        ]:
            if not block.get(key):
                warnings.append(f"  {u}.{key} ({label}) not set -- snapshots for this account will be skipped")

    if not account_map.get("income_category_id"):
        warnings.append("  income_category_id not set -- monthly income transactions will be skipped")

    return warnings


# -----------------------------------------------------------------------------
# Main
# -----------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Import historical data from KK Finances Excel")
    parser.add_argument("--dry-run",        action="store_true", help="Preview without writing")
    parser.add_argument("--user",           choices=["keaton", "katherine"], help="Import one user only")
    parser.add_argument("--skip-paystubs",  action="store_true", help="Skip paystub records")
    parser.add_argument("--skip-snapshots", action="store_true", help="Skip balance snapshots")
    parser.add_argument("--skip-transactions", action="store_true", help="Skip monthly income transactions")
    parser.add_argument("--map",            default=str(MAP_FILE), help="Path to account_map.json")
    args = parser.parse_args()

    # -- Load config ----------------------------------------------------------
    map_path = Path(args.map)
    if not map_path.exists():
        print(f"ERROR: account_map.json not found at {map_path}")
        print("  Copy account_map.json from this directory and fill in account IDs.")
        sys.exit(1)

    with open(map_path) as f:
        account_map = json.load(f)

    api_base  = account_map.get("api_base", "http://localhost:8000/api/v1")
    xlsx_path = account_map.get("xlsx_path", r"C:\Users\keato\Downloads\KK Finances_ Rework.xlsx")

    print(f"\n{'='*60}")
    print(f"  FinanceTrack Historical Import")
    print(f"  Excel:   {xlsx_path}")
    print(f"  API:     {api_base}")
    print(f"  Mode:    {'DRY RUN' if args.dry_run else 'LIVE'}")
    if args.user:
        print(f"  User:    {args.user} only")
    print(f"{'='*60}\n")

    # -- Validate account map --------------------------------------------------
    warnings = validate_map(account_map, args.user)
    if warnings:
        print("WARN: Account map warnings (fill account_map.json to enable these):")
        for w in warnings:
            print(w)
        print()

    # -- Load workbook ---------------------------------------------------------
    if not Path(xlsx_path).exists():
        print(f"ERROR: Excel file not found: {xlsx_path}")
        sys.exit(1)

    print("Loading workbook (data_only=True to get cached values)...")
    wb = openpyxl.load_workbook(xlsx_path, data_only=True)
    ws_keaton = wb["Keaton PayStub"]
    ws_kath   = wb["Katherine PayStub"]
    ws_kd     = wb["KD Ongoing Tracker"]
    ws_kak    = wb["KAK Ongoing Tracker"]
    print("  OK Loaded 4 sheets\n")

    creds = account_map.get("credentials", {})

    # -- KEATON ----------------------------------------------------------------
    if args.user in (None, "keaton"):
        print("--- KEATON ----------------------------------------------")

        # Login
        if not args.dry_run:
            try:
                token_k = login(api_base, creds.get("keaton_username", "keaton"),
                                creds.get("keaton_password", "finance123"))
                print("  OK Logged in as keaton")
            except Exception as e:
                print(f"  FAIL Login failed: {e}")
                sys.exit(1)
        else:
            token_k = "dry-run-token"

        # Paystubs
        if not args.skip_paystubs:
            print("\n  [Paystubs]")
            keaton_stubs = extract_keaton_paystubs(ws_keaton)
            print(f"  Found {len(keaton_stubs)} paystub records")

            existing = set() if args.dry_run else get_existing_paystub_dates(api_base, token_k)
            ok = skip = 0
            for stub in keaton_stubs:
                if stub["pay_date"] in existing:
                    print(f"    [SKIP] paystub {stub['pay_date']} already exists")
                    skip += 1
                    continue
                if post_paystub(api_base, token_k, stub, args.dry_run):
                    ok += 1
            print(f"  -> {ok} posted, {skip} skipped (already exist)")

        # Balance snapshots
        if not args.skip_snapshots:
            print("\n  [Balance Snapshots]")
            snapshots_k = extract_keaton_snapshots(ws_keaton, account_map)
            print(f"  Found {len(snapshots_k)} snapshot records")

            ok = skip = 0
            for snap in snapshots_k:
                acct_id = snap["account_id"]
                existing_snap = set() if args.dry_run else get_existing_snapshot_dates(api_base, token_k, acct_id)
                if snap["date"] in existing_snap:
                    print(f"    [SKIP] snapshot acct={acct_id} {snap['date']} already exists")
                    skip += 1
                    continue
                if post_snapshot(api_base, token_k, snap, args.dry_run):
                    ok += 1
            print(f"  -> {ok} posted, {skip} skipped")

    # -- KATHERINE -------------------------------------------------------------
    if args.user in (None, "katherine"):
        print("\n--- KATHERINE -------------------------------------------")

        if not args.dry_run:
            try:
                token_kat = login(api_base, creds.get("katherine_username", "katherine"),
                                  creds.get("katherine_password", "finance123"))
                print("  OK Logged in as katherine")
            except Exception as e:
                print(f"  FAIL Login failed: {e}")
                sys.exit(1)
        else:
            token_kat = "dry-run-token"

        if not args.skip_paystubs:
            print("\n  [Paystubs]")
            kath_stubs = extract_katherine_paystubs(ws_kath)
            print(f"  Found {len(kath_stubs)} paystub records")

            existing = set() if args.dry_run else get_existing_paystub_dates(api_base, token_kat)
            ok = skip = 0
            for stub in kath_stubs:
                if stub["pay_date"] in existing:
                    print(f"    [SKIP] paystub {stub['pay_date']} already exists")
                    skip += 1
                    continue
                if post_paystub(api_base, token_kat, stub, args.dry_run):
                    ok += 1
            print(f"  -> {ok} posted, {skip} skipped")

        # Katherine balance snapshots (sparse data -- just log what we find)
        if not args.skip_snapshots:
            print("\n  [Balance Snapshots]")
            kacc = account_map.get("katherine", {})
            col_account_kat = [
                # Katherine PayStub balance cols are at Q-W (cols 17-23 from A, which are Q=17 in 1-indexed)
                # From inspection: row 9 col Q-W = 'Jan', None, None, None, None, None, None
                # No balance data available for Katherine in the spreadsheet
            ]
            print("  Katherine's balance sheet has no populated balance data -- skipping.")

    # -- MONTHLY INCOME TRANSACTIONS (Sep 2024 - Jan 2025) --------------------
    if not args.skip_transactions:
        print("\n--- MONTHLY INCOME TRANSACTIONS (from tracker) ----------")

        # Paystubs start Feb 2025 (earliest paystub: '2/16-2/28' = 2025-02-28)
        # Import income transactions for months strictly before Feb 1, 2025
        cutoff = date(2025, 2, 1)
        print(f"  Importing months before {cutoff} (Sep 2024 - Jan 2025)")

        tx_list = extract_tracker_income_transactions(ws_kd, ws_kak, account_map, cutoff)
        print(f"  Found {len(tx_list)} transaction records")

        # Re-use tokens obtained above (or create fresh ones for dry-run)
        for username, tx in tx_list:
            if args.user and args.user != username:
                continue

            if not args.dry_run:
                token = token_k if username == "keaton" else token_kat
                post_transaction(api_base, token, tx, False)
            else:
                print(f"    [{username}] [DRY RUN] {tx['date']}  ${tx['amount']:,.2f}  {tx['description'][:50]}")

    print(f"\n{'='*60}")
    print("  Import complete.")
    if args.dry_run:
        print("  This was a DRY RUN -- nothing was written to the database.")
        print("  Remove --dry-run to perform the actual import.")
    print(f"{'='*60}\n")


if __name__ == "__main__":
    main()
