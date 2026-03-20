"""
FinanceTrack — Full Feature Test Agent
Automatically tests every API endpoint and feature of the app.
Outputs a structured report of pass/fail results with details.

Usage:
    python test_all_features.py
    python test_all_features.py --base http://localhost:8000/api/v1
    python test_all_features.py --report-file report.md
"""

import argparse
import json
import sys
import time
from datetime import date, timedelta
from io import StringIO

import requests

BASE = "http://localhost:8000/api/v1"

# ─────────────────────────────────────────────────────────────────────────────
# Result tracking
# ─────────────────────────────────────────────────────────────────────────────

results = []   # list of dicts: {section, name, passed, detail, response_time}

def record(section, name, passed, detail="", response_time=None):
    status = "PASS" if passed else "FAIL"
    ms = f"{response_time*1000:.0f}ms" if response_time else ""
    print(f"  [{status}] {name}{' -- ' + detail if detail else ''}{' (' + ms + ')' if ms else ''}")
    results.append({
        "section": section,
        "name": name,
        "passed": passed,
        "detail": detail,
        "response_time": response_time,
    })

def section(title):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")


# ─────────────────────────────────────────────────────────────────────────────
# HTTP helpers
# ─────────────────────────────────────────────────────────────────────────────

def get(url, token=None, params=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    t0 = time.time()
    try:
        r = requests.get(url, headers=headers, params=params, timeout=10)
        return r, time.time() - t0
    except Exception as e:
        return None, time.time() - t0

def post(url, token=None, json_data=None, form_data=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    t0 = time.time()
    try:
        if form_data:
            r = requests.post(url, headers=headers, data=form_data, timeout=10)
        else:
            r = requests.post(url, headers=headers, json=json_data, timeout=10)
        return r, time.time() - t0
    except Exception as e:
        return None, time.time() - t0

def put(url, token=None, json_data=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    t0 = time.time()
    try:
        r = requests.put(url, headers=headers, json=json_data, timeout=10)
        return r, time.time() - t0
    except Exception as e:
        return None, time.time() - t0

def delete(url, token=None):
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    t0 = time.time()
    try:
        r = requests.delete(url, headers=headers, timeout=10)
        return r, time.time() - t0
    except Exception as e:
        return None, time.time() - t0

def ok(r):
    return r is not None and r.status_code in (200, 201, 204)

def detail(r):
    if r is None:
        return "connection refused"
    try:
        body = r.json()
        if isinstance(body, dict) and "detail" in body:
            return f"HTTP {r.status_code}: {body['detail']}"
    except Exception:
        pass
    return f"HTTP {r.status_code}"


# ─────────────────────────────────────────────────────────────────────────────
# Auth
# ─────────────────────────────────────────────────────────────────────────────

def test_auth():
    section("AUTH")
    tokens = {}

    for username, password in [("keaton", "finance123"), ("katherine", "finance123")]:
        r, t = post(f"{BASE}/auth/login",
                    form_data={"username": username, "password": password})
        if ok(r) and "access_token" in r.json():
            tokens[username] = r.json()["access_token"]
            record("Auth", f"Login as {username}", True, "JWT received", t)
        else:
            record("Auth", f"Login as {username}", False, detail(r), t)

    # Bad credentials
    r, t = post(f"{BASE}/auth/login",
                form_data={"username": "keaton", "password": "wrongpassword"})
    record("Auth", "Reject bad credentials", r is not None and r.status_code == 401,
           detail(r), t)

    # Token validation (protected endpoint without token)
    r, t = get(f"{BASE}/accounts")
    record("Auth", "Reject unauthenticated request", r is not None and r.status_code == 401,
           detail(r), t)

    # Me endpoint
    if "keaton" in tokens:
        r, t = get(f"{BASE}/auth/me", tokens["keaton"])
        passed = ok(r) and r.json().get("username") == "keaton"
        record("Auth", "GET /auth/me returns current user", passed, detail(r) if not passed else "", t)

    return tokens


# ─────────────────────────────────────────────────────────────────────────────
# Accounts
# ─────────────────────────────────────────────────────────────────────────────

def test_accounts(tokens):
    section("ACCOUNTS")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return {}

    created_ids = {}

    # List
    r, t = get(f"{BASE}/accounts", tk)
    record("Accounts", "GET /accounts returns list", ok(r) and isinstance(r.json(), list), detail(r) if not ok(r) else f"{len(r.json())} accounts", t)
    existing = r.json() if ok(r) else []

    # Create checking account
    payload = {"name": "Test Checking", "account_type": "checking", "balance": 1000.0, "institution": "Test Bank"}
    r, t = post(f"{BASE}/accounts", tk, json_data=payload)
    if ok(r):
        created_ids["checking"] = r.json()["id"]
        record("Accounts", "POST /accounts creates checking", True, f"id={created_ids['checking']}", t)
    else:
        record("Accounts", "POST /accounts creates checking", False, detail(r), t)

    # Create savings
    payload = {"name": "Test Savings", "account_type": "savings", "balance": 5000.0}
    r, t = post(f"{BASE}/accounts", tk, json_data=payload)
    if ok(r):
        created_ids["savings"] = r.json()["id"]
        record("Accounts", "POST /accounts creates savings", True, f"id={created_ids['savings']}", t)
    else:
        record("Accounts", "POST /accounts creates savings", False, detail(r), t)

    # Create 401k
    payload = {"name": "Test 401k", "account_type": "401k", "balance": 50000.0}
    r, t = post(f"{BASE}/accounts", tk, json_data=payload)
    if ok(r):
        created_ids["k401"] = r.json()["id"]
        record("Accounts", "POST /accounts creates 401k", True, "", t)
    else:
        record("Accounts", "POST /accounts creates 401k", False, detail(r), t)

    # Update
    if "checking" in created_ids:
        r, t = put(f"{BASE}/accounts/{created_ids['checking']}", tk,
                   json_data={"name": "Test Checking Updated", "balance": 1500.0})
        record("Accounts", "PUT /accounts/:id updates account", ok(r), detail(r) if not ok(r) else "", t)

    # Get single
    if "checking" in created_ids:
        r, t = get(f"{BASE}/accounts/{created_ids['checking']}", tk)
        record("Accounts", "GET /accounts/:id returns single", ok(r) and r.json().get("name", "").startswith("Test Checking"), detail(r) if not ok(r) else "", t)

    return created_ids


# ─────────────────────────────────────────────────────────────────────────────
# Balance Snapshots
# ─────────────────────────────────────────────────────────────────────────────

def test_balance_snapshots(tokens, account_ids):
    section("BALANCE SNAPSHOTS")
    tk = tokens.get("keaton")
    if not tk or "checking" not in account_ids:
        print("  [SKIP] No keaton token or checking account")
        return

    acct_id = account_ids["checking"]
    snap_ids = []

    # Create snapshot
    payload = {"account_id": acct_id, "date": "2025-01-31", "balance": 4200.0, "notes": "Test snapshot"}
    r, t = post(f"{BASE}/balance-snapshots", tk, json_data=payload)
    if ok(r):
        snap_ids.append(r.json()["id"])
        record("Snapshots", "POST /balance-snapshots creates snapshot", True, f"id={snap_ids[-1]}", t)
    else:
        record("Snapshots", "POST /balance-snapshots creates snapshot", False, detail(r), t)

    # Create another
    payload = {"account_id": acct_id, "date": "2024-12-31", "balance": 3800.0, "notes": "Dec snapshot"}
    r, t = post(f"{BASE}/balance-snapshots", tk, json_data=payload)
    if ok(r):
        snap_ids.append(r.json()["id"])
        record("Snapshots", "POST second snapshot (different date)", True, "", t)
    else:
        record("Snapshots", "POST second snapshot (different date)", False, detail(r), t)

    # List by account
    r, t = get(f"{BASE}/balance-snapshots", tk, params={"account_id": acct_id})
    passed = ok(r) and isinstance(r.json(), list) and len(r.json()) >= len(snap_ids)
    record("Snapshots", "GET /balance-snapshots?account_id filters correctly", passed, f"{len(r.json()) if ok(r) else '?'} snapshots", t)

    # Delete
    for sid in snap_ids:
        r, t = delete(f"{BASE}/balance-snapshots/{sid}", tk)
        record("Snapshots", f"DELETE /balance-snapshots/{sid}", ok(r) or (r is not None and r.status_code == 204), "", t)


# ─────────────────────────────────────────────────────────────────────────────
# Categories
# ─────────────────────────────────────────────────────────────────────────────

def test_categories(tokens):
    section("CATEGORIES")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return None

    r, t = get(f"{BASE}/categories", tk)
    passed = ok(r) and isinstance(r.json(), list) and len(r.json()) > 0
    record("Categories", "GET /categories returns default categories", passed,
           f"{len(r.json()) if ok(r) else '?'} categories", t)

    cats = r.json() if ok(r) else []
    income_cat = next((c for c in cats if c.get("kind") == "income"), None)
    record("Categories", "Income category exists (kind=income)", income_cat is not None,
           f"found: {income_cat['name']}" if income_cat else "none found", None)

    # Create custom category
    r, t = post(f"{BASE}/categories", tk, json_data={"name": "Test Category", "color": "#ff0000"})
    cat_id = None
    if ok(r):
        cat_id = r.json()["id"]
        record("Categories", "POST /categories creates category", True, f"id={cat_id}", t)
    else:
        record("Categories", "POST /categories creates category", False, detail(r), t)

    # Update
    if cat_id:
        r, t = put(f"{BASE}/categories/{cat_id}", tk, json_data={"name": "Test Category Updated", "budget_amount": 500.0})
        record("Categories", "PUT /categories/:id updates with budget", ok(r), detail(r) if not ok(r) else "", t)

        # Delete
        r, t = delete(f"{BASE}/categories/{cat_id}", tk)
        record("Categories", "DELETE /categories/:id", ok(r) or (r is not None and r.status_code == 204), "", t)

    return income_cat.get("id") if income_cat else None


# ─────────────────────────────────────────────────────────────────────────────
# Transactions
# ─────────────────────────────────────────────────────────────────────────────

def test_transactions(tokens, account_ids, income_cat_id):
    section("TRANSACTIONS")
    tk = tokens.get("keaton")
    if not tk or "checking" not in account_ids:
        print("  [SKIP] No keaton token or checking account")
        return []

    acct_id = account_ids["checking"]
    tx_ids = []
    today = date.today().isoformat()
    yesterday = (date.today() - timedelta(days=1)).isoformat()

    # Create income transaction
    payload = {
        "date": today,
        "amount": 3500.0,
        "description": "Test paycheck",
        "category_id": income_cat_id,
        "account_id": acct_id,
        "is_verified": True,
    }
    r, t = post(f"{BASE}/transactions", tk, json_data=payload)
    if ok(r):
        tx_ids.append(r.json()["id"])
        record("Transactions", "POST /transactions creates income transaction", True, f"id={tx_ids[-1]}", t)
    else:
        record("Transactions", "POST /transactions creates income transaction", False, detail(r), t)

    # Create expense transaction
    payload = {
        "date": yesterday,
        "amount": -125.50,
        "description": "Grocery run",
        "account_id": acct_id,
        "merchant": "Trader Joe's",
    }
    r, t = post(f"{BASE}/transactions", tk, json_data=payload)
    if ok(r):
        tx_ids.append(r.json()["id"])
        record("Transactions", "POST /transactions creates expense transaction", True, f"id={tx_ids[-1]}", t)
    else:
        record("Transactions", "POST /transactions creates expense transaction", False, detail(r), t)

    # List with pagination
    r, t = get(f"{BASE}/transactions", tk, params={"limit": 10, "offset": 0})
    passed = ok(r)
    if passed:
        body = r.json()
        items = body.get("items", body) if isinstance(body, dict) else body
        record("Transactions", "GET /transactions with pagination", True, f"{len(items)} items", t)
    else:
        record("Transactions", "GET /transactions with pagination", False, detail(r), t)

    # Filter by account
    r, t = get(f"{BASE}/transactions", tk, params={"account_id": acct_id, "limit": 50})
    record("Transactions", "GET /transactions?account_id filter", ok(r), detail(r) if not ok(r) else "", t)

    # Filter by date range
    r, t = get(f"{BASE}/transactions", tk, params={"start_date": yesterday, "end_date": today, "limit": 50})
    record("Transactions", "GET /transactions?start_date&end_date filter", ok(r), detail(r) if not ok(r) else "", t)

    # Update transaction
    if tx_ids:
        r, t = put(f"{BASE}/transactions/{tx_ids[0]}", tk,
                   json_data={"amount": 3600.0, "description": "Updated paycheck"})
        record("Transactions", "PUT /transactions/:id updates", ok(r), detail(r) if not ok(r) else "", t)

    # Delete test transactions (cleanup)
    for tid in tx_ids:
        delete(f"{BASE}/transactions/{tid}", tk)

    return tx_ids


# ─────────────────────────────────────────────────────────────────────────────
# Dashboard
# ─────────────────────────────────────────────────────────────────────────────

def test_dashboard(tokens):
    section("DASHBOARD")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/dashboard", tk)
    if ok(r):
        data = r.json()
        record("Dashboard", "GET /dashboard returns data", True, "", t)
        record("Dashboard", "Dashboard has net_worth field", "net_worth" in data, "", None)
        record("Dashboard", "Dashboard has total_assets field", "total_assets" in data, "", None)
        record("Dashboard", "Dashboard has this_month block", "this_month" in data, "", None)
        record("Dashboard", "Dashboard has recent_transactions", "recent_transactions" in data, "", None)
        record("Dashboard", "Dashboard has forecast_preview", "forecast_preview" in data, "", None)
        record("Dashboard", "Dashboard has upcoming_events", "upcoming_events" in data, "", None)
    else:
        record("Dashboard", "GET /dashboard returns data", False, detail(r), t)


# ─────────────────────────────────────────────────────────────────────────────
# Forecast
# ─────────────────────────────────────────────────────────────────────────────

def test_forecast(tokens):
    section("FORECAST")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/forecast", tk)
    if ok(r):
        data = r.json()
        record("Forecast", "GET /forecast returns data", True, "", t)
        record("Forecast", "Forecast has points array", "points" in data and isinstance(data["points"], list), f"{len(data.get('points', []))} points", None)
        record("Forecast", "Forecast has 60-month horizon", len(data.get("points", [])) >= 60, "", None)
        if data.get("points"):
            p = data["points"][0]
            record("Forecast", "Forecast point has net_worth field", "net_worth" in p, "", None)
            record("Forecast", "Forecast point has income/expenses", "income" in p and "expenses" in p, "", None)
    else:
        record("Forecast", "GET /forecast returns data", False, detail(r), t)

    # With scenario_id param
    r, t = get(f"{BASE}/forecast", tk, params={"months_past": 6, "months_future": 12})
    record("Forecast", "GET /forecast with months_past + months_future params", ok(r), detail(r) if not ok(r) else "", t)


# ─────────────────────────────────────────────────────────────────────────────
# Life Events
# ─────────────────────────────────────────────────────────────────────────────

def test_life_events(tokens):
    section("LIFE EVENTS")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/events", tk)
    record("Life Events", "GET /events returns list", ok(r) and isinstance(r.json(), list), f"{len(r.json()) if ok(r) else '?'} events", t)

    payload = {
        "name": "Test Wedding",
        "event_type": "wedding",
        "start_date": "2026-10-01",
        "total_cost": 62000.0,
        "description": "The big day",
    }
    r, t = post(f"{BASE}/events", tk, json_data=payload)
    ev_id = None
    if ok(r):
        ev_id = r.json()["id"]
        record("Life Events", "POST /events creates event", True, f"id={ev_id}", t)
    else:
        record("Life Events", "POST /events creates event", False, detail(r), t)

    if ev_id:
        r, t = put(f"{BASE}/events/{ev_id}", tk, json_data={"total_cost": 63000.0, "name": "Test Wedding Updated"})
        record("Life Events", "PUT /events/:id updates", ok(r), detail(r) if not ok(r) else "", t)

        r, t = delete(f"{BASE}/events/{ev_id}", tk)
        record("Life Events", "DELETE /events/:id removes", ok(r) or (r is not None and r.status_code == 204), "", t)


# ─────────────────────────────────────────────────────────────────────────────
# Scenarios (What-If)
# ─────────────────────────────────────────────────────────────────────────────

def test_scenarios(tokens):
    section("SCENARIOS (WHAT-IF)")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/scenarios", tk)
    record("Scenarios", "GET /scenarios returns list", ok(r) and isinstance(r.json(), list), f"{len(r.json()) if ok(r) else '?'} scenarios", t)

    payload = {"name": "Test Scenario", "description": "Testing", "is_baseline": False}
    r, t = post(f"{BASE}/scenarios", tk, json_data=payload)
    sc_id = None
    if ok(r):
        sc_id = r.json()["id"]
        record("Scenarios", "POST /scenarios creates scenario", True, f"id={sc_id}", t)
    else:
        record("Scenarios", "POST /scenarios creates scenario", False, detail(r), t)

    if sc_id:
        # Clone
        r, t = post(f"{BASE}/scenarios/{sc_id}/clone", tk)
        clone_id = None
        if ok(r):
            clone_id = r.json()["id"]
            record("Scenarios", "POST /scenarios/:id/clone duplicates", True, f"clone id={clone_id}", t)
        else:
            record("Scenarios", "POST /scenarios/:id/clone duplicates", False, detail(r), t)

        # Delete originals
        delete(f"{BASE}/scenarios/{sc_id}", tk)
        if clone_id:
            delete(f"{BASE}/scenarios/{clone_id}", tk)


# ─────────────────────────────────────────────────────────────────────────────
# Recurring Rules
# ─────────────────────────────────────────────────────────────────────────────

def test_recurring(tokens, account_ids, income_cat_id):
    section("RECURRING RULES")
    tk = tokens.get("keaton")
    if not tk or "checking" not in account_ids:
        print("  [SKIP] No keaton token or checking account")
        return

    r, t = get(f"{BASE}/recurring", tk)
    record("Recurring", "GET /recurring returns list", ok(r) and isinstance(r.json(), list), f"{len(r.json()) if ok(r) else '?'} rules", t)

    payload = {
        "name": "Test Rent",
        "amount": -1500.0,
        "frequency": "monthly",
        "start_date": date.today().isoformat(),
        "account_id": account_ids["checking"],
        "category_id": income_cat_id,
        "is_active": True,
    }
    r, t = post(f"{BASE}/recurring", tk, json_data=payload)
    rule_id = None
    if ok(r):
        rule_id = r.json()["id"]
        record("Recurring", "POST /recurring creates rule", True, f"id={rule_id}", t)
    else:
        record("Recurring", "POST /recurring creates rule", False, detail(r), t)

    if rule_id:
        r, t = put(f"{BASE}/recurring/{rule_id}", tk, json_data={"amount": -1600.0, "name": "Test Rent Updated"})
        record("Recurring", "PUT /recurring/:id updates rule", ok(r), detail(r) if not ok(r) else "", t)

        r, t = delete(f"{BASE}/recurring/{rule_id}", tk)
        record("Recurring", "DELETE /recurring/:id removes rule", ok(r) or (r is not None and r.status_code == 204), "", t)


# ─────────────────────────────────────────────────────────────────────────────
# Alerts
# ─────────────────────────────────────────────────────────────────────────────

def test_alerts(tokens):
    section("ALERTS")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/alerts", tk)
    passed = ok(r) and isinstance(r.json(), list)
    record("Alerts", "GET /alerts returns list", passed, f"{len(r.json()) if ok(r) else '?'} alerts", t)


# ─────────────────────────────────────────────────────────────────────────────
# Paystubs
# ─────────────────────────────────────────────────────────────────────────────

def test_paystubs(tokens):
    section("PAYSTUBS")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/paystubs", tk)
    record("Paystubs", "GET /paystubs returns list", ok(r), f"{len(r.json()) if ok(r) and isinstance(r.json(), list) else '?'} paystubs", t)

    payload = {
        "pay_date": "2025-03-31",
        "period_start": "2025-03-16",
        "period_end": "2025-03-31",
        "employer": "Test Corp",
        "gross_pay": 5455.63,
        "regular_pay": 5455.63,
        "tax_total": 1328.88,
        "tax_federal": 616.02,
        "tax_state": 203.17,
        "tax_county": 136.96,
        "tax_social_security": 302.30,
        "tax_medicare": 70.70,
        "deduction_401k": 485.42,
        "deduction_total": 511.30,
        "net_pay": 3614.62,
        "parse_method": "manual",
    }
    r, t = post(f"{BASE}/paystubs", tk, json_data=payload)
    stub_id = None
    if ok(r):
        stub_id = r.json()["id"]
        record("Paystubs", "POST /paystubs creates paystub", True, f"id={stub_id}", t)
    else:
        record("Paystubs", "POST /paystubs creates paystub", False, detail(r), t)

    if stub_id:
        r, t = get(f"{BASE}/paystubs/{stub_id}", tk)
        record("Paystubs", "GET /paystubs/:id returns single", ok(r), detail(r) if not ok(r) else "", t)

        r, t = delete(f"{BASE}/paystubs/{stub_id}", tk)
        record("Paystubs", "DELETE /paystubs/:id removes", ok(r) or (r is not None and r.status_code == 204), "", t)


# ─────────────────────────────────────────────────────────────────────────────
# Financial Profile
# ─────────────────────────────────────────────────────────────────────────────

def test_financial_profile(tokens):
    section("FINANCIAL PROFILE")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    # GET profile
    r, t = get(f"{BASE}/financial-profile", tk)
    record("Financial Profile", "GET /financial-profile returns profile", ok(r), detail(r) if not ok(r) else "", t)

    # Upsert (PUT or POST)
    payload = {
        "gross_salary": 130935.0,
        "pay_frequency": "semimonthly",
        "net_per_paycheck": 3503.78,
        "employer_401k_percent": 6.0,
    }
    r, t = put(f"{BASE}/financial-profile", tk, json_data=payload)
    if not ok(r):
        r, t = post(f"{BASE}/financial-profile", tk, json_data=payload)
    record("Financial Profile", "PUT/POST /financial-profile saves salary data", ok(r), detail(r) if not ok(r) else "", t)

    # Student loans sub-resource
    r, t = get(f"{BASE}/financial-profile/loans", tk)
    record("Financial Profile", "GET /financial-profile/loans returns list", ok(r) and isinstance(r.json(), list), f"{len(r.json()) if ok(r) else '?'} loans", t)

    loan_payload = {
        "loan_name": "Test Loan",
        "servicer": "Great Lakes",
        "original_balance": 5000.0,
        "current_balance": 1921.40,
        "interest_rate": 4.28,
        "minimum_payment": 80.0,
        "is_active": True,
    }
    r, t = post(f"{BASE}/financial-profile/loans", tk, json_data=loan_payload)
    loan_id = None
    if ok(r):
        loan_id = r.json()["id"]
        record("Financial Profile", "POST /financial-profile/loans creates loan", True, f"id={loan_id}", t)
    else:
        record("Financial Profile", "POST /financial-profile/loans creates loan", False, detail(r), t)

    if loan_id:
        delete(f"{BASE}/financial-profile/loans/{loan_id}", tk)

    # Holdings
    r, t = get(f"{BASE}/financial-profile/holdings", tk)
    record("Financial Profile", "GET /financial-profile/holdings returns list", ok(r) and isinstance(r.json(), list), f"{len(r.json()) if ok(r) else '?'} holdings", t)


# ─────────────────────────────────────────────────────────────────────────────
# Joint endpoints
# ─────────────────────────────────────────────────────────────────────────────

def test_joint(tokens):
    section("JOINT VIEW")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/joint/summary", tk)
    record("Joint", "GET /joint/summary returns combined net worth", ok(r), detail(r) if not ok(r) else
           f"net_worth={r.json().get('net_worth')}" if ok(r) else "", t)

    r, t = get(f"{BASE}/joint/accounts", tk)
    record("Joint", "GET /joint/accounts returns all accounts with owner field", ok(r) and isinstance(r.json(), list),
           f"{len(r.json()) if ok(r) else '?'} accounts" if ok(r) else detail(r), t)
    if ok(r):
        has_owner = all("owner" in a for a in r.json())
        record("Joint", "Each account has owner field", has_owner, "", None)

    r, t = get(f"{BASE}/joint/transactions", tk, params={"limit": 10})
    record("Joint", "GET /joint/transactions returns cross-user txns", ok(r), detail(r) if not ok(r) else "", t)
    if ok(r):
        body = r.json()
        items = body.get("items", body) if isinstance(body, dict) else body
        has_owner = all("owner" in tx for tx in items) if items else True
        record("Joint", "Joint transactions have owner field", has_owner, "", None)


# ─────────────────────────────────────────────────────────────────────────────
# Google Sheets Sync config
# ─────────────────────────────────────────────────────────────────────────────

def test_google_sheets(tokens):
    section("GOOGLE SHEETS SYNC")
    tk = tokens.get("keaton")
    if not tk:
        print("  [SKIP] No keaton token")
        return

    r, t = get(f"{BASE}/sync/google-sheets/config", tk)
    record("Google Sheets", "GET /sync/google-sheets/config returns config", ok(r), detail(r) if not ok(r) else "", t)


# ─────────────────────────────────────────────────────────────────────────────
# Import data endpoint
# ─────────────────────────────────────────────────────────────────────────────

def test_import(tokens, account_ids, income_cat_id):
    section("CSV/XLSX IMPORT ENDPOINT")
    tk = tokens.get("keaton")
    if not tk or "checking" not in account_ids:
        print("  [SKIP] No keaton token or checking account")
        return

    # Test that the import endpoint exists (returns 422 missing file, not 404)
    r, t = post(f"{BASE}/import", tk, json_data={})
    record("Import", "POST /import endpoint exists", r is not None and r.status_code != 404,
           detail(r), t)


# ─────────────────────────────────────────────────────────────────────────────
# Auth — change password
# ─────────────────────────────────────────────────────────────────────────────

def test_auth_extra(tokens):
    section("AUTH — CHANGE PASSWORD")
    tk = tokens.get("keaton")
    if not tk:
        return

    # Try wrong old password
    r, t = post(f"{BASE}/auth/change-password", tk,
                json_data={"current_password": "wrongpassword", "new_password": "newpass"})
    record("Auth", "Change password rejects wrong current password",
           r is not None and r.status_code in (400, 401, 422), detail(r), t)


# ─────────────────────────────────────────────────────────────────────────────
# Account cleanup
# ─────────────────────────────────────────────────────────────────────────────

def cleanup_accounts(tokens, account_ids):
    tk = tokens.get("keaton")
    if not tk:
        return
    for name, aid in account_ids.items():
        delete(f"{BASE}/accounts/{aid}", tk)


# ─────────────────────────────────────────────────────────────────────────────
# Report generation
# ─────────────────────────────────────────────────────────────────────────────

def generate_report(branch: str) -> str:
    total   = len(results)
    passed  = sum(1 for r in results if r["passed"])
    failed  = total - passed
    score   = round(passed / total * 100) if total else 0

    sections_summary = {}
    for r in results:
        s = r["section"]
        if s not in sections_summary:
            sections_summary[s] = {"pass": 0, "fail": 0, "items": []}
        if r["passed"]:
            sections_summary[s]["pass"] += 1
        else:
            sections_summary[s]["fail"] += 1
        sections_summary[s]["items"].append(r)

    slow = [r for r in results if r["response_time"] and r["response_time"] > 0.5]

    lines = [
        "# FinanceTrack — Feature Test Report",
        "",
        f"**Branch:** `{branch}`  ",
        f"**Date:** {date.today().isoformat()}  ",
        f"**Result:** {passed}/{total} tests passed ({score}%)",
        "",
        "---",
        "",
        "## Summary by Section",
        "",
        "| Section | Pass | Fail | Status |",
        "|---------|------|------|--------|",
    ]

    for sec, data in sections_summary.items():
        icon = "OK" if data["fail"] == 0 else ("PARTIAL" if data["pass"] > 0 else "FAIL")
        lines.append(f"| {sec} | {data['pass']} | {data['fail']} | {icon} |")

    lines += [
        "",
        "---",
        "",
        "## Detailed Results",
        "",
    ]

    for sec, data in sections_summary.items():
        lines.append(f"### {sec}")
        lines.append("")
        for item in data["items"]:
            icon = "[PASS]" if item["passed"] else "[FAIL]"
            ms = f" ({item['response_time']*1000:.0f}ms)" if item["response_time"] else ""
            detail_str = f" — {item['detail']}" if item["detail"] else ""
            lines.append(f"- {icon} **{item['name']}**{detail_str}{ms}")
        lines.append("")

    if failed > 0:
        lines += [
            "---",
            "",
            "## Failed Tests",
            "",
        ]
        for r in results:
            if not r["passed"]:
                lines.append(f"- **[{r['section']}] {r['name']}** — {r['detail']}")
        lines.append("")

    if slow:
        lines += [
            "---",
            "",
            "## Slow Responses (>500ms)",
            "",
        ]
        for r in slow:
            lines.append(f"- **{r['name']}** — {r['response_time']*1000:.0f}ms")
        lines.append("")

    lines += [
        "---",
        "",
        "## Notes",
        "",
        "- Tests create temporary records and clean them up after each section",
        "- Auth tests verify both valid and invalid credential flows",
        "- Joint view requires both users to have accounts",
        "- Google Sheets and CSV import endpoints tested for existence only (no real credentials)",
        "- Paystub PDF parsing tested via manual-entry path (no PDF upload in this test)",
        "",
        f"**Overall score: {score}% ({passed}/{total})**",
    ]

    return "\n".join(lines)


# ─────────────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8000/api/v1")
    parser.add_argument("--report-file", default="TEST_REPORT.md")
    args = parser.parse_args()

    global BASE
    BASE = args.base

    # Get current branch
    import subprocess
    try:
        branch = subprocess.check_output(
            ["git", "branch", "--show-current"], cwd="..", text=True
        ).strip()
    except Exception:
        branch = "unknown"

    print(f"\nFinanceTrack Feature Test Agent")
    print(f"Branch: {branch}")
    print(f"API:    {BASE}")
    print(f"{'='*60}")

    # Check API reachability
    try:
        r = requests.get(f"{BASE.rstrip('/api/v1')}/", timeout=5)
    except Exception:
        try:
            r = requests.get(f"{BASE}/dashboard", timeout=5)
        except Exception as e:
            print(f"\nERROR: Cannot reach API at {BASE}")
            print(f"  Make sure the backend is running:")
            print(f"  cd backend && venv\\Scripts\\activate && uvicorn app.main:app --reload --port 8000")
            sys.exit(1)

    # Run all tests
    tokens = test_auth()
    account_ids = test_accounts(tokens)
    test_balance_snapshots(tokens, account_ids)
    income_cat_id = test_categories(tokens)
    test_transactions(tokens, account_ids, income_cat_id)
    test_dashboard(tokens)
    test_forecast(tokens)
    test_life_events(tokens)
    test_scenarios(tokens)
    test_recurring(tokens, account_ids, income_cat_id)
    test_alerts(tokens)
    test_paystubs(tokens)
    test_financial_profile(tokens)
    test_joint(tokens)
    test_google_sheets(tokens)
    test_import(tokens, account_ids, income_cat_id)
    test_auth_extra(tokens)

    # Cleanup test accounts
    print(f"\n{'='*60}")
    print("  Cleaning up test accounts...")
    cleanup_accounts(tokens, account_ids)

    # Results summary
    total  = len(results)
    passed = sum(1 for r in results if r["passed"])
    failed = total - passed
    score  = round(passed / total * 100) if total else 0

    print(f"\n{'='*60}")
    print(f"  RESULTS: {passed}/{total} passed ({score}%)")
    if failed:
        print(f"  FAILED:  {failed} tests")
        for r in results:
            if not r["passed"]:
                print(f"    - [{r['section']}] {r['name']}: {r['detail']}")
    print(f"{'='*60}\n")

    # Write report
    report = generate_report(branch)
    report_path = args.report_file
    with open(report_path, "w", encoding="utf-8") as f:
        f.write(report)
    print(f"Report written to: {report_path}\n")

    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
