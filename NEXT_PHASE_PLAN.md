# FinanceTrack — Next Phase Build Plan
_Saved 2026-03-18. Resume from here._

---

## Google Sheets Auto-Sync — Setup Steps

**Complete these 7 steps before resuming development.**

### 1. Create a Google Cloud Project
- Go to https://console.cloud.google.com
- Click the project dropdown at top → **New Project**
- Name it `FinanceTrack` → **Create**
- Wait for creation, then make sure it's selected

### 2. Enable Google Sheets API
- Left menu → **APIs & Services** → **Library**
- Search `Google Sheets API` → click it → **Enable**

### 3. Create a Service Account
- Left menu → **APIs & Services** → **Credentials**
- Click **+ Create Credentials** → **Service Account**
- Name: `financetrack-sync` → **Create and Continue** → **Done** (skip optional steps)

### 4. Download the Key File
- On the Credentials page, click the service account email just created
- Go to the **Keys** tab → **Add Key** → **Create New Key** → **JSON** → **Create**
- A `.json` file downloads — save it

### 5. Place the Key in the App
- Create this folder: `C:\Users\keato\financeTool\backend\credentials\`
- Move the downloaded JSON file there and rename it exactly: `google-sheets-key.json`
- Add `backend/credentials/` to `.gitignore` (contains secrets — never commit)

### 6. Share the Google Sheet with the Service Account
- Open "Keaton's monthly spending" Google Sheet
- Click **Share** (top right)
- Paste the service account email (looks like `financetrack-sync@financetrack-XXXXX.iam.gserviceaccount.com`)
- Set access to **Viewer** → **Send**
- Repeat for Katherine's sheet if she has a separate one

### 7. Get Your Sheet ID
- Look at the Google Sheet URL:
  `https://docs.google.com/spreadsheets/d/`**`[SHEET_ID_HERE]`**`/edit`
- Copy just the middle part (between `/d/` and `/edit`)
- You'll paste this into the app's Settings page (UI to be built)

---

## Full Feature Build Plan

### Feature 1 — Google Sheets Auto-Sync

**How it works:**
- Backend polls the sheet every 30 minutes using a background scheduler (APScheduler)
- Reads all monthly tabs (one per month format matching existing sheet structure)
- Column mapping: `Expense` → description, `Transaction Date` → date, `Type` → category, `Price` → amount (negated), `Status` → payment_method
- Deduplicates by hash of (date + description + amount) — re-syncing never creates duplicates
- New rows you add to the sheet appear in the app within 30 minutes automatically
- Settings page UI: paste Sheet ID, see last sync time, trigger manual "Sync Now"

**New files needed:**
- `backend/credentials/google-sheets-key.json` _(you place this, never committed)_
- `backend/app/services/google_sheets_sync.py` — sync logic
- `backend/app/routers/google_sheets.py` — `/sync/google-sheets` endpoint
- `backend/app/models/sync_config.py` — stores sheet ID + last sync time per user
- Frontend: Settings page → new "Google Sheets" card with Sheet ID input + sync status

**Dependencies to add:**
```
google-api-python-client
google-auth
apscheduler
```

---

### Feature 2 — Financial Profile Page (`/financial-profile`)

One page per user. Each section has a **visibility toggle** — hide sections for accounts the user doesn't have (e.g., Katherine hides student loans if she has none).

**Sections:**

#### Salary & Paycheck
- Gross annual salary
- Pay frequency (semi-monthly, biweekly, monthly)
- Net take-home per paycheck
- Other income fields (side income, bonus)

#### Student Loans (hideable)
- Per-loan entries: loan name, current balance, interest rate %, minimum monthly payment, servicer name
- **Keaton's loans:**
  - Loan 1: $343.35 remaining @ 4.80%
  - Loan 2: $1,921.40 remaining @ 4.28%
- App auto-reduces balance when a "Student Loans" category transaction posts
- When multiple loans exist: user tags which loan each payment applies to (or split)
- Shows: monthly interest accruing, total paid to date, projected payoff date, total interest remaining
- At current balances both loans are nearly paid off (Loan 1 ~1 month, Loan 2 ~a few months)

#### 401(k) (hideable)
- Employee contribution per paycheck: `$380`
- Employer contribution: `6% of salary regardless of employee contribution`
  - Keaton: 6% × $116,500 ÷ 24 = **$291.25/paycheck** employer contribution
- Fund allocations: enter ticker, fund name, current value, and % weight
  - Updatable anytime (you check your statement quarterly and update)
- Projects balance using each fund's historical return rate
- Shows: total balance, projected balance at 1/5/10/20/30 years

#### IRA (hideable)
- Monthly contribution: `$450/month total`
  - `$225/month → SWPPX` (Schwab S&P 500 Index, ~10.4% historical)
  - `$225/month → SWISX` (Schwab International Index, ~6.8% historical)
