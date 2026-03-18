# Muni — Proxmox Deployment Guide (Ubuntu LXC)

Deploy Muni on your Proxmox server using an **Ubuntu 24.04 LXC container**.

---

## Your Server Specs

| Spec | Value |
|---|---|
| Machine | Dell OptiPlex Micro (5xxx gen) |
| CPU | Intel Core i5/i7 9th Gen, 35W T-series |
| RAM | 16 GB DDR4 |
| Storage | Internal SSD |
| Existing containers | CT 100 (modoGusto-server), CT 101 (cloudflared) |

---

## 1) Architecture

```
Proxmox host
├── CT 100  modoGusto-server   (food app)
├── CT 101  cloudflared        (food app tunnel)
└── CT 102  muni               ← new container for this app
             ├── FastAPI backend   → 127.0.0.1:8000
             ├── Next.js frontend  → 127.0.0.1:3000
             └── Nginx             → :80 (or Tailscale only)
```

SQLite database lives inside the container at `/opt/muni/app/backend/finance.db`.

---

## 2) Create the LXC in Proxmox

### Download the Ubuntu template (if not already present)

Proxmox UI → Node → local storage → CT Templates → Templates → search `ubuntu-24.04` → Download.

### Create the container

| Setting | Value |
|---|---|
| CT ID | `102` (next available after 101) |
| Hostname | `muni` (note: if your Proxmox **node** is also named `muni`, use `muniapp` instead to avoid confusion) |
| Template | `ubuntu-24.04-standard_*.tar.zst` |
| Unprivileged | ✅ Yes |
| Root password | Set a strong password |
| Disk | `16 GB` |
| CPU cores | `2` |
| RAM | `2048 MiB` |
| Swap | `512 MiB` |
| Network bridge | `vmbr0` |
| IPv4 | DHCP (Tailscale handles the stable IP) |
| Features | `nesting=1` |

Start the container after creating it.

---

## 3) Initial OS Setup

Enter the container shell from the Proxmox UI (Console tab) or via SSH, then run:

```bash
apt update && apt upgrade -y
apt install -y git curl build-essential nginx python3 python3-venv python3-pip

# Node.js 20
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs

# Verify
node -v && npm -v && python3 --version
```

---

## 4) Create App User and Directory

```bash
adduser --disabled-password --gecos "" muni
usermod -aG www-data muni
mkdir -p /opt/muni
chown -R muni:muni /opt/muni
```

---

## 5) Clone the Repo

```bash
sudo -u muni -H bash -lc '
cd /opt/muni
git clone https://github.com/Stonetester/MUNI.git app
'
```

All paths from here are relative to `/opt/muni/app`.

---

## 6) Backend Setup (FastAPI + SQLite)

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
alembic upgrade head
python seed/seed_data.py
'
```

### Backend `.env` file

Create `/opt/muni/app/backend/.env`:

```env
SECRET_KEY=REPLACE_WITH_LONG_RANDOM_SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=43200
DATABASE_URL=sqlite:///./finance.db
CORS_ORIGINS=["http://localhost:3000","http://100.x.y.z:3000"]
```

Replace `100.x.y.z` with your Tailscale IP after step 10.

Generate a secret key:

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

---

## 7) Frontend Setup (Next.js)

Create `/opt/muni/app/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=http://100.x.y.z
```

Replace `100.x.y.z` with your Tailscale IP after step 10. If using Nginx on port 80 you can omit the port.

Build the frontend:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm install
npm run build
'
```

The build will use ~700 MB RAM at peak — well within the 2 GB allocation.

---

## 8) systemd Services

### Backend — `/etc/systemd/system/muni-backend.service`

```ini
[Unit]
Description=Muni FastAPI Backend
After=network.target

[Service]
User=muni
Group=www-data
WorkingDirectory=/opt/muni/app/backend
EnvironmentFile=/opt/muni/app/backend/.env
ExecStart=/opt/muni/app/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Frontend — `/etc/systemd/system/muni-frontend.service`

```ini
[Unit]
Description=Muni Next.js Frontend
After=network.target

