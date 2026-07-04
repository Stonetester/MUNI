# MUNI AI System Reference

_How the finance-tutor chat and the AI reports work: grounding, models, escalation,
report types, and the failure modes that were fixed. Last verified against the code
2026-07-04 (prod `13a1e1b`). Implementation: `services/ai_report.py`,
`routers/ai_report.py`._

**Design rule:** the AI never computes portfolio math itself — it receives the app's
own pre-computed figures (net worth, XIRR, forecasts, Coast FI, goals) in its grounding
prompt and is instructed to cite them. If a figure isn't in the data, it says so.

---

## 1. The chat (finance tutor)

### 1.1 Grounding — what the model sees every message

The system prompt is rebuilt fresh per message from the live database
(`_build_chat_system_prompt`). It ALWAYS contains, regardless of the Solo/Joint toggle:

| Section | Contents |
|---|---|
| Scope | both partners named; instruction to answer solo, partner, and joint questions directly; **"NEVER say you cannot see partner, joint, or household data"** |
| Net worth | household + each person alone (assets/liabilities) |
| Coast FI / FIRE | household canonical figures (invested, FIRE number, Coast FI number, % there, retirement-salary view) with the instruction to use them, not recompute |
| Accounts | every account, owner-labeled |
| Investments | holdings per account (funds/values/weights) + **measured XIRR per account** with period and basis; unmeasurable accounts listed with WHY (so the model explains instead of guessing) |
| This month | household income/spending/savings rate + per person + per-category with per-owner split |
| Savings goals | each person's net-cash vs goal + contribution breakdown + household roll-up (same numbers as the dashboard card) |
| **PREDICTIONS** | the app's 60-month Foresight projection: projected average month, net-worth trajectory (now → +12mo → +60mo), and per-account projections with the **source of every input** (contribution basis, growth rate) |
| Monthly history | last 18 months, household: income/spending/savings rate/top categories |
| Annual summary | **every year in the recorded history** (capped 10): income + spending fully broken down by category — the authoritative source for "how much X in YEAR?" |
| All-time | spending + income by category with date range |
| Events | upcoming life events, owner-labeled |
| Provenance guide | how each number class is derived (measured/statement/paystub/projection), so "where does that come from?" gets a real answer |

Measured size on real data: ~16.5K chars ≈ ~4.5K tokens.

### 1.2 The `joint` flag

Kept for UI emphasis only ("current view focus"). It no longer gates data. **History:**
until 2026-07-04 the solo prompt *instructed the model to refuse* partner/household
questions — the model was obeying its prompt, which read to the user as "the AI can't
see my data".

### 1.3 Models & routing

| Provider | Model | Notes |
|---|---|---|
| `ollama` (default) | `OLLAMA_CHAT_MODEL` (qwen3:14b) on Mongol (`OLLAMA_HOST`, 10.0.0.172:11434) | free, local |
| `claude` | `ANTHROPIC_MODEL` (claude-sonnet-5), automatic retry on `ANTHROPIC_FALLBACK_MODEL` (claude-sonnet-4-6) if the account lacks access | paid |
| `openai` | gpt-4o | paid, optional |

**Escalation ladder (local default):**
1. *Hard question heuristic* → straight to Claude, tagged `qwen3:14b→claude`. Triggers:
   advisory/conceptual keywords (should I, strategy, compare, refinance, coast fi, …),
   >240 chars, ≥2 question marks, or "X vs Y?" comparisons. Plain data lookups stay local.
2. Local answered but *punted* ("I'm not sure", "consult a financial…") → escalate.
3. Local unreachable (Mongol asleep) → Claude fallback, labeled.
4. Manual `escalate=true` from the UI → Claude.

Rationale (benchmarked 2026-06-18): local 14b is trustworthy on factual money questions
grounded in the prompt, but fabricates on advisory ones — hence the keyword escalation.

### 1.4 The Ollama call — two critical parameters