- Current IRA balance: user enters and updates as needed
- **Allocation recommendation (from finance skills analysis):**
  - Current 50/50 SWPPX/SWISX is solid — good international diversification
  - Slight tilt to 60/40 SWPPX/SWISX would lean into US equity outperformance
  - Neither is wrong; 50/50 is defensible — don't change unless you have a reason
- Projects balance at key dates (retirement, 5yr, 10yr, 20yr)

#### HYSA / Savings (hideable)
- APY: `3.9%` (EverBank)
- Monthly contribution: `$1,600/month`
- Current balance: user enters, updates manually
- Projected balances: wedding date (Oct 2026), 1yr, 2yr, 5yr
- Shows: interest earned YTD, total contributions YTD

#### Other Accounts (hideable per account)
- Any account type can be toggled active/hidden per user
- Hidden accounts are excluded from dashboard and forecast

#### Google Sheets Sync Config
- Sheet ID input field
- Last sync timestamp
- Manual "Sync Now" button
- Sync status (success / error / never synced)

---

### Feature 3 — Student Loan Auto-Tracker

- User enters starting balance and interest rate per loan in Financial Profile
- Every "Student Loans" transaction auto-reduces the principal (interest accrues monthly between payments)
- When user has two loans: a sub-category tag or dropdown on the transaction to specify which loan
- Dashboard/Insights widget: remaining balance per loan, payoff date, total interest left to pay
- Amortization schedule viewable in Financial Profile

---

### Feature 4 — Investment Growth Projections

Compound growth math per account using actual fund allocations and historical return rates.

| Account | Contributions | Return basis |
|---------|--------------|--------------|
| 401k | $380 employee + $291.25 employer/paycheck | Weighted avg of fund allocations entered by user |
| IRA | $225 SWPPX + $225 SWISX/month | SWPPX: 10.4%/yr, SWISX: 6.8%/yr blended |
| HYSA | $1,600/month | 3.9% APY compounded monthly |

- Projections shown on Financial Profile page and in Forecast
- Key milestone dates highlighted: wedding month, 1yr, 5yr, retirement (configurable age)
- Side-by-side: "current trajectory" vs "if you increase contribution by $X"

---

### Feature 5 — Katherine's Profile

- Katherine logs in and navigates to `/financial-profile`
- All same sections available, she fills in her own values
- Sections she doesn't use she can toggle hidden (they won't show on her dashboard)
- Both users' data stays isolated (existing JWT-based user isolation)

---

## New Backend Models Needed

```
UserSyncConfig       — sheet_id, last_sync_at, sync_enabled per user
StudentLoan          — user_id, loan_name, original_balance, current_balance,
                       interest_rate, minimum_payment, servicer, is_active
InvestmentHolding    — account_id, ticker, fund_name, current_value,
                       monthly_contribution, weight_percent
FinancialProfile     — user_id, gross_salary, pay_frequency, net_per_paycheck,
                       employer_401k_percent, hidden_sections (JSON list)
```

New Alembic migration required for all of the above.

---

## New Frontend Pages / Components Needed

```
/financial-profile          — main Financial Profile page (tabbed sections)
/financial-profile/loans    — student loan detail + amortization
components/profile/
  SalarySection.tsx
  StudentLoanSection.tsx
  FourOhOneKSection.tsx
  IRASection.tsx
  HYSASection.tsx
  InvestmentProjectionChart.tsx
  LoanPayoffChart.tsx
```

---

## Dependency Changes

```
# backend/requirements.txt additions:
google-api-python-client>=2.100.0
google-auth>=2.23.0
apscheduler>=3.10.0
```

---

## .gitignore Additions Needed

```
# Google Sheets credentials (secrets — never commit)
backend/credentials/
```

---

## Resume Checklist

When picking back up, do these in order:

- [ ] Complete Google Sheets steps 1–7 above
- [ ] Confirm `backend/credentials/google-sheets-key.json` is in place
- [ ] Confirm Sheet ID is ready to paste into Settings
- [ ] Tell Claude: "Ready to build — Sheet ID is [XXXX]"
- [ ] Claude builds: Google Sheets sync service + backend models + migration
- [ ] Claude builds: Financial Profile page (all sections)
- [ ] Claude builds: Student loan tracker
- [ ] Claude builds: Investment projection charts
- [ ] Test: add a row to Google Sheet, wait 30 min, confirm it appears in Transactions

---

---

## Phase 4 — Paystub Parser, Historical Data Entry, Joint HYSA
_Planned 2026-03-18. Build after Phase 3 Google Sheets + Financial Profile._

---

### Feature A — Paystub Screenshot Parser

