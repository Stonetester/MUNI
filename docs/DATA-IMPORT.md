# MUNI Data Import & Re-upload Reference

_Every path data enters the app, its dedup/idempotency semantics, and the bulk
re-upload playbook. Last verified against the code 2026-07-04 (prod `13a1e1b`)._

**Design rule (since 2026-07-04): re-uploading anything is safe and enriching.**
Nothing duplicates; a better parse updates the stored record; a parse that couldn't
extract a field never erases stored data ("better parse wins, missing data never wins").

---

## 1. Paystubs (`/paystubs` page → `POST /paystubs`)

**Parsing** (`services/paystub_parser.py`): pdfplumber + regex; two employer formats —
Paylocity (Keaton) and G&P/Grimm & Parker (Katherine) — with per-field fallback
patterns. Guards worth knowing:
- the bare "401k" employee pattern has a negative-lookbehind so it can never capture an
  employer line ("Employer 401k", "401K-ER", "401 Safe H") as the employee deduction
- bonus detection requires a period+YTD **pair** (G&P carries the YTD bonus on every
  later stub — a lone YTD is a carry-forward, not a bonus); `pay_type="bonus"` only
  when bonus > 0 AND regular == 0

**On save**, the app automatically creates income transactions tagged
`import_source="paystub:{id}"`:
- net pay → Salary (or Bonus) income transaction into the deposit account
  (priority: checking > savings > hysa > paycheck > other)
- employer 401k (if > 0) → Employer-401k transaction into the 401k account
  (classified as retirement asset, not spendable income — see CALCULATIONS.md §1)

Plus two side effects: the Salary recurring rule is auto-created/updated when net pay
moves >3% (forecast income signal), and `employee_401k_per_paycheck` syncs to the
profile so the dashboard never shows a stale manual value.

**Dedup & re-upload:** one stub per **(user, pay_date, pay_type)**.
- Re-uploading an existing stub → 409 → the page marks it *Duplicate* and offers
  **Update** / **Update All Duplicates** → resaves with `overwrite=true`, which updates
  the stub in place with the fresh parse and **deletes + recreates its linked
  transactions** (never stale extras, never duplicates).
- A bonus check and a regular check on the same pay date are two different stubs and
  can never overwrite each other.
- If a parser update reclassifies the same physical check (regular↔bonus), a date-only
  fallback still matches it — but only when net pay matches to the cent.

**Updating/deleting** a stub (`PUT`/`DELETE /paystubs/{id}`) always regenerates/removes
its transactions atomically. `DELETE /paystubs` (no id) wipes all stubs + their
transactions for the current user.

---

## 2. Statements — two upload surfaces, one truth

**Parsing** (`services/statement_parser.py`): pdfplumber + regex for **EverBank**
(HYSA), **John Hancock** (401k), **Schwab** (IRA/brokerage), **Fidelity NetBenefits**
(401k). Extracted per statement:
- institution, statement date, ending balance, account-number hint
- `period_contributions` — money added THIS period (the first/period column, not
  YTD/inception). Labels per institution: Schwab `Deposits`; Fidelity
  `Your Contributions` + `Employer Contributions`; JH `EE ELECTIVE DEFERRAL`,
  `SAFE HARBOR NON-ELECTIVE CONTR`, `ER PROFIT SHARING`, `Transfers into the plan`
- `employer_contributions` — the employer-paid **subset**, when itemized (Fidelity/JH).
  `None` (not 0) for institutions that don't itemize it — callers can distinguish
  "not itemized" from "employer contributed nothing"
- holdings (JH/Schwab/Fidelity): funds with values/weights; JH & Fidelity list fund
  NAMES, not tickers, so a stable slug is generated for cross-statement matching
- Fidelity's stated personal rate of return, when printed

**Why contributions must be persisted:** the XIRR return window runs through the last
snapshot with *recorded* contributions (CALCULATIONS.md §4). A snapshot saved without
them silently falls out of the measured-return window. (This was the 2026-07-03 finding:
the UI path dropped contributions entirely, so measured returns froze at the June bulk
import.)

### 2a. `/statements` page → `POST /balance-snapshots`

