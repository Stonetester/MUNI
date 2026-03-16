@echo off
echo ============================================
echo  FinanceTrack - Starting Local Dev Server
echo ============================================
echo.

REM Check Python
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python not found. Install from python.org
    pause
    exit /b 1
)

REM Check Node
node --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Node.js not found. Install from nodejs.org
    pause
    exit /b 1
)

REM Setup backend
echo [1/4] Setting up backend...
cd backend
if not exist venv (
    python -m venv venv
)
call venv\Scripts\activate
pip install -r requirements.txt -q
if not exist finance.db (
    echo [2/4] Running database migrations...
    alembic upgrade head
    echo [3/4] Seeding with your financial data...
    python seed/seed_data.py
) else (
    echo [2/4] Database already exists, skipping migration
    echo [3/4] Database already seeded, skipping seed
)

echo [4/4] Starting backend server (port 8000)...
start "FinanceTrack Backend" cmd /k "venv\Scripts\activate && uvicorn app.main:app --reload --port 8000"
cd ..

REM Setup frontend
echo.
echo [5/5] Setting up and starting frontend (port 3000)...
cd frontend
if not exist node_modules (
    echo Installing frontend packages (first run only, may take 1-2 min)...
    npm install
)
start "FinanceTrack Frontend" cmd /k "npm run dev"
cd ..

echo.
echo ============================================
echo  App starting! Open in browser:
echo  http://localhost:3000
echo.
echo  Login: keaton  / finance123
echo         katherine / finance123
echo ============================================
echo.
pause
