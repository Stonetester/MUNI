# MUNI — Claude Project Context

_Last updated: 2026-07-04. Active branch: `main`._

**Deep references (read the relevant one before touching its area):**
`docs/CALCULATIONS.md` (every formula + truth hierarchy + abstention rule),
`docs/DATA-IMPORT.md` (ingestion paths, dedup/enrichment semantics, re-upload playbook),
`docs/AI-SYSTEM.md` (chat grounding, escalation, report types, num_ctx gotcha).

MUNI is Keaton and Katherine's household finance app. Operating principle everywhere:
**prefer real measured data (paystubs, statements, transactions) over static profile
fields, label the source of every derived number, and fail loud rather than silently
falling back to 0/None.** The most common historical bug class is a plausible-looking
number quietly computed from a stale/static/NULL source — treat any silent fallback as
a defect.

## Stack

- **Backend**: Python FastAPI + SQLAlchemy + SQLite + Alembic (migrations 001–012) + Uvicorn :8000
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind (dark theme) + Recharts :3000
- **Auth**: no-password JWT profile picker (`/auth/switch/{username}`, users `keaton`/`katherine`).
  Tailscale/LAN is the deliberate security boundary — do NOT "fix" this without asking.
- **Repos**: GitHub `Stonetester/MUNI` (origin) + Gitea mirror `10.0.0.96:3000/Keaton/MUNI.git` (SSH remote on CT 102)

## Production (CT 102 @ 10.0.0.48, also `muni.tail887f36.ts.net`)

- **Deploy**: `ssh -i ~/.ssh/roman_key root@10.0.0.11 "pct exec 102 -- /usr/local/bin/muni-deploy"`
  — via Roman `pct exec`, NOT direct SSH to 10.0.0.48. `muni-deploy` pulls main, runs
  `alembic upgrade head`, rebuilds frontend, restarts `muni-backend`/`muni-frontend`/nginx.
- **Never deploy blind**: check `git log`/`git status` on CT 102 first (may hold uncommitted live code).
- Nginx serves `/` and proxies `/api/` → :8000. API base: `http://10.0.0.48/api/v1`.
- `ANTHROPIC_API_KEY` lives in `/opt/muni/app/backend/.env` (AI report + finance-tutor chat — both working; the old "AI report broken 2026-03-29" note is obsolete).

## What the app computes (and from what)