**How it works:**
1. User uploads a paystub screenshot (JPG, PNG, or PDF) from `/paystubs` page
2. Backend sends the image to the **Claude Vision API** with a structured extraction prompt
3. Claude returns a JSON object with every field parsed off the paystub
4. User sees a pre-filled review form — can correct any field before saving
5. Confirmed paystub is saved to the database and feeds into tax tracking, income history, and projections

**Why Claude Vision instead of Tesseract/OCR:**
- Paystubs have wildly different layouts by employer — Claude handles any format
- It understands context ("this is FICA" → maps to Social Security + Medicare correctly)
- Handles PDFs, poor photo quality, rotated images
- Already in the Claude ecosystem

**Requires:** `ANTHROPIC_API_KEY` in `backend/.env` — add this:
```
ANTHROPIC_API_KEY=sk-ant-...
```

**Fields extracted from every paystub:**

| Group | Fields |
|---|---|
| Period | pay_date, period_start, period_end |
| Earnings | gross_pay, regular_pay, overtime_pay, bonus |
| Pre-tax deductions | 401k, health_insurance, dental, vision, hsa, fsa, life_insurance |
| Taxes | federal, state, social_security (6.2%), medicare (1.45%), local |
| Post-tax | roth_401k, other post-tax deductions |
| Employer side | employer_401k_match, employer_health_contribution |
| Net | net_pay |
| YTD | ytd_gross, ytd_net, ytd_401k, ytd_federal_tax, ytd_state_tax |
| Meta | employer name, parse_confidence score (0–1) |

**New frontend page: `/paystubs`**
- Upload zone (drag & drop or click to browse)
- "Parsing…" loading state while Claude processes
- Review form: all extracted fields editable, color-coded (green = high confidence, yellow = review suggested)
- History tab: all saved paystubs in a timeline
- Summary stats: YTD income, YTD taxes paid, effective tax rate, YTD 401k contributions
- Trend charts: net pay over time, tax burden over time, deduction breakdown per check

**New backend files:**
```
backend/app/models/paystub.py          — Paystub model (all fields above)
backend/app/routers/paystubs.py        — POST /parse (upload+AI), POST / (save), GET /
backend/app/services/paystub_parser.py — Claude Vision API call + JSON extraction logic
backend/uploads/paystubs/              — image storage (add to .gitignore)
```

**New dependency:**
```
anthropic>=0.25.0    # Claude API SDK
```

**Paystub model sketch:**
```python
class Paystub(Base):
    __tablename__ = "paystubs"
    id, user_id, pay_date, period_start, period_end
    gross_pay, regular_pay, overtime_pay, bonus
    deduction_401k, deduction_health, deduction_dental, deduction_vision
    deduction_hsa, deduction_fsa, deduction_life_insurance
    tax_federal, tax_state, tax_social_security, tax_medicare, tax_local
    deduction_roth_401k
    employer_401k_match, employer_health_contribution
    net_pay
    ytd_gross, ytd_net, ytd_401k, ytd_federal_tax, ytd_state_tax
    employer, raw_image_path, parse_confidence, notes, created_at
```

---

### Feature B — Historical Data Entry (Past Paystubs + Investment Statements)

Two sub-features under the same `/paystubs` and `/financial-profile` pages.

