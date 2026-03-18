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
  - Keaton: 6% × $130,935 ÷ 24 = **$327.34/paycheck** employer Safe Harbor contribution (verified from March 2026 stub — previous $291.25 estimate was based on stale $116,500 salary)
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

### Feature A — Paystub PDF Parser

**How it works:**
1. User uploads a paystub PDF (or JPG/PNG) from `/paystubs` page
2. Backend uses **pdfplumber** to extract all text directly from the PDF (no AI API needed, no cost)
3. Regex patterns map extracted text to structured fields
4. User sees a pre-filled review form — can correct any field before saving
5. Confirmed paystub saved to DB; feeds income history, tax tracking, deduction trends

**Why pdfplumber (not Claude API, not Tesseract):**
- Keaton's paystubs are Paylocity **digital PDFs** — all text is machine-readable, no OCR needed
- pdfplumber extracts text and tables with 100% accuracy on digital PDFs, for free
- No API key, no internet dependency, no cost per upload
- If a scanned/image PDF is uploaded: automatic fallback to `pytesseract` (also free)
- Tesseract install on Windows: `winget install UB-Mannheim.TesseractOCR`

**Paylocity format — what we know from the March 6 2026 stub:**
The Paylocity layout is consistent. Targeted regex patterns will reliably extract:

| Group | Fields parsed |
|---|---|
| Header | employer, employee_name, pay_date, period_start, period_end, voucher_number |
| Earnings | gross_pay, regular_pay, holiday_pay, overtime_pay, pto_ytd |
| Employer 401k | safe_harbor_contribution (the "401 Safe H" line — e.g. $327.34/period) |
| Taxes | federal (FITW), md_state (MD), md_county (MD-CAL1), social_security (SS), medicare (MED) |
| Deductions | deduction_401k ($380), dental, vision (VISN), life_insurance (GTL+VLIFE), ad_and_d, std_ltd (ER STD/LTD) |
| Net | net_pay, fed_taxable_income |
| YTD | ytd_gross, ytd_net, ytd_401k, ytd_federal_tax, ytd_state_tax, ytd_ss, ytd_medicare |

**Important discovery from the March 6 stub:**
"401 Safe H" = employer Safe Harbor 401k contribution ($327.34 this period, $1,623.99 YTD).
This is ON TOP of the 6% you mentioned — it's separate. The app will track both:
- Employee 401k deduction: $380/period
- Employer Safe Harbor: $327.34/period  ← this was previously untracked

**New frontend page: `/paystubs`**
- Upload zone (drag & drop or click to browse, PDF or image)
- "Parsing…" spinner while pdfplumber runs
- Review form: all extracted fields editable, grouped by section
- History tab: all saved paystubs as a timeline by date
- Summary stats card: YTD gross, YTD net, YTD taxes paid, effective tax rate %, YTD 401k total (employee + employer Safe Harbor)
- Trend charts: net pay over time, deduction breakdown per check, tax burden %

**New backend files:**
```
backend/app/models/paystub.py          — Paystub model
backend/app/routers/paystubs.py        — POST /parse (upload+extract), POST / (save confirmed), GET /
backend/app/services/paystub_parser.py — pdfplumber extraction + regex patterns for Paylocity format
backend/uploads/paystubs/              — PDF storage (gitignored)
```

**New dependencies:**
```
pdfplumber>=0.10.0      # digital PDF text + table extraction (primary)
pytesseract>=0.3.10     # fallback OCR for scanned/image PDFs
pdf2image>=1.16.0       # converts PDF pages to images for pytesseract fallback
Pillow>=10.0.0          # image processing (likely already installed)
```

