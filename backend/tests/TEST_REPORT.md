# FinanceTrack — Feature Test Report

**Branch:** `feature/historical-import`  
**Date:** 2026-03-19  
**Result:** 69/69 tests passed (100%)

---

## Summary by Section

| Section | Pass | Fail | Status |
|---------|------|------|--------|
| Auth | 6 | 0 | OK |
| Accounts | 6 | 0 | OK |
| Snapshots | 5 | 0 | OK |
| Categories | 5 | 0 | OK |
| Transactions | 6 | 0 | OK |
| Dashboard | 7 | 0 | OK |
| Forecast | 6 | 0 | OK |
| Life Events | 4 | 0 | OK |
| Scenarios | 3 | 0 | OK |
| Recurring | 4 | 0 | OK |
| Alerts | 1 | 0 | OK |
| Paystubs | 4 | 0 | OK |
| Financial Profile | 5 | 0 | OK |
| Joint | 5 | 0 | OK |
| Google Sheets | 1 | 0 | OK |
| Import | 1 | 0 | OK |

---

## Detailed Results

### Auth

- [PASS] **Login as keaton** — JWT received (2274ms)
- [PASS] **Login as katherine** — JWT received (2228ms)
- [PASS] **Reject bad credentials** — HTTP 401: Incorrect username or password (2225ms)
- [PASS] **Reject unauthenticated request** — HTTP 401: Not authenticated (2031ms)
- [PASS] **GET /auth/me returns current user** (2027ms)
- [PASS] **Change password rejects wrong current password** — HTTP 400: Current password is incorrect (2228ms)

### Accounts

- [PASS] **GET /accounts returns list** — 0 accounts (2038ms)
- [PASS] **POST /accounts creates checking** — id=1 (2038ms)
- [PASS] **POST /accounts creates savings** — id=2 (2037ms)
- [PASS] **POST /accounts creates 401k** (2025ms)
- [PASS] **PUT /accounts/:id updates account** (2038ms)
- [PASS] **GET /accounts/:id returns single** (2033ms)

### Snapshots

- [PASS] **POST /balance-snapshots creates snapshot** — id=1 (2034ms)
- [PASS] **POST second snapshot (different date)** (2042ms)
- [PASS] **GET /balance-snapshots?account_id filters correctly** — 2 snapshots (2047ms)
- [PASS] **DELETE /balance-snapshots/1** (2041ms)
- [PASS] **DELETE /balance-snapshots/2** (2039ms)

### Categories

- [PASS] **GET /categories returns default categories** — 35 categories (2044ms)
- [PASS] **Income category exists (kind=income)** — found: Bonus
- [PASS] **POST /categories creates category** — id=36 (2044ms)
- [PASS] **PUT /categories/:id updates with budget** (2040ms)
- [PASS] **DELETE /categories/:id** (2044ms)

### Transactions

- [PASS] **POST /transactions creates income transaction** — id=1 (2041ms)
- [PASS] **POST /transactions creates expense transaction** — id=2 (2035ms)
- [PASS] **GET /transactions with pagination** — 2 items (2042ms)
- [PASS] **GET /transactions?account_id filter** (2045ms)
- [PASS] **GET /transactions?start_date&end_date filter** (2039ms)
- [PASS] **PUT /transactions/:id updates** (2049ms)

### Dashboard

- [PASS] **GET /dashboard returns data** (2049ms)
- [PASS] **Dashboard has net_worth field**
- [PASS] **Dashboard has total_assets field**
- [PASS] **Dashboard has this_month block**
- [PASS] **Dashboard has recent_transactions**
- [PASS] **Dashboard has forecast_preview**
- [PASS] **Dashboard has upcoming_events**

### Forecast

- [PASS] **GET /forecast returns data** (2057ms)
- [PASS] **Forecast has points array** — 60 points
- [PASS] **Forecast has 60-month horizon**
- [PASS] **Forecast point has net_worth field**
- [PASS] **Forecast point has income/expenses**
- [PASS] **GET /forecast with months_past + months_future params** (2044ms)

### Life Events

- [PASS] **GET /events returns list** — 0 events (2038ms)
- [PASS] **POST /events creates event** — id=1 (2052ms)
- [PASS] **PUT /events/:id updates** (2055ms)
- [PASS] **DELETE /events/:id removes** (2056ms)

### Scenarios

- [PASS] **GET /scenarios returns list** — 1 scenarios (2041ms)
- [PASS] **POST /scenarios creates scenario** — id=2 (2046ms)
- [PASS] **POST /scenarios/:id/clone duplicates** — clone id=3 (2045ms)

### Recurring

- [PASS] **GET /recurring returns list** — 1 rules (2040ms)
- [PASS] **POST /recurring creates rule** — id=2 (2045ms)
- [PASS] **PUT /recurring/:id updates rule** (2059ms)
- [PASS] **DELETE /recurring/:id removes rule** (2040ms)

### Alerts

- [PASS] **GET /alerts returns list** — 0 alerts (2038ms)