#### B1 — Past Paystub History
- Same upload + parse flow as Feature A, just with past dates
- User can upload multiple at once — each gets queued and parsed sequentially
- Or: manual entry form with all fields pre-populated to 0 (for paystubs where user doesn't have the image)
- Once past paystubs are entered, the app can show:
  - Accurate YTD figures at any point in time
  - Effective tax rate history (did your withholding change?)
  - 401k contribution accuracy (did employer match come through every period?)
  - Annual income history across years

**UI on `/paystubs`:**
- "Upload Past Paystubs" button → multi-file picker
- Progress list: file 1 ✓ parsed, file 2 ⏳ parsing, file 3 ⏰ queued
- All paystubs shown on a timeline, filterable by year

#### B2 — Investment Statement History (401k, IRA, Brokerage)
- Manual entry form (no OCR for statements — too many formats, values matter more than speed)
- One form per statement: select account, enter dates + values
- Fields:
  - Statement date (quarter end typically)
  - Beginning balance, ending balance
  - Employee contributions this period
  - Employer contributions this period
  - Investment gains/losses (ending minus beginning minus contributions)
  - Dividends reinvested
  - Fees
  - Optional: fund-level breakdown (ticker, shares, value, gain/loss)
- Once entered, the projection engine uses **actual historical return rates** instead of assumed %
- Charts: account balance over time (true history + projected future), actual vs assumed return rate

**New model: `InvestmentStatement`**
```python
class InvestmentStatement(Base):
    __tablename__ = "investment_statements"
    id, account_id, statement_date, period_start
    beginning_balance, ending_balance
    employee_contributions, employer_contributions
    investment_gains, dividends, fees
    fund_holdings   # JSON: [{ticker, shares, value, gain_loss}]
    notes, raw_image_path, created_at
```

**New backend files:**
```
backend/app/models/investment_statement.py
backend/app/routers/investment_statements.py  — GET, POST, PUT, DELETE
```

**New frontend:**
```
/financial-profile → "Statement History" tab per account
  - Timeline of past statements
  - "Add Statement" form (manual entry)
  - Balance chart: actual past + projected future stitched together
```

---

### Feature C — Joint HYSA (Shared Account Between Keaton + Katherine)

**The situation:**
- Keaton and Katherine share one EverBank HYSA
- Keaton contributes $1,600/month
- Katherine contributes a different amount (she'll enter this in her Financial Profile)
- Both are on the account; balance is shared
- Both should see it in their app, but it should not be double-counted in a couple's combined net worth view

**Implementation approach: `is_joint` flag + `joint_user_id` on Account**

The account lives under Keaton's user (primary owner). Two fields are added:
```python
is_joint = Column(Boolean, default=False)
joint_user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
```

**What changes in the API:**
- `GET /accounts` now returns: (user's own accounts) UNION (accounts where joint_user_id = current_user.id)
- Joint accounts are returned to both users — Katherine sees the HYSA in her accounts list
- Both users can add balance snapshots to the joint account
- Account shows a "Joint" badge in the UI

**Contribution tracking (per user):**
- Each user has their own recurring rule pointing to the joint account:
  - Keaton: `+$1,600/mo → EverBank HYSA`
  - Katherine: `+$X/mo → EverBank HYSA`
- Financial Profile HYSA section shows: "Your contribution: $1,600/mo | Partner's contribution: $X/mo | Total: $(1,600+X)/mo"

**Net worth handling:**
- Individual view: both users see full HYSA balance (it's joint money, both are entitled to it)
- Couple's combined view (future toggle): HYSA counted once, not twice
- The couple's combined view is a stretch goal — individual views (each user sees full balance) is Phase 4

**DB migration needed:**
```sql
ALTER TABLE accounts ADD COLUMN is_joint BOOLEAN DEFAULT FALSE;
ALTER TABLE accounts ADD COLUMN joint_user_id INTEGER REFERENCES users(id);
```

**New frontend:**
- Account creation modal: "Make this a joint account?" toggle → select partner user
- Joint accounts show a "👥 Joint" badge in accounts list and dashboard
- HYSA section of Financial Profile: shows both users' contribution amounts + combined total

---

### Phase 4 — New Files Summary

```
backend/app/models/paystub.py
backend/app/models/investment_statement.py
backend/app/routers/paystubs.py
backend/app/routers/investment_statements.py
backend/app/services/paystub_parser.py     ← Claude Vision API call
backend/uploads/paystubs/                  ← image storage (gitignored)

frontend/src/app/paystubs/page.tsx          ← upload + history + stats
frontend/src/app/paystubs/review/page.tsx   ← post-parse review + confirm form
frontend/src/components/paystubs/
  PaystubUploadZone.tsx
  PaystubReviewForm.tsx
  PaystubTimeline.tsx
  PaystubSummaryStats.tsx
  InvestmentStatementForm.tsx
```

### Phase 4 — New Dependencies
```
anthropic>=0.25.0              # Claude Vision API (paystub parsing)
python-multipart>=0.0.12       # already in requirements, needed for file uploads
```

### Phase 4 — .gitignore Additions
```
backend/uploads/               # paystub images (personal data)
```

### Phase 4 — Resume Checklist
- [ ] Phase 3 (Google Sheets + Financial Profile) complete first
- [ ] Add ANTHROPIC_API_KEY to `backend/.env`
- [ ] Ask Katherine what her monthly HYSA contribution is
- [ ] Build Feature C (joint HYSA) — smallest change, highest impact
- [ ] Build Feature A (paystub parser) — depends on Anthropic key being set
- [ ] Build Feature B (historical statements) — manual entry, no dependencies
- [ ] Test: upload a real paystub screenshot, verify all fields parse correctly

---

## Known Issues / Bugs Fixed This Session

- `bcrypt==5.x` incompatible with `passlib==1.7.4` → pinned `bcrypt==4.0.1` in `requirements.txt`
- Syntax error in `getting-started/page.tsx` (unescaped apostrophe in single-quoted string) → fixed
- Seed script previously hard-coded all personal financial data → replaced with users + categories only

---

## Current Git State

- Branch: `feature/insights` (all recent work here)
- All commits pushed to `origin/feature/insights`
- Ready to merge `feature/insights` → `dev` → `main` when new phase is complete