```
options.num_ctx = OLLAMA_NUM_CTX (24576)
think = false      (retried without it for models that reject the flag)
```

- **`num_ctx`**: Ollama's default context is small and on overflow it silently drops the
  OLDEST tokens — which is the system prompt, i.e. *all the financial data*. This was
  the root cause of the local chat being "usually wrong" / claiming it couldn't see
  data. Keep `OLLAMA_NUM_CTX` comfortably above prompt + history + reply.
- **`think:false`**: qwen3/deepseek-r1 otherwise leak reasoning tokens into the reply.

### 1.5 Sessions

Every turn persists to `chat_sessions`/`chat_messages` (auto-created, auto-titled from
the first message; rename/delete in the history panel). `model_used` records who
actually answered (e.g. `qwen3:14b→claude`). The `chat_session` model is NOT dead
code — it backs this history.

---

## 2. AI reports

### 2.1 Report types (selectable on the page; `GET /ai-report?report_type=…`)

| Type | Focus | Extra data pack |
|---|---|---|
| `monthly` — Monthly Review | the classic month-in-review, both people + household | 18-mo history, goals, forecast |
| `spending` — Spending Deep-Dive | where money goes, trends/momentum, outliers, YoY | 18-mo history + full yearly category summaries |
| `investments` — Investments & Returns | portfolio, measured XIRR per account (+ why unmeasurable), contribution engine, growth outlook | returns, holdings, forecast, Coast FI |
| `goals` — Goals & Retirement | goal scoreboard, contribution machine, Coast FI with the math shown, levers | goals, forecast, returns, Coast FI |
| `year` — Year in Review | the year's story month by month, categories vs prior years, targets | 18-mo history + full yearly summaries + forecast |

All types share a core context (this month + net worth + accounts + budget overruns +
events, per person and household). Reports are household-scoped by default; the page's
Solo/Joint toggle controls scope. Target 700–1100 words; markdown; instructed to
distinguish measured numbers from projections.

### 2.2 Generation

`generate_monthly_report(user, db, year, month, provider, report_type, joint)` →
provider branches mirror the chat's (Claude preferred w/ fallback, gpt-4o, or local
`OLLAMA_REPORT_MODEL` with the same num_ctx/think handling). Reports are generated
on-demand only (button), never automatically. Before the 5th of the month the default
period is the previous month.

---

## 3. Configuration (backend `.env` / `app/config.py`)

| Setting | Default | Purpose |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | required for Claude reports/chat/escalation |
| `ANTHROPIC_MODEL` | `claude-sonnet-5` | preferred Claude model |
| `ANTHROPIC_FALLBACK_MODEL` | `claude-sonnet-4-6` | retried automatically on NotFound |
| `OPENAI_API_KEY` | — | optional gpt-4o path |
| `OLLAMA_HOST` | `http://10.0.0.172:11434` | Mongol |
| `OLLAMA_CHAT_MODEL` | `qwen3:14b` | local tutor |
| `OLLAMA_REPORT_MODEL` | `qwen3:8b` | local reports |
| `OLLAMA_NUM_CTX` | `24576` | see §1.4 — do not shrink casually |

---

## 4. Known limits & failure modes

- **Mongol asleep** → local calls fail fast with a wake-it-up message; chat falls back
  to Claude when a key is set.
- **Advisory quality on local models**: by design routed to Claude (§1.3); if answers
  regress, check the escalation keywords before blaming the grounding.
- **Prompt growth**: each new grounding section costs local-context headroom. If
  sections are added, re-measure prompt size vs `OLLAMA_NUM_CTX` (a truncated system
  prompt fails *silently* — the model just gets dumber).
- **Coast FI recompute drift**: the model is explicitly told to use the canonical
  figures; if chat Coast FI numbers ever diverge from the tab, check that instruction
  survived prompt edits.
- The report/chat run 1–3 live forecasts per call (SQLite, sub-second); if latency ever
  matters, cache the forecast context per request.