**Paystub model:**
```python
class Paystub(Base):
    __tablename__ = "paystubs"
    id, user_id, pay_date, period_start, period_end, voucher_number, employer
    # Earnings
    gross_pay, regular_pay, holiday_pay, overtime_pay
    # Employer contributions (tracked separately)
    employer_safe_harbor_401k    # the "401 Safe H" line
    employer_std_ltd             # ER STD/LTD disability coverage
    # Taxes
    tax_federal, tax_state, tax_county, tax_social_security, tax_medicare
    tax_total, fed_taxable_income
    # Employee deductions
    deduction_401k, deduction_dental, deduction_vision
    deduction_life_insurance, deduction_ad_and_d, deduction_std_ltd
    deduction_total
    # Net
    net_pay
    # YTD
    ytd_gross, ytd_net, ytd_401k, ytd_federal_tax, ytd_state_tax
    ytd_ss, ytd_medicare, ytd_taxes_total
    # Meta
    raw_pdf_path, parse_method ("pdfplumber" or "tesseract"), notes, created_at
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

### Feature D — Compensation History (Bonuses, Raises, Awards)

**Where it lives:** Financial Profile page → new "Compensation" tab (alongside Salary, Loans, 401k, etc.)

**What you can log:**

| Type | What gets recorded | Effect on app |
|---|---|---|
| **Raise** | Effective date, old salary, new salary | Forecast updates from that date; salary in profile updates automatically |
| **Bonus** | Date, gross amount, net amount (estimated after tax), bonus type | Shown in income history; optionally creates an income transaction |
| **Spot Award** | Date, description, cash value (if any) | Tracked in compensation history; monetary awards flow into income |
| **Stipend / Allowance** | Date, amount, frequency (one-time or recurring) | Recurring stipends add to forecast as additional income |

**UI — Compensation History timeline:**
```
2025-01-15   Raise        $116,500 → $130,935/yr  (+12.4%)
2025-06-01   Bonus        $3,500 gross / $2,450 net  "Mid-year performance"
2026-01-10   Spot Award   $500  "Q4 recognition"
2026-03-01   Raise        $130,935 → ??? (add when it happens)
```

- Quick-add button: pick type → fill small form → save
- Edit/delete any entry
- Raise entries show % change and annualized impact
- Bonus/award entries show gross + estimated net (user can enter actual net from paystub)

**How raises affect the forecast:**
- When a raise is logged with an effective date, the forecast engine uses the new salary from that date forward
- Old salary used for periods before the raise date (accurate historical projections)
- Employer Safe Harbor 401k recalculates automatically (6% of new salary)

**New model: `CompensationEvent`**
```python
class CompensationEvent(Base):
    __tablename__ = "compensation_events"
    id, user_id
    event_type       # "raise", "bonus", "spot_award", "stipend", "other"
    effective_date
    # Raise fields
    old_salary       # nullable — only for raises
    new_salary       # nullable — only for raises
    # Bonus/award fields
    gross_amount     # nullable — for bonuses/awards
    net_amount       # nullable — user enters actual net from paystub
    # Meta
    description      # "Q4 performance bonus", "spot award — project X", etc.
    notes
    created_at
```

**New backend files:**
```
backend/app/models/compensation_event.py
backend/app/routers/compensation.py    — GET, POST, PUT, DELETE /compensation
```

**New frontend:**
```
/financial-profile → "Compensation" tab
  CompensationTimeline.tsx   — chronological list of all events
  CompensationForm.tsx       — quick-add / edit form (type changes which fields show)
```

**Integration with paystub parser:**
- When a paystub is parsed and gross pay is noticeably higher than the last stub → app flags: "Looks like a bonus or raise — want to log it in Compensation History?"
- Not automatic, just a prompt

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
backend/app/models/compensation_event.py
backend/app/routers/paystubs.py
backend/app/routers/investment_statements.py
backend/app/routers/compensation.py
backend/app/services/paystub_parser.py     ← pdfplumber extraction
backend/uploads/paystubs/                  ← PDF storage (gitignored)

frontend/src/app/paystubs/page.tsx
frontend/src/app/paystubs/review/page.tsx
frontend/src/components/paystubs/
  PaystubUploadZone.tsx
  PaystubReviewForm.tsx
  PaystubTimeline.tsx
  PaystubSummaryStats.tsx
  InvestmentStatementForm.tsx
frontend/src/components/profile/
  CompensationTimeline.tsx
  CompensationForm.tsx
```

### Phase 4 — New Dependencies
```
pdfplumber>=0.10.0             # paystub + statement PDF parsing (primary, free)
pytesseract>=0.3.10            # fallback OCR for scanned PDFs (free, needs Tesseract binary)
pdf2image>=1.16.0              # PDF→image conversion for tesseract fallback
Pillow>=10.0.0                 # image handling (likely already present)
# Tesseract binary (Windows): winget install UB-Mannheim.TesseractOCR
# NOTE: No ANTHROPIC_API_KEY needed — Claude API NOT used for paystubs
```

### Phase 4 — .gitignore Additions
```
backend/uploads/               # paystub images (personal data)
```

### Phase 4 — Resume Checklist
- [ ] Phase 3 (Google Sheets + Financial Profile) complete first
- [ ] Install pdfplumber: `pip install pdfplumber` in backend venv
- [ ] Build Feature C (joint HYSA) first — smallest DB change, highest daily impact
  - Katherine's HYSA contribution: **$1,600/month** (same as Keaton — changeable in Financial Profile)
- [ ] Build Feature D (compensation history) — no new dependencies, pure CRUD
- [ ] Build Feature A (paystub parser) — no API key needed, just pdfplumber
  - Test with `C:\Users\keato\Downloads\March6PayStub.pdf` (Paylocity format confirmed working)
- [ ] Build Feature B (historical statement entry) — manual form, no dependencies
- [ ] Test: upload March6PayStub.pdf, verify all fields parse correctly
- [ ] (Optional) Install Tesseract for scanned fallback: `winget install UB-Mannheim.TesseractOCR`

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
