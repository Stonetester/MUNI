# MUNI Calculations Reference

_The canonical "where does this number come from" document. Every derived or predicted
number in the app is listed here with its formula, its inputs in priority order, when it
abstains, and where the UI exposes the math. Last verified against the code 2026-07-04
(prod `13a1e1b`)._

**The operating principle everywhere:** prefer real measured data (paystubs, statements,
transactions) over static profile fields; label every derived number with its source;
abstain honestly rather than fabricate; fail loud rather than silently fall back to 0.
The app's historical bug class is the *silent plausible number* — a figure that looks
right but was quietly computed from a stale, NULL, or wrong source. Everything below is
designed against that.

---

## 1. Transaction classification (`services/transaction_math.py`)

The foundation everything else sums over.

| Function | Rule |
|---|---|
| `counts_as_income` | positive amount, income-kind category, **excluding** Employer-401k transactions (retirement asset, not spendable cash) |
| `counts_as_expense` | negative amount, excluding savings-kind categories and employer-401k |
| Savings-kind categories (e.g. "Savings Transfer") | excluded from BOTH income and spending — moving money into savings is neither earning nor spending |
| One-off marker | `[one-off]` in notes — keeps real cash impact in its month, excluded from recurring averages/targets |

Sign convention: **expenses are negative amounts**; income positive. Every importer
follows this.

---

## 2. Savings goal (`services/savings_goal.py`, dashboard card)

**The goal is measured against NET CASH only:**

```
net_saved = income − spending        (current month, savings categories excluded)
```

Retirement/savings contributions (401k, IRA, HYSA) are tracked **separately** as an
informational section — never part of the goal.

### Suggested goal (two values, both surfaced)

| Value | Formula | Meaning |
|---|---|---|
| `suggested_goal` (MAIN) | **median** of net cash saved over the last 6 *completed* months, floored at $0, rounded to $25 | "a typical month" — overspent months stay in the basis; one great month can't inflate it |
| `suggested_goal_stretch` | mean of only the **positive** months × 1.10, rounded to $25 | "a good month" — deliberately optimistic; ignores overspent months entirely |

Both carry `*_basis` strings with the substituted numbers; shown in the goal detail
modal. When the user sets `monthly_savings_goal` on their profile, that wins over the
suggestion. The joint goal/suggestion is the **sum** of each person's values; joint
progress is the sum of net cash.

### HYSA contribution shown on the card

Current-month **actual** EverBank deposits (may be $0 until a deposit lands) — not the
trailing average. The EverBank HYSA is a shared joint account: both partners' deposits
are summed **once** and split evenly per person, so the joint total equals the measured
combined value with no double-counting. Source label: `measured` | `manual_fallback`
(profile value, only when zero EverBank transactions exist at all) | `none`.

### 401k contribution (per person) — truth hierarchy

```
EMPLOYEE side: recent paystubs (median deduction_401k × pay frequency)
               > profile employee_401k_per_paycheck × frequency
EMPLOYER side: recent paystubs (median employer_401k × frequency)   ← printed on Keaton's stubs
               > measured statement employer_contributions monthly pace  ← Katherine (Fidelity itemizes it)
               > employer_401k_percent × paystub-derived monthly salary
               > employer_401k_percent × profile gross_annual_salary/12  ← stalest source
```

