# FinanceTrack — Claude Project Context

## Stack
- **Backend**: Python FastAPI + SQLAlchemy + SQLite (default) / PostgreSQL + Alembic + Uvicorn port 8000
- **Frontend**: Next.js 14 (App Router) + TypeScript + Tailwind CSS (dark theme) + Recharts port 3000
- **Auth**: JWT 30-day tokens, two seeded users: `keaton` / `katherine`
- **Repo**: https://github.com/Stonetester/MUNI.git

## Git State (as of 2026-03-17)
- **Branches**: `main` (default), `dev` (newly created from main, not yet pushed due to node_modules in git)
- **Problem**: `frontend/node_modules/@next/swc-win32-x64-msvc/next-swc.win32-x64-msvc.node` (129MB) is tracked in git — push to GitHub fails. Must be removed from git history or at minimum from tracking before `dev` can be pushed.
- **Remote**: `origin/main` exists and is up to date. `origin/codex/complete-remaining-tasks-and-create-new-branch` should be deleted after work is done.

## Pending Tasks (all to be done on `dev` branch)

### 1. Fix git / remove personal/binary files from tracking
- `backend/finance.db`, `backend/finance.db-shm`, `backend/finance.db-wal` — binary DB, personal data
- `seed_transactions.json` — 1,797 personal transactions, personal financial data
- `backend_log.txt` — log file
- `frontend/node_modules/` — 129MB binary, breaks GitHub push
- Add all of the above to `.gitignore` and run `git rm --cached` to untrack them
- Then force-push or create a fresh commit that removes them

### 2. Add Dockerfiles (from codex branch — not yet on main/dev)
These files exist in `origin/codex/complete-remaining-tasks-and-create-new-branch` but NOT in main/dev:
- `backend/Dockerfile`
- `frontend/Dockerfile`
- `backend/.dockerignore`
- `frontend/.dockerignore`

**Backend Dockerfile content** (from codex branch):
```dockerfile
FROM python:3.11-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends build-essential && rm -rf /var/lib/apt/lists/*
COPY requirements.txt /app/requirements.txt
RUN pip install --no-cache-dir -r /app/requirements.txt
COPY . /app
EXPOSE 8000
```

**Frontend Dockerfile content** (from codex branch — multi-stage):
```dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["npm", "run", "start", "--", "--hostname", "0.0.0.0", "--port", "3000"]
```

**backend/.dockerignore**:
```
venv
__pycache__
*.pyc
finance.db
finance.db-shm
finance.db-wal
```

**frontend/.dockerignore** (needs to be created):
```
node_modules
.next
.env.local
```

### 3. Fix bug: `api.ts` createSnapshot wrong endpoint
- File: `frontend/src/lib/api.ts`
- `createSnapshot()` calls `/snapshots` — WRONG
- Should call `/balance-snapshots` (backend router is at `/balance-snapshots`)
- Fix: change `await api.post('/snapshots', data)` to `await api.post('/balance-snapshots', data)`

### 4. Clean README.md — remove personal financial data
- Remove "Key Account Numbers (as of Mar 2026)" section (shows real dollar balances)
- Remove specific transaction counts and wedding amounts from "What's Pre-Loaded"
- Keep generic setup instructions, generic user table (keaton/katherine as example usernames is OK)

### 5. Clean USER_GUIDE.md — remove personal names
- Replace "Keaton" and "Katherine" references with generic "User 1" / "User 2" or just "users"

### 6. Clean settings page About card — remove hardcoded credentials
- File: `frontend/src/app/settings/page.tsx`
- About card currently shows: `Login: keaton / finance123 · katherine / finance123`
- Remove that line entirely (security issue to show default creds in UI)

### 7. Add Tailscale section to PROXMOX_SETUP.md
- Add after section 10 (DNS + TLS) a new section "11) Tailscale Setup for Remote Access"
- Tailscale on Ubuntu LXC: `curl -fsSL https://tailscale.com/install.sh | sh && tailscale up`
- Access via Tailscale IP instead of public domain
- No need to open ports 80/443 publicly when using Tailscale only

### 8. Fix docker-compose.yml CORS
- Backend CORS_ORIGINS should support both localhost and production domain
- Change to: `CORS_ORIGINS: '["http://localhost:3000","http://localhost:3001","https://finance.yourdomain.com"]'`

### 9. Push dev branch to GitHub
- After all fixes, push `dev` to remote: `git push origin dev`
- Then delete remote codex branch: `git push origin --delete "codex/complete-remaining-tasks-and-create-new-branch"`

## Known Working Features
- ✅ Login (`/login`)
- ✅ Dashboard: net worth, monthly flow, accounts grid, spending chart, forecast preview, recent transactions
- ✅ Transactions: paginated list, import CSV/XLSX, add/edit/delete, filters
- ✅ Accounts: CRUD, balance history chart (via `/balance-snapshots?account_id=`)
- ✅ Budget: categories with budget_amount, recurring rules, spending vs budget
- ✅ Forecast: 60-month net worth + cash flow charts, category table, scenario selector
- ✅ Life Events: CRUD, wedding/honeymoon pre-loaded
- ✅ What-If Scenarios: clone baseline, compare two scenarios
- ✅ Alerts: over-budget categories + upcoming event payments
- ✅ Settings: change password (POST /auth/change-password)

## API Base URL
`http://localhost:8000/api/v1`

## Key File Locations
- Backend entry: `backend/app/main.py`
- All API routes: `backend/app/routers/`
- Forecasting engine: `backend/app/services/forecasting.py`
- Frontend API calls: `frontend/src/lib/api.ts`
- Types: `frontend/src/lib/types.ts`
- Layout + nav: `frontend/src/components/layout/`
- All pages: `frontend/src/app/`

## Schema Notes (do not revert)
| Feature | Backend field | Frontend field |
|---------|--------------|----------------|
| Forecast month | `month` | `month` |
| Forecast spending | `expenses` | `expenses` |
| Pagination | `skip`/`limit` | `offset`/`limit` |
| Balance snapshots | `/balance-snapshots?account_id=` | `getAccountSnapshots()` |

## Run Locally (no Docker)
```bash
# Terminal 1 — Backend
cd backend && python -m venv venv && venv/Scripts/activate
pip install -r requirements.txt && alembic upgrade head
python seed/seed_data.py
uvicorn app.main:app --reload --port 8000

# Terminal 2 — Frontend
cd frontend && npm install && npm run dev
```
Open http://localhost:3000