[Service]
User=muni
Group=www-data
WorkingDirectory=/opt/muni/app/frontend
Environment=NODE_ENV=production
EnvironmentFile=-/opt/muni/app/frontend/.env.local
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable and start both:

```bash
systemctl daemon-reload
systemctl enable --now muni-backend
systemctl enable --now muni-frontend
systemctl status muni-backend --no-pager
systemctl status muni-frontend --no-pager
```

---

## 9) Nginx Reverse Proxy

Create `/etc/nginx/sites-available/muni`:

```nginx
server {
    listen 80;
    server_name _;

    client_max_body_size 25M;

    # API
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /health {
        proxy_pass http://127.0.0.1:8000/health;
        proxy_set_header Host $host;
    }

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

Enable it:

```bash
ln -s /etc/nginx/sites-available/muni /etc/nginx/sites-enabled/muni
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl enable --now nginx
```

---

## 10) Tailscale (Remote Access from Phone + Laptop)

Tailscale gives every device a permanent `100.x.y.z` IP that works from anywhere — home WiFi, mobile data, anywhere — with no port forwarding and no public exposure.

### Install on the container

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up
```

Open the auth URL it prints, sign in with your Tailscale account.

### Get the container's Tailscale IP

```bash
tailscale ip -4
# example output: 100.64.1.42
```

### Update your env files with the real Tailscale IP

```bash
# Backend CORS
sed -i 's|100.x.y.z|100.64.1.42|g' /opt/muni/app/backend/.env

# Frontend API URL
sed -i 's|100.x.y.z|100.64.1.42|g' /opt/muni/app/frontend/.env.local

# Rebuild frontend with real URL
sudo -u muni -H bash -lc 'cd /opt/muni/app/frontend && npm run build'
systemctl restart muni-backend muni-frontend
```

### Install Tailscale on your devices

- **iPhone/Android** — Tailscale app from App Store / Play Store
- **Mac/Windows** — Tailscale desktop app

Sign into the same Tailscale account. You will then be able to reach:

| What | URL |
|---|---|
| Muni app | `http://100.64.1.42` |
| Backend API | `http://100.64.1.42/api/v1` |

No open ports, no public DNS record needed.

---

## 11) Verify the Deployment

```bash
# Check services
systemctl status muni-backend --no-pager
systemctl status muni-frontend --no-pager

# Check ports
curl -s http://127.0.0.1:8000/health
curl -I http://127.0.0.1:3000

# Check through Nginx
curl -I http://localhost
```

Open `http://<tailscale-ip>` on your phone or laptop.

Default login accounts (created by seed script):
- `keaton` / `finance123`
- `katherine` / `finance123`

**Change passwords immediately after first login** (Settings → Change Password).

---

## 12) Pulling Updates from GitHub (Production Workflow)

### Branch strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, production-ready code — **deploy this to the server** |
| `feature/insights` | Active development — do NOT deploy until merged to main |

When a feature branch is ready, merge it to `main` on GitHub (pull request or direct merge), then pull `main` on the server.

---

### Standard update — pull latest main and redeploy

Run this on the server whenever `main` has new commits:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app

# Pull latest production code
git fetch origin
git checkout main
git pull origin main

# Backend — install any new dependencies and run migrations
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head

# Frontend — install and rebuild
cd ../frontend
npm install
npm run build
'

# Restart both services
systemctl restart muni-backend muni-frontend

# Confirm they came back up
systemctl status muni-backend --no-pager
systemctl status muni-frontend --no-pager
```

---

### Check what version is currently deployed

```bash
cd /opt/muni/app && git log --oneline -5
```

This shows the last 5 commits on the server so you can confirm the right code is running.

---

### Check if there are new commits to pull

```bash
cd /opt/muni/app
git fetch origin
git log HEAD..origin/main --oneline
```

If it prints nothing, you are already up to date. If it lists commits, those are waiting to be pulled.

---

### One-liner deploy script (optional)

Save this as `/usr/local/bin/muni-deploy` for convenience:

```bash
#!/usr/bin/env bash
set -euo pipefail

