# FinanceTrack

FinanceTrack is a self-hosted personal finance forecasting app.

It helps you manage:
- transactions and categories
- accounts and balances
- budgets
- recurring income/expenses
- life events
- forecast and what-if scenarios
- alerts for budget overruns/upcoming event costs

## Documentation

- **Proxmox + Tailscale + PostgreSQL production deployment:** `PROXMOX_SETUP.md`
- **Complete end-user feature guide:** `USER_GUIDE.md`

## Core Features

- Dashboard (net worth, monthly flow, account summaries)
- Transactions (CRUD, filters, import/export)
- Accounts (CRUD + balance snapshots)
- Budget summaries by category
- Forecast charts + category breakdowns
- Life events planning
- What-if scenarios (clone/compare)
- Alerts center
- Settings (password change)

## Local Development Quick Start

Requirements:
- Python 3.11+
- Node.js 18+

Backend:
```bash
cd backend
python -m venv venv
source venv/bin/activate        # macOS/Linux
# venv\Scripts\activate         # Windows
pip install -r requirements.txt
alembic upgrade head
python seed/seed_data.py
uvicorn app.main:app --reload --port 8000
```

Frontend:
```bash
cd frontend
npm install
npm run dev
```

Open:
- `http://localhost:3000`

## Validation

Run the API smoke test after deployment:

```bash
python scripts/api_smoke_test.py --base-url http://127.0.0.1:8000 --username <your-user> --password <your-password>
```

## Production Recommendation

For production, use:
- Proxmox Ubuntu VM
- Docker Compose
- PostgreSQL (not SQLite)
- Nginx reverse proxy
- Tailscale for private remote access

See `PROXMOX_SETUP.md` for exact, step-by-step commands.