For any statement; creates a balance snapshot only (no holdings). Contributions are
shown as an editable field on the review card and saved with the snapshot.
- **Dedup:** by account + date. Re-uploading returns the existing snapshot but
  **backfills** `contributions`/`employer_contributions` where the stored value is
  NULL (fill-only — this endpoint never overwrites, since it also serves manual
  snapshots).
- `Account.balance` syncs to the newest snapshot.

### 2b. Investments page → `POST /statements/apply` (`services/statement_apply.py`)

The full-enrichment path for investment statements: snapshot **and** holdings.
- **Dedup:** by account + date — re-import is an **enrich**, not an error
  (was a 409 "delete first" until 2026-07-04):
  - balance refreshed to the parsed value (the statement is the source of truth)
  - `contributions`/`employer_contributions` overwritten when the fresh parse carries a
    value; left alone when it doesn't
  - response reports `snapshot_action: created | updated`
- **Holdings reconciliation — the LATEST statement is authoritative:**
  - latest statement (date ≥ every existing snapshot): upserts every listed holding
    (value + weight) and **prunes** holdings it omits (sold positions)
  - an **older** statement only backfills missing holdings — it never overwrites
    current values and never prunes (so bulk re-upload order doesn't matter and sold
    positions can't be resurrected)
- `Account.balance` syncs only when this statement is the newest.

**Statement PDFs are NOT retained** — parsing happens on a temp file. Re-parsing
requires re-uploading the PDF; that's why re-upload had to be idempotent.

---

## 3. Google Sheets sync (`services/google_sheets_sync.py`)

APScheduler polls every 30 minutes per user (plus manual "Sync Now"). Monthly tabs
(`Jan 2025`, …) → transactions.
- **Dedup:** SHA-256 hash of (date + description + amount) — safe to sync repeatedly
- **Upsert:** if a sheet row's amount changes, the app transaction updates next sync
- **Income detection:** category containing income/salary/freelance/wages/… keeps the
  amount positive (mapped to Salary/Side Income) instead of being negated as an expense
- **HYSA auto-categorize:** descriptions matching `hysa`/`everbank`/`high yield` →
  Savings Transfer (this is what the HYSA measurement in CALCULATIONS.md §3 reads)
- Katherine's sheet uses its own column format (Item/Type/Price/Status); her
  roth/roth-ira rows → Savings Transfer
- Skipped rows land in a reviewable duplicate list with reasons

**House rule encoded here:** the sheets record actual purchases only — no credit-card
payments or internal transfers — so there's no double-count with the CC-pass-through
money flow.

---

## 4. CSV / XLSX import (`Transactions → Import`, `backend/import/` bulk utility)

Historical backfill. Columns auto-mapped (Date/Description/Amount); rows tagged
`import_source="csv"`. The bulk Excel utility auto-discovers account/category IDs —
**IDs differ between local and prod databases**; verify the mapping before running it
against CT 102 (a hardcoded map imported against the wrong DB corrupts data).

---

## 5. The bulk re-upload playbook (per user — log in as each)

| What | Where | Result |
|---|---|---|
| All paystubs (any order) | `/paystubs` batch upload | new stubs save; existing flag as Duplicate → **Update All Duplicates** refreshes every field the parser now captures and regenerates transactions cleanly |
| 401k/IRA/brokerage statements (JH, Schwab, Fidelity — any order) | **Investments page** uploader | snapshots enriched (contributions + employer split), holdings land/update, XIRR windows extend |
| EverBank statements | `/statements` page | deduped snapshots (nothing further to enrich — EverBank has no contributions/holdings to parse) |

After a full re-upload: Katherine's measured employer match activates (Fidelity
`Employer Contributions` → snapshot → CALCULATIONS.md §2 hierarchy), measured-return
windows extend through every statement, and holdings match the latest statements.

---

## 6. Traceability

Every imported transaction carries `import_source`:
`"paystub:42"` · `"sheets:JAN2025"` · `"csv"` · manual entries have none.
The Foresight drill-downs surface it on every source-transaction row, so any number can
be traced from a dashboard tile through its formula down to the physical document that
produced each input.
