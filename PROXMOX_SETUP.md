# FinanceTrack Deployment Guide for Proxmox (Ubuntu LXC)

This document gives exact instructions to deploy FinanceTrack on a Proxmox host using an **Ubuntu LXC container** (recommended).

---

## 1) Recommended Architecture

For this app, use:
- **Proxmox VE** host
- **Unprivileged Ubuntu 24.04 LXC** container
- App stack inside container:
  - FastAPI backend (Uvicorn, port `8000`, localhost only)
  - Next.js frontend (port `3000`, localhost only)
  - Nginx reverse proxy (port `80/443` public)
  - SQLite database (`backend/finance.db`)
  - systemd services for backend/frontend

Why LXC here:
- Lighter than full VM
- Easy backups with Proxmox `vzdump`
- Great fit for this single-node app

---

## 2) Create the LXC in Proxmox

In Proxmox UI:

1. **Download template**
   - Node → local (`pve`) → CT Templates → Templates
   - Get: `ubuntu-24.04-standard_*.tar.zst`

2. **Create CT**
   - Hostname: `financetrack`
   - Unprivileged container: ✅ yes
   - Password: set a strong root password

3. **Disk/CPU/RAM suggestion**
   - Disk: `25 GB` (or more)
   - vCPU: `2`
   - RAM: `4096 MB`
   - Swap: `1024 MB`

4. **Network**
   - Bridge: `vmbr0`
   - IPv4: static (recommended), example `192.168.1.80/24`
   - Gateway: your LAN gateway, example `192.168.1.1`

5. **Features (Options → Features)**
   - `nesting=1` (recommended)

6. Start the container.

---

## 3) Initial OS Setup in Container

Enter container shell from Proxmox, then run:

```bash
apt update && apt upgrade -y
apt install -y git curl unzip build-essential nginx certbot python3-certbot-nginx \
  python3 python3-venv python3-pip
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
node -v
npm -v
python3 --version
```

---

## 4) Create Application User and Directory

```bash
adduser --disabled-password --gecos "" financetrack
usermod -aG www-data financetrack
mkdir -p /opt/financetrack
chown -R financetrack:financetrack /opt/financetrack
```

---

## 5) Pull Project Code

If your repo is public:

```bash
sudo -u financetrack -H bash -lc '
cd /opt/financetrack
git clone <YOUR_REPO_URL> app
'
```

If private repo, set SSH key for `financetrack` user first, then clone via SSH.

From now on repo path is:
- `/opt/financetrack/app`

---

## 6) Backend Setup (FastAPI + SQLite)

```bash
sudo -u financetrack -H bash -lc '
cd /opt/financetrack/app/backend
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
alembic upgrade head
python seed/seed_data.py
'
```

### Backend environment file

Create `/opt/financetrack/app/backend/.env`:

```env
SECRET_KEY=REPLACE_WITH_LONG_RANDOM_SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=43200
DATABASE_URL=sqlite:///./finance.db
CORS_ORIGINS=["https://finance.yourdomain.com"]
```

Generate secret example:

```bash
python3 - <<'PY'
import secrets
print(secrets.token_urlsafe(64))
PY
```

---

## 7) Frontend Setup (Next.js)

Create frontend env file `/opt/financetrack/app/frontend/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://finance.yourdomain.com
```

Build frontend:

```bash
sudo -u financetrack -H bash -lc '
cd /opt/financetrack/app/frontend
npm install
npm run build
'
```

---

## 8) Create systemd Services

### Backend service

Create `/etc/systemd/system/financetrack-backend.service`:

```ini
[Unit]
Description=FinanceTrack FastAPI Backend
After=network.target

[Service]
User=financetrack
Group=www-data
WorkingDirectory=/opt/financetrack/app/backend
EnvironmentFile=/opt/financetrack/app/backend/.env
ExecStart=/opt/financetrack/app/backend/venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

### Frontend service

Create `/etc/systemd/system/financetrack-frontend.service`:

```ini
[Unit]
Description=FinanceTrack Next.js Frontend
After=network.target