The savings-goal card and the Foresight forecast use the **same hierarchy** (parity was
a 2026-07-03 fix — Foresight used to omit Katherine's employer match entirely).

---

## 3. HYSA measurement (`services/hysa_contributions.py`)

Deposits are identified as transactions in savings-kind categories whose description
matches an HYSA keyword (`hysa`, `everbank`, `ever bank`, `high yield`), summed
`abs(amount)` per calendar month across **all** contributing users (once — no
double-count).

| Figure | Window | Used by |
|---|---|---|
| `current_month` | deposits recorded so far this month (may be $0) | savings-goal card; forecast month 0 |
| `recent_avg_monthly` | mean of last **3** completed months (months with no deposit count as $0) | forecast forward months (`RECENT_FORWARD_MONTHS = 3` — one anomalous month in a 6-month window was dragging the mean) |
| `avg_monthly` | mean of last 6 completed months | fallback when the recent window has no deposits |

Manual profile `hysa_monthly_contribution` is a **labeled fallback** used only when
there are zero EverBank transactions to measure.

Double-entry note: the same deposit reduces cash (transfer out of checking) and grows
the HYSA — that is correct double-entry, not double-counting.

---

## 4. Investment returns — XIRR (`services/returns.py`)

**Method:** exact money-weighted return (XIRR) — the same figure brokers print. Solve
the annual rate `r` where the NPV of every dated cash flow is zero (Newton-Raphson,
bisection fallback; Actual/365).

**Cash-flow construction per account** (snapshots ordered by date):
- `t0`: outflow −first.balance (capital already in)
- each later snapshot **with recorded contributions**: outflow −contributions, dated at
  the statement date (lumping tested against spreading across paycheck dates — lumping
  matches broker-printed figures better; the real gap vs a statement's printed number is
  the measurement *window*, hence `trailing_12mo_pct` below)
- final: inflow +last.balance

**The statement-backed window:** the measurement runs from the first snapshot through
the **last snapshot whose `contributions` is recorded**. Trailing NULL-contribution rows
are excluded (labeled "balance synced, not in return window") rather than guessed at.
*This is why persisting contributions on every statement import matters — see
DATA-IMPORT.md.*

**Abstention rules (never fabricate a rate):**
- fewer than 2 snapshots → "not enough statements yet"
- window < 120 days → "too new to annualize" (annualizing a quarter of noise reads as ±30%/yr)
- no contribution data anywhere → estimate path (holdings' `monthly_contribution`), and
  if the result is implausible (>50%/yr) the growth is almost certainly untracked
  deposits → abstain with an explanation
- `low_confidence` flag whenever contributions were estimated rather than recorded

**`trailing_12mo_pct`:** broker-style last-~12-months XIRR (earliest snapshot ≥365 days
before the last; needs ≥300 days of span), shown beside since-inception so the
window difference is visible instead of confusing.

---

## 5. Foresight forecast engine (`services/forecasting.py`)

### 5.1 Projected income & spending (the "spending model")

Per category, from real transactions (one-offs and neutral transfers excluded):

```
projected monthly amount = (trailing 3-mo avg × 0.50)
                         + (trailing 6-mo avg × 0.30)
                         + (trailing 12-mo avg × 0.20)
```

Months without a transaction still count in the denominators. Positive results project
as income, negative as expenses. Special handling:
- **savings-kind categories**: roll cash forward (money leaves checking) but are NOT
  displayed as spending (they're saved, not consumed — and they're already counted as
  account contributions)
- **paid-off liabilities** ($0-balance loan accounts): their payment category stops
  being projected — matched via `_paid_off_liability_category_ids`
- **recurring rules** supplement only categories with no history (no double-count)

The full model — every category's avg3/avg6/avg12, blend result, and
classification — is returned as `ForecastResponse.spending_model` and shown in the
Foresight drill-downs.

### 5.2 Account projection

Each month, for compound accounts (savings/hysa/ira/401k/hsa/brokerage):

```
balance = balance × (1 + annual_rate/12) + monthly_contribution
```

Cash-pool accounts (checking/paycheck) absorb monthly `net + savings outflows + event
impacts` and keep their starting share of the pool. Other assets/liabilities are held
constant (stated in `projection_formula` — the forecast doesn't model loan paydown).

**Growth rate — truth hierarchy (recorded per account in `rate_source`/`rate_basis`):**

| Priority | Source | `rate_source` |
|---|---|---|
| 1 | measured XIRR, **blended toward the 10% market anchor** by statement depth: `w = min(0.5, n_statements × 0.05)`; `rate = w × XIRR + (1−w) × 10%` — thin history leans on the anchor, deep history leans on the account's own realized return, never fully (a hot streak isn't extrapolated forever) | `measured_xirr` |
| 2 | value-weighted average of holdings' `assumed_annual_return` | `holdings_assumed` |
| 3 | HYSA APY from the financial profile | `profile_apy` |
| 4 | per-type defaults (401k 8%, IRA 7%, brokerage 8%, …) | `type_default` |

**Monthly contribution — truth hierarchy (per account, in `contribution_source`):**

| Priority | Source | Label |
|---|---|---|
| 1 (401k) | recent paystubs: median (employee + employer) per check × inferred pay frequency; if the stubs don't print the employer match, the employer estimate from §2's hierarchy is added on top (and stated in the basis) | `paystub` |
| 2 | recent statement window: recorded `contributions` over ~the last 12 months ÷ months spanned. The window-START snapshot anchors the span but its own contributions are **excluded** (they belong to the period before the window — including them overstated the pace; fixed 2026-07-03) | `statement_recent` |
| 3 | HYSA: measured EverBank pace (§3) | `measured` |
| 4 | holdings' manual `monthly_contribution` / profile IRA value | `holding` / `profile` |

A **lifetime** statement average is carried separately for display comparison and is
never projected (recent pace wins — an old high-contribution era shouldn't inflate the
future).

**Starting balance:** latest statement snapshot when one exists (source string carries
the date), else the manually set account balance.

**Variance band:** `low/high cash = cash ∓ month's projected spending × variance_pct`,
where `variance_pct` is the coefficient of variation of real monthly spending over the
last 12 months, clamped to [5%, 30%].

### 5.3 Solo vs joint

`run_forecast` (per user) and `run_joint_forecast` (household) share the config
builders. Joint: unique accounts only (a joint account counts once, under its owner);
contributions summed across users; category averages merged by name; a joint HYSA's
deposits are measured from BOTH partners once. In the **solo** view a joint HYSA's
contribution is measured from only that user's deposits, matching their solo cash
outflow. (The two paths still have parallel loop bodies — a known, deliberate
not-yet-refactor; see CLAUDE.md.)

### 5.4 UI exposure

Foresight metric tiles → `CalculationDetailModal` (formula, date range, inputs,
assumptions, warnings, nested drill-downs down to individual source transactions with
their `import_source`). As of 2026-07-04: category details include the backend blend
inputs; return metrics drill into a per-account panel with rate origin, contribution
origin, balance source, and a worked first month.

---

## 6. Coast FI (client-side: `lib/coastFiSolver.ts`, `CoastFiCalculator.tsx`)

```
FIRE number     = (monthly spend × 12) × (1+inflation)^years_to_retirement / SWR
Coast FI number = FIRE number / (1+return)^years_to_retirement
```

Defaults: 10% nominal return, 3% inflation, 4% SWR, retire at 65 — persisted per user
(`coast_fi_*` profile columns, migration 011). **Joint Coast FI funds two people using
the worst-case (later) age** — a settled 2026-06-26 decision; don't change silently.
Retirement spend basis: profile override if set, else the smart estimate — recurring
average of completed months excluding wedding/student-loan categories, plus one-off
spending smoothed evenly across the window (a lump shouldn't inflate one month).
The AI chat/report receive these as **canonical pre-computed figures** and are
instructed not to recompute them.

---

## 7. Salary inference (`/financial-profile/infer-salary`)

Averages the last N regular (non-bonus) paystubs — NULL rows are skipped in both the
numerator **and denominator** (a NULL row used to crash or dilute the average).

**Pay frequency comes from pay-date gaps + day-of-month clustering across stubs**
(`forecasting._infer_pay_schedule`), NOT period length: semi-monthly periods run 13–16
days and are indistinguishable from bi-weekly (14 days) by length alone — that
misclassification overstated annual salary ~8.3% (×26 instead of ×24; fixed
2026-07-03). Semi-monthly is detected by pay dates clustering into two tight
day-of-month groups (e.g. 7th & 22nd). Single-stub fallback biases toward semi-monthly
in the ambiguous zone.

```
gross_annual = avg gross per paycheck × periods_per_year
periods_per_year: weekly 52 · biweekly 26 · semi_monthly 24 · monthly 12
```

---

## 8. Budget (`routers/budget.py`)

- **Summary (budget vs actual):** net spend per category = `max(0, −Σ signed amounts)`
  for the month — a refund-heavy month reads as $0 spent, not phantom spending
  (`abs()` used to flip the sign; fixed 2026-07-04).
- **Estimates (suggested budgets):** median of monthly spend across the months **that
  had spending** in the last 18, × 0.90 savings haircut. Fixed/unavoidable categories
  (rent, taxes, medical, …) get no suggestion. Each row carries a `basis` string.
  Note the deliberate choice: median-over-spend-months answers "what does a month with
  this spending look like", not "average across all months" — sparse categories read
  high by design. (The forecast §5.1 uses the all-months blend instead.)

---

## 9. Net worth

```
net worth = Σ asset balances (positive) − Σ |liability balances|
asset types:     checking, savings, hysa, brokerage, ira, 401k, hsa, other, paycheck
liability types: credit_card, student_loan, car_loan, mortgage
```

Balances come from the latest statement snapshot per account when available, else the
manual balance. Dashboard shows an HYSA-excluded variant for "spendable" framing.
Historical forecast points before today use recorded snapshots
(`calculation_method="recorded_snapshots"`); future points are projections.

---

## 10. Where a number CAN'T come from

Deliberate non-sources, to preserve trust:
- The AI chat/report **never compute** portfolio math themselves — they receive the
  app's pre-computed figures and are instructed to cite them (see AI-SYSTEM.md).
- Returns are never inferred from balance deltas alone when contributions are unknown
  and material (abstention rules, §4).
- Profile fields (`gross_annual_salary`, `employer_401k_percent`,
  `hysa_monthly_contribution`) are **last-resort fallbacks**, always labeled as such
  when used.