### Paystubs

- [PASS] **GET /paystubs returns list** — 5 paystubs (2041ms)
- [PASS] **POST /paystubs creates paystub** — id=6 (2085ms)
- [PASS] **GET /paystubs/:id returns single** (2052ms)
- [PASS] **DELETE /paystubs/:id removes** (2048ms)

### Financial Profile

- [PASS] **GET /financial-profile returns profile** (2052ms)
- [PASS] **PUT/POST /financial-profile saves salary data** (2047ms)
- [PASS] **GET /financial-profile/loans returns list** — 0 loans (2052ms)
- [PASS] **POST /financial-profile/loans creates loan** — id=1 (2045ms)
- [PASS] **GET /financial-profile/holdings returns list** — 0 holdings (2032ms)

### Joint

- [PASS] **GET /joint/summary returns combined net worth** — net_worth=56500.0 (2029ms)
- [PASS] **GET /joint/accounts returns all accounts with owner field** — 3 accounts (2026ms)
- [PASS] **Each account has owner field**
- [PASS] **GET /joint/transactions returns cross-user txns** (2041ms)
- [PASS] **Joint transactions have owner field**

### Google Sheets

- [PASS] **GET /sync/google-sheets/config returns config** (2041ms)

### Import

- [PASS] **POST /import endpoint exists** — HTTP 422: [{'type': 'missing', 'loc': ['body', 'file'], 'msg': 'Field required', 'input': None}] (2033ms)

---

## Slow Responses (>500ms)

- **Login as keaton** — 2274ms
- **Login as katherine** — 2228ms
- **Reject bad credentials** — 2225ms
- **Reject unauthenticated request** — 2031ms
- **GET /auth/me returns current user** — 2027ms
- **GET /accounts returns list** — 2038ms
- **POST /accounts creates checking** — 2038ms
- **POST /accounts creates savings** — 2037ms
- **POST /accounts creates 401k** — 2025ms
- **PUT /accounts/:id updates account** — 2038ms
- **GET /accounts/:id returns single** — 2033ms
- **POST /balance-snapshots creates snapshot** — 2034ms
- **POST second snapshot (different date)** — 2042ms
- **GET /balance-snapshots?account_id filters correctly** — 2047ms
- **DELETE /balance-snapshots/1** — 2041ms
- **DELETE /balance-snapshots/2** — 2039ms
- **GET /categories returns default categories** — 2044ms
- **POST /categories creates category** — 2044ms
- **PUT /categories/:id updates with budget** — 2040ms
- **DELETE /categories/:id** — 2044ms
- **POST /transactions creates income transaction** — 2041ms
- **POST /transactions creates expense transaction** — 2035ms
- **GET /transactions with pagination** — 2042ms
- **GET /transactions?account_id filter** — 2045ms
- **GET /transactions?start_date&end_date filter** — 2039ms
- **PUT /transactions/:id updates** — 2049ms
- **GET /dashboard returns data** — 2049ms
- **GET /forecast returns data** — 2057ms
- **GET /forecast with months_past + months_future params** — 2044ms
- **GET /events returns list** — 2038ms
- **POST /events creates event** — 2052ms
- **PUT /events/:id updates** — 2055ms
- **DELETE /events/:id removes** — 2056ms
- **GET /scenarios returns list** — 2041ms
- **POST /scenarios creates scenario** — 2046ms
- **POST /scenarios/:id/clone duplicates** — 2045ms
- **GET /recurring returns list** — 2040ms
- **POST /recurring creates rule** — 2045ms
- **PUT /recurring/:id updates rule** — 2059ms
- **DELETE /recurring/:id removes rule** — 2040ms
- **GET /alerts returns list** — 2038ms
- **GET /paystubs returns list** — 2041ms
- **POST /paystubs creates paystub** — 2085ms
- **GET /paystubs/:id returns single** — 2052ms
- **DELETE /paystubs/:id removes** — 2048ms
- **GET /financial-profile returns profile** — 2052ms
- **PUT/POST /financial-profile saves salary data** — 2047ms
- **GET /financial-profile/loans returns list** — 2052ms
- **POST /financial-profile/loans creates loan** — 2045ms
- **GET /financial-profile/holdings returns list** — 2032ms
- **GET /joint/summary returns combined net worth** — 2029ms
- **GET /joint/accounts returns all accounts with owner field** — 2026ms
- **GET /joint/transactions returns cross-user txns** — 2041ms
- **GET /sync/google-sheets/config returns config** — 2041ms
- **POST /import endpoint exists** — 2033ms
- **Change password rejects wrong current password** — 2228ms

---

## Notes

- Tests create temporary records and clean them up after each section
- Auth tests verify both valid and invalid credential flows
- Joint view requires both users to have accounts
- Google Sheets and CSV import endpoints tested for existence only (no real credentials)
- Paystub PDF parsing tested via manual-entry path (no PDF upload in this test)

**Overall score: 100% (69/69)**