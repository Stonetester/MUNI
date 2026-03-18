# FinanceTrack Production Setup on Proxmox (Best-Practice)

This guide is the recommended production path:

- **Proxmox Ubuntu VM** (recommended over LXC for easiest Tailscale + Docker networking)
- **Docker Compose**
- **PostgreSQL** (best DB choice for this app in production)
- **Nginx reverse proxy**
- **Tailscale** for secure remote/private access from anywhere

---

## 0) Final Architecture

Proxmox VM (Ubuntu 24.04) runs:
- `db` (PostgreSQL 16)
- `backend` (FastAPI)
- `frontend` (Next.js)
- `nginx` (TLS + reverse proxy)
- `tailscaled` (host-level service)

Traffic options:
1. **Tailscale-only private access** (recommended)
2. Public DNS + TLS (optional) in addition to Tailscale

---

## 1) Create Ubuntu VM in Proxmox

### Suggested VM resources
- vCPU: 2
- RAM: 4 GB
- Disk: 40 GB
- NIC: vmbr0 bridge

Install Ubuntu Server 24.04, then SSH in.

---

## 2) Base OS setup

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y ca-certificates curl gnupg lsb-release git nginx ufw
```

Set timezone (optional):
```bash
timedatectl set-timezone America/Chicago
```

---

## 3) Install Docker Engine + Compose plugin

```bash
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt update
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker
```

Optional: run docker without sudo for your user:
```bash
sudo usermod -aG docker $USER
newgrp docker
```

---

## 4) Install Tailscale on the VM

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo systemctl enable --now tailscaled
```

Bring node online:
```bash
sudo tailscale up --ssh
```

After auth, verify:
```bash
tailscale status
tailscale ip -4
```

### Recommended Tailscale ACL posture
- Only allow your user/devices to reach this node
- Use Tailscale SSH instead of opening public SSH

---

## 5) Clone FinanceTrack on VM

```bash
sudo mkdir -p /opt/financetrack
sudo chown -R $USER:$USER /opt/financetrack
cd /opt/financetrack
git clone <YOUR_REPO_URL> app
cd app
```

---

## 6) Configure production environment

Create `.env` in repo root:

```env
SECRET_KEY=REPLACE_WITH_LONG_RANDOM_VALUE
POSTGRES_PASSWORD=REPLACE_WITH_STRONG_DB_PASSWORD
```

Generate strong values:
```bash
python3 - <<'PY'
import secrets
print('SECRET_KEY=' + secrets.token_urlsafe(64))
print('POSTGRES_PASSWORD=' + secrets.token_urlsafe(32))
PY
```

### Backend env
Create `backend/.env`:

```env
DATABASE_URL=postgresql://finance:${POSTGRES_PASSWORD}@db:5432/financedb
SECRET_KEY=${SECRET_KEY}
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=43200
```

> If you use docker compose env interpolation only, keep values in root `.env` and set backend env vars via compose.

---

## 7) Use PostgreSQL in production (best DB for this app)

Why PostgreSQL over SQLite:
- Better durability/concurrency
- Better for long-term growth and multi-user usage
- Better backup/restore tooling

The provided `docker-compose.yml` already includes PostgreSQL service (`db`).

---

## 8) Start the full stack (from scratch)

From `/opt/financetrack/app`:

```bash
docker compose pull
docker compose build
docker compose up -d
```

Run migrations + seed if needed (first run):

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python seed/seed_data.py
```

Check container status:

```bash
docker compose ps
docker compose logs backend --tail 100
docker compose logs frontend --tail 100
```

---

## 9) Nginx reverse proxy configuration

Create `/etc/nginx/sites-available/financetrack`:

```nginx
server {
    listen 80;
    server_name _;

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
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

Enable site:

```bash
sudo ln -sf /etc/nginx/sites-available/financetrack /etc/nginx/sites-enabled/financetrack
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

---

## 10) Access strategy with Tailscale

### Recommended: private access only

Use the Tailscale IP or MagicDNS name, e.g.:
- `http://100.x.y.z`
- `http://financetrack.tailnet-name.ts.net`

If using private-only, keep router ports 80/443 closed publicly.

### Optional: public HTTPS
If you also want public HTTPS, add public DNS and certbot. Tailscale still remains your secure admin path.

---

## 11) Firewall hardening

If private-only via Tailscale, you can restrict LAN/public ports heavily.

Example UFW baseline:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow in on tailscale0
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
sudo ufw status verbose
```

If using only Tailscale and not public web, do **not** allow WAN router forwards.

---

## 12) Startup, Shutdown, Restart Runbook

All commands from `/opt/financetrack/app`.

### Start app
```bash
docker compose up -d
```

### Stop app (keep data volumes)
```bash
docker compose stop
```

### Full shutdown (containers removed, data preserved)
```bash
docker compose down
```

### Restart app
```bash
docker compose restart
```

### View logs
```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
```

### Check health
```bash
curl -I http://127.0.0.1:8000/health
curl -I http://127.0.0.1:3000
curl -I http://127.0.0.1
```

---

## 13) Upgrade procedure (safe)

```bash
cd /opt/financetrack/app
git pull
docker compose build
docker compose up -d
docker compose exec backend alembic upgrade head
```

Verify:
```bash
docker compose ps
docker compose logs backend --tail 100
```

---

## 14) Backup strategy

### Proxmox-level backup
- Schedule VM backups in Proxmox (`vzdump`).

### App-level DB backup (PostgreSQL)

Create backup directory and run:

```bash
mkdir -p /opt/financetrack/backups
cd /opt/financetrack/app
docker compose exec -T db pg_dump -U finance -d financedb > /opt/financetrack/backups/financedb-$(date +%F-%H%M).sql
```

Restore example:

```bash
cat /opt/financetrack/backups/financedb-YYYY-MM-DD-HHMM.sql | docker compose exec -T db psql -U finance -d financedb
```

---

## 15) Feature verification checklist (post-deploy)

After deployment you can run a scripted API smoke test:

```bash
cd /opt/financetrack/app
python scripts/api_smoke_test.py --base-url http://127.0.0.1:8000 --username keaton --password finance123
```

After deployment, verify every feature path:

1. Login works
2. Dashboard loads with charts/cards
3. Transactions CRUD + import/export
4. Accounts CRUD + snapshots
5. Budget summary loads
6. Forecast chart/table loads
7. Life events CRUD
8. Scenarios create/clone/compare
9. Alerts page loads
10. Settings password change works

If any fail, inspect logs:
```bash
docker compose logs backend --tail 200
docker compose logs frontend --tail 200
```

---

## 16) Optional: autostart on VM boot

```bash
cd /opt/financetrack/app
docker compose up -d
```

Docker containers with restart policies can auto-recover; if needed, add explicit `restart: unless-stopped` entries in compose services.