| Number | Source of truth (in order) | Where |
|---|---|---|
| Savings goal progress | net cash = income − spending, current month, measured from transactions | `services/savings_goal.py` |
| HYSA contribution | measured EverBank "Savings Transfer" deposits (3-mo recent pace forward; current-month actual for the goal card) > manual profile value (labeled fallback) | `services/hysa_contributions.py` |
| 401k contribution | recent paystubs (employee + employer median × pay frequency) > measured statement contributions > holdings/profile. Employer match not printed on stub (Katherine): measured statement `employer_contributions` > `employer_401k_percent` × paystub salary > × profile salary | `services/forecasting.py` step 1b, `savings_goal._k401_monthly` |
| Investment returns | exact XIRR over statement-backed snapshot window; abstains (<2 snapshots, <120 days, or contributions unknown and result implausible) instead of fabricating | `services/returns.py` |
| Forecast rates | measured XIRR blended toward market anchor by data depth > holdings' assumed return > per-type defaults | `forecasting._blend_forecast_rate` |
| Coast FI | client-side solver (worst-case/later age for joint — settled decision); settings persisted on profile (migration 011) | `frontend/src/lib/coastFiSolver.ts`, `CoastFiCalculator.tsx` |
| Pay schedule | pay-date gaps + day-of-month clustering over last 12 stubs (NOT period length — can't distinguish semi-monthly from biweekly) | `forecasting._infer_pay_schedule` |

Every `AccountForecast` row carries `contribution_source` / `contribution_label` /
`contribution_basis` ("paystub", "measured", "statement_recent", "manual_fallback",
"holding", "paycheck", "profile", "none") — keep new derived numbers labeled the same way.

## Data ingestion flows

- **Paystubs** (`/paystubs`): Paylocity (Keaton) + G&P (Katherine) PDFs via pdfplumber regex
  (`services/paystub_parser.py` — fallback patterns per employer; employer-line guard so the
  bare "401k" pattern can't capture "Employer 401k"). Saving creates Salary/Bonus + Employer-401k
  income transactions tagged `import_source="paystub:{id}"`; update/delete recreates/removes them.
  Bonus detection needs period+YTD pair; `pay_type="bonus"` only when bonus>0 and regular==0.
- **Statements** (`/statements` + investments page): EverBank / John Hancock / Schwab / Fidelity
  PDFs (`services/statement_parser.py`) → balance snapshot (+holdings upsert via `/statements/apply`).
  **`period_contributions` and `employer_contributions` MUST be persisted with the snapshot** —
  a NULL-contribution snapshot falls out of the XIRR window (fixed 2026-07-03; re-uploading a
  statement backfills NULL contributions on the existing snapshot).
- **Google Sheets** (Settings): APScheduler 30-min sync, SHA-256 dedup, upsert, income-row
  detection, HYSA keyword auto-categorize ("hysa"/"everbank"/"high yield" → Savings Transfer).
  Katherine's sheet has its own column format.
- **CSV/XLSX import** (`Transactions → Import`, `backend/import/` utility for bulk backfill).
- **SimpleFIN card feed** (Settings → Connected Cards): read-only bank/card feed powering the
  end-of-day Slack spend digest (`services/simplefin.py`, `services/spend_digest.py`,
  `routers/connected.py`, migration 013). **Feed data is NEVER written into `transactions`** —
  it exists so Keaton & Katherine see the day's purchases and hand-enter them into their sheets.
  Digest posts to `SLACK_SPEND_CHANNEL` (#coin) at 20:45 America/New_York via `SLACK_BOT_TOKEN`
  (same token as the athena-agents scripts; native `*bold*` mrkdwn, direct chat.postMessage).

## Key files

- Backend routers (23): `backend/app/routers/` — biggest: `paystubs.py` (508 — has business
  logic that belongs in a service; known cleanup), `financial_profile.py` (profile + loans +
  holdings + compensation + infer-salary), `joint.py`, `dashboard.py`.
- Backend services (16): `backend/app/services/` — `forecasting.py` (~1,750 lines, highest-risk
  file; solo `run_forecast` ~line 1400 and joint `run_joint_forecast` ~line 1700 still have
  parallel AccountForecast builders — dedup is a known multi-session refactor, don't do it casually;
  some divergence is intentional joint-only logic), `ai_report.py` (1,005 — powers AI report AND
  the finance-tutor chat; `chat_session.py` model backs the chat history, it is NOT dead code),
  `returns.py`, `savings_goal.py`, `hysa_contributions.py`, `statement_parser.py`, `paystub_parser.py`.
- Frontend: `frontend/src/lib/api.ts` (all fetch wrappers), `lib/types.ts` (all interfaces —
  spot-check against backend Pydantic schemas when touching either), `app/` pages incl.
  `home-buying` (1,145), `financial-profile`, `paystubs`, `insights`, `budget`, `ai-report`,
  `statements`, `investments`, `forecast` (Foresight tabs incl. Coast FI), `flow` (Sankey), `calendar`.
- Tests: `backend/tests/` — finance-math suites + `test_full_app_audit_fixes.py`. Run with
  `venv\Scripts\python.exe -m unittest discover -s tests` (no pytest in venv).
  **Known baseline: `test_savings_goal.py` has date-dependent failures (2–4 depending on day)
  that Keaton deprioritized as cosmetic — everything else must pass.**
  NO frontend tests and NO backend tests for auth/parsers/sheets-sync/import — known gap;
  parser tests are the highest-value addition.

## Schema notes (do not revert)

| Feature | Backend | Frontend | Notes |
|---|---|---|---|
| Forecast fields | `expenses`, `cash` | same | were "spending"/"net_cash" — never revert |
| Pagination | `skip`/`limit` | sends `offset`/`limit` | |
| Profile salary | `gross_annual_salary` | same (+legacy `salary?` alias) | never write `salary` |
| Snapshot contributions | `contributions`, `employer_contributions` | `period_contributions`, `employer_contributions` on ParsedStatement | migration 012; keep them flowing on every save path |
| Import source | `import_source` | `import_source?` | "paystub:42", "sheets:JAN2025", "csv" |
| Joint accounts | `is_joint`, `joint_user_id` | `is_joint?` | joint HYSA deposits summed ONCE across users |
| Coast FI settings | `coast_fi_*` on financial_profiles | same | migration 011 |
| Account types | `401k` (backend string) | UI labels use `retirement_401k` hint from parser | forecasting/returns match on `"401k"` |

## Settled decisions (flag, don't silently change)

- Joint Coast FI funds two people using the **worst-case (later) age** (2026-06-26).
- Savings transfers are never displayed as expenses in Foresight (they still move cash).
- HYSA forward figure = 3-month recent pace (`RECENT_FORWARD_MONTHS`), not 6-month mean.
- Paid-off liabilities ($0 balance) are not projected from trailing payment history.
- XIRR lumps period contributions on the statement date (tested alternative moved rates
  AWAY from broker-printed figures; the real gap is the measurement window → `trailing_12mo_pct`).
- No-password auth + Tailscale boundary is intentional.
- Suggested savings goal (settled 2026-07-04): MAIN = median of trailing completed
  months (typical month); the positive-months-mean × 1.10 lives on ONLY as the labeled
  `suggested_goal_stretch` alternate. Don't swap them back.
- Bulk re-upload of statements/paystubs is idempotent and enriching (2026-07-04) —
  never reintroduce a 409-reject on re-import; see `docs/DATA-IMPORT.md`.
- Google Sheets stay the transaction source of truth (2026-07-04): the SimpleFIN feed is
  digest/display only. Never build an auto-importer from it — hand-entry is intentional.
- AI chat + reports always state the active profile and Solo/Joint mode in their prompts
  (2026-07-04) — keep the ACTIVE PROFILE / Report scope lines when editing prompts.

## User financial context (verify against paystubs/statements before trusting)

- Keaton: Paylocity, semi-monthly (24/yr); 401k JH (employer Safe Harbor printed on stub);
  IRA Schwab; joint EverBank HYSA (both partners deposit; summed once).
- Katherine: G&P, employer match NOT on stub (measured from Fidelity statement
  `employer_contributions` when available, else `employer_401k_percent` profile field);
  Fidelity 401k; freelance side income via her sheet.
- Wedding: October 2026 (life event with line-item budget).
- Money flow: paychecks → BofA, spending via CCs paid in full (not tracked as accounts),
  sheets record purchases only — no CC-payment/internal-transfer double-counting.

## Local dev

```bash
cd backend && venv\Scripts\activate && uvicorn app.main:app --reload --port 8000
cd frontend && npm run dev   # http://localhost:3000
# fresh DB: alembic upgrade head && python seed/seed_data.py
```

## Common issues (still-relevant subset)

- `bcrypt` pinned to 4.0.1 (passlib compat). `ModuleNotFoundError: email_validator` → `pip install -r requirements.txt`.
- `EACCES` on `.next/` after root builds → `chown -R muni:muni /opt/muni/app`.
- Alembic `down_revision` uses short ids ("011", not filenames).
- Statement parser returns None → pdfplumber text extraction issue; only the 4 known institutions are handled.
- Login fails on fresh prod DB → re-seed (`alembic upgrade head && python seed/seed_data.py`).