[Service]
User=financetrack
Group=www-data
WorkingDirectory=/opt/financetrack/app/frontend
Environment=NODE_ENV=production
EnvironmentFile=-/opt/financetrack/app/frontend/.env.local
ExecStart=/usr/bin/npm run start -- --hostname 127.0.0.1 --port 3000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

Enable/start both:

```bash
systemctl daemon-reload
systemctl enable --now financetrack-backend
systemctl enable --now financetrack-frontend
systemctl status financetrack-backend --no-pager
systemctl status financetrack-frontend --no-pager
```

---

## 9) Nginx Reverse Proxy

Create `/etc/nginx/sites-available/financetrack`:

```nginx
server {
    listen 80;
    server_name finance.yourdomain.com;

    client_max_body_size 25M;

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

Enable site:

```bash
ln -s /etc/nginx/sites-available/financetrack /etc/nginx/sites-enabled/financetrack
nginx -t
systemctl reload nginx
```

---

## 10) DNS + TLS (Let’s Encrypt)

1. Create DNS A record:
   - `finance.yourdomain.com -> <your_public_ip>`
2. Port-forward router:
   - `80 -> LXC_IP:80`
   - `443 -> LXC_IP:443`
3. Request cert:

```bash
certbot --nginx -d finance.yourdomain.com --redirect --agree-tos -m you@example.com
```

Test renewal:

```bash
certbot renew --dry-run
```

---

## 11) Verify Deployment

Run checks:

```bash
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1:8000/health
curl -I https://finance.yourdomain.com
```

Open browser:
- `https://finance.yourdomain.com`

Login default users (if seeded):
- `keaton / finance123`
- `katherine / finance123`

Immediately change passwords.

---

## 12) Update / Redeploy Procedure

Whenever you update code:

```bash
sudo -u financetrack -H bash -lc '
cd /opt/financetrack/app
git pull
cd backend
source venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
cd ../frontend
npm install
npm run build
'

systemctl restart financetrack-backend
systemctl restart financetrack-frontend
systemctl status financetrack-backend --no-pager
systemctl status financetrack-frontend --no-pager
```

---

## 13) Backups (Important)

### A) Proxmox snapshot/backup
- Use scheduled `vzdump` for the LXC container.

### B) App-level SQLite backup

Create script `/usr/local/bin/financetrack-db-backup.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/backups/financetrack
cp /opt/financetrack/app/backend/finance.db /opt/backups/financetrack/finance-$(date +%F-%H%M).db
find /opt/backups/financetrack -type f -mtime +14 -delete
```

```bash
chmod +x /usr/local/bin/financetrack-db-backup.sh
```

Add cron (`crontab -e` as root):

```cron
15 2 * * * /usr/local/bin/financetrack-db-backup.sh
```

---

## 14) Security Hardening Checklist

- Use strong root and app-user passwords
- Disable password SSH login; use SSH keys only
- Keep system updated: `apt update && apt upgrade -y`
- Configure Proxmox firewall and/or UFW
- Restrict backend/frontend to localhost only (already done)
- Expose only Nginx 80/443 publicly
- Rotate secrets if leaked

Optional UFW:

```bash
apt install -y ufw
ufw allow OpenSSH
ufw allow 80
ufw allow 443
ufw enable
ufw status
```

---

## 15) Troubleshooting

### Services won’t start
```bash
journalctl -u financetrack-backend -n 200 --no-pager
journalctl -u financetrack-frontend -n 200 --no-pager
```

### Nginx errors
```bash
nginx -t
journalctl -u nginx -n 200 --no-pager
```

### Frontend can’t reach API
- Confirm `NEXT_PUBLIC_API_URL=https://finance.yourdomain.com`
- Confirm Nginx `/api/` proxy block exists
- Confirm backend service is running

### Import uploads fail
- Increase `client_max_body_size` in Nginx
- Reload Nginx

---

## 16) Alternative: Ubuntu VM Instead of LXC

If you strongly prefer full isolation:
- Use Ubuntu 24.04 VM
- Repeat the same app/service/Nginx steps inside VM

But for this app, LXC is usually simpler and lighter.