echo "==> Pulling latest main..."
sudo -u muni -H bash -lc '
cd /opt/muni/app
git fetch origin
git checkout main
git pull origin main
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
cd ../frontend
npm install
npm run build
'

echo "==> Restarting services..."
systemctl restart muni-backend muni-frontend
sleep 2
systemctl status muni-backend --no-pager
systemctl status muni-frontend --no-pager
echo "==> Deploy complete."
```

```bash
chmod +x /usr/local/bin/muni-deploy
```

Then updating the server is just:

```bash
muni-deploy
```

---

### Rollback to a previous version

If a new deployment breaks something:

```bash
# See recent commits
sudo -u muni -H bash -lc 'cd /opt/muni/app && git log --oneline -10'

# Roll back to a specific commit (replace abc1234 with the commit hash you want)
sudo -u muni -H bash -lc '
cd /opt/muni/app
git checkout abc1234
cd frontend
npm run build
'

systemctl restart muni-backend muni-frontend
```

To get back to the latest after a rollback:

```bash
sudo -u muni -H bash -lc 'cd /opt/muni/app && git checkout main && git pull origin main'
```

---

## 13) Backups

### A) Proxmox container snapshot

From Proxmox UI: CT 102 → Backup → Backup now. Schedule weekly with `vzdump`.

### B) SQLite database backup (daily cron)

Create `/usr/local/bin/muni-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/backups/muni
sqlite3 /opt/muni/app/backend/finance.db ".backup /opt/backups/muni/finance-$(date +%F-%H%M).db"
find /opt/backups/muni -type f -mtime +14 -delete
```

```bash
chmod +x /usr/local/bin/muni-backup.sh
apt install -y sqlite3
```

Add to cron (`crontab -e`):

```cron
15 2 * * * /usr/local/bin/muni-backup.sh
```

---

## 14) Security Checklist

- [ ] Change default `keaton` and `katherine` passwords after first login
- [ ] Use a strong root password on the LXC
- [ ] Disable password SSH — use SSH keys only
- [ ] Keep system updated: `apt update && apt upgrade -y`
- [ ] Backend and frontend bound to `127.0.0.1` only — only Nginx/Tailscale is exposed
- [ ] Rotate `SECRET_KEY` in `.env` if it is ever exposed
- [ ] Don't commit `.env` or `finance.db` to Git (`.gitignore` already covers these)

Optional UFW (if you want an extra firewall layer):

```bash
apt install -y ufw
ufw allow OpenSSH
ufw allow 80
ufw enable
ufw status
```

---

## 15) Troubleshooting

### Services won't start

```bash
journalctl -u muni-backend -n 100 --no-pager
journalctl -u muni-frontend -n 100 --no-pager
```

### Frontend can't reach the API

- Check `NEXT_PUBLIC_API_URL` in `.env.local` — must match the Tailscale IP
- Confirm Nginx is running: `systemctl status nginx`
- Confirm backend is running: `curl http://127.0.0.1:8000/health`

### Nginx config error

```bash
nginx -t
journalctl -u nginx -n 50 --no-pager
```

### File upload / import fails

- Increase `client_max_body_size` in the Nginx config (default is 25M, raise if needed)
- `systemctl reload nginx`

### "alembic upgrade head" says "table already exists"

The DB was created by `create_all()` before Alembic ran. Fix:

```bash
cd /opt/muni/app/backend
source venv/bin/activate
alembic stamp head
```

---

## 16) Resource Usage Reference

With 2 GB RAM allocated:

| Component | Idle RAM | Peak RAM |
|---|---|---|
| Ubuntu OS | ~150 MB | — |
| FastAPI (uvicorn) | ~80 MB | ~150 MB |
| Next.js (runtime) | ~200 MB | ~400 MB |
| `npm run build` (one-time) | — | ~700 MB |
| **Total at rest** | **~430 MB** | — |

Your existing containers (modoGusto + cloudflared) use ~21% of 16 GB combined, leaving plenty of headroom.
