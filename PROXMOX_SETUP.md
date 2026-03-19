# Muni — Complete Proxmox Server Guide

This guide covers everything: initial setup, daily startup, shutdown, and deploying updates from GitHub. Every command is written out in full. Nothing is assumed.

---

## Your Hardware Reference

| Spec | Value |
|---|---|
| Machine | Dell OptiPlex Micro (5xxx gen) |
| CPU | Intel Core i5/i7 9th Gen, 35W T-series |
| RAM | 16 GB DDR4 |
| Storage | Internal SSD |
| Existing containers | CT 100 (modoGusto-server), CT 101 (cloudflared) |
| New container | CT 102 (muni) — this guide |

---

---

# PART 1 — INITIAL SETUP

Do this once. After this is done, skip to Part 2 for daily use.

---

## Step 1 — Log into Proxmox Web UI

1. On any device on your home network, open a browser
2. Go to `https://<your-proxmox-ip>:8006`
   - If you don't know the IP, check your router's DHCP client list for a device named `pve` or `proxmox`
3. Log in with your Proxmox root credentials
4. You will see your existing containers (CT 100, CT 101) in the left panel

---

## Step 2 — Download the Ubuntu 24.04 Template

You need this template to create the new container. If you already have it, skip ahead.

1. In the left panel, click your **node name** (e.g. `pve`)
2. Click **local (pve)** in the storage list below it
3. Click **CT Templates** in the right panel
4. Click the **Templates** button at the top
5. In the search box type `ubuntu-24`
6. Select `ubuntu-24.04-standard_*.tar.zst`
7. Click **Download**
8. Wait for the download to finish (progress shown in the Tasks panel at the bottom)

---

## Step 3 — Create the LXC Container

1. Click **Create CT** button at the top right of the Proxmox UI

### General tab
| Field | Value |
|---|---|
| Node | your node (e.g. `pve`) |
| CT ID | `102` |
| Hostname | `muni` (if your Proxmox node is also named `muni`, use `muniapp`) |
| Unprivileged container | ✅ checked |
| Password | set a strong root password — write it down |
| Confirm password | same again |

Click **Next**

### Template tab
| Field | Value |
|---|---|
| Storage | `local` |
| Template | select `ubuntu-24.04-standard_*.tar.zst` |

Click **Next**

### Disks tab
| Field | Value |
|---|---|
| Storage | `local-lvm` (or whichever your SSD is) |
| Disk size (GiB) | `16` |

Click **Next**

### CPU tab
| Field | Value |
|---|---|
| Cores | `2` |

Click **Next**

### Memory tab
| Field | Value |
|---|---|
| Memory (MiB) | `2048` |
| Swap (MiB) | `512` |

Click **Next**

### Network tab
| Field | Value |
|---|---|
| Bridge | `vmbr0` |
| IPv4 | `DHCP` |
| IPv6 | leave blank |

Click **Next**

### DNS tab
Leave defaults. Click **Next**

### Confirm tab
Review the summary. Click **Finish**

Wait for the task to complete in the bottom panel.

---

## Step 4 — Enable Nesting Feature

This allows Docker and certain system calls to work inside the container.

1. In the left panel, click **CT 102 (muni)**
2. Click **Options** in the right panel
3. Double-click **Features**
4. Check **nesting**
5. Click **OK**

---

## Step 5 — Start the Container

1. With CT 102 selected in the left panel, click **Start** at the top
2. Wait a few seconds for the green ▶ indicator to appear
3. Click **Console** to open a terminal inside the container
4. You will see a login prompt — log in as `root` with the password you set

---

## Step 6 — Update the OS

Inside the container console, run these commands one at a time. Wait for each to finish before running the next.

```bash
apt update
```

```bash
apt upgrade -y
```

This updates all packages. It may take 1–3 minutes.

---

## Step 7 — Install Required Software

Install everything the app needs in one command:

```bash
apt install -y git curl build-essential nginx python3 python3-venv python3-pip
```

Now install Node.js 20 (required for Next.js):

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
```

```bash
apt install -y nodejs
```

Verify everything installed correctly:

```bash
node -v
```
Expected output: `v20.x.x`

```bash
npm -v
```
Expected output: `10.x.x`

```bash
python3 --version
```
Expected output: `Python 3.12.x`

```bash
nginx -v
```
Expected output: `nginx version: nginx/1.x.x`

---

## Step 8 — Create the App User and Directory

Create a dedicated user for Muni (never run the app as root):

```bash
adduser --disabled-password --gecos "" muni
```

Add the muni user to the web server group:

```bash
usermod -aG www-data muni
```

Create the app directory:

```bash
mkdir -p /opt/muni
```

Give the muni user ownership of it:

```bash
chown -R muni:muni /opt/muni
```

---

## Step 9 — Clone the Repository

```bash
sudo -u muni -H bash -lc 'git clone https://github.com/Stonetester/MUNI.git /opt/muni/app'
```

Verify it cloned:

```bash
ls /opt/muni/app
```

You should see: `backend  frontend  README.md  PROXMOX_SETUP.md` and other files.

---

## Step 10 — Set Up the Backend

Switch to the backend directory and create a Python virtual environment:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
python3 -m venv venv
'
```

Install Python dependencies:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
'
```

This will take 2–5 minutes. You will see many packages being downloaded.

Run the database migrations to create all tables:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic upgrade head
'
```

If you get an error saying "table already exists", run this instead:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic stamp head
'
```

Seed the database with the default users (keaton and katherine):

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
python seed/seed_data.py
'
```

### Create the backend environment file

Generate a secret key first (copy the output — you will need it in the next command):

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(64))"
```

Create the `.env` file. Replace `PASTE_YOUR_SECRET_KEY_HERE` with the output from above:

```bash
cat > /opt/muni/app/backend/.env << 'EOF'
SECRET_KEY=PASTE_YOUR_SECRET_KEY_HERE
ACCESS_TOKEN_EXPIRE_MINUTES=43200
DATABASE_URL=sqlite:///./finance.db
CORS_ORIGINS=["http://localhost:3000","http://100.x.y.z:3000","http://100.x.y.z"]
EOF
```

You will update `100.x.y.z` with your real Tailscale IP in Step 13. Leave it as-is for now.

Set correct ownership:

```bash
chown muni:muni /opt/muni/app/backend/.env
chmod 600 /opt/muni/app/backend/.env
```

---

## Step 11 — Set Up the Frontend

Create the frontend environment file:

```bash
cat > /opt/muni/app/frontend/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://100.x.y.z
EOF
```

You will update `100.x.y.z` with your real Tailscale IP in Step 13.

Set ownership:

```bash
chown muni:muni /opt/muni/app/frontend/.env.local
```

Install frontend dependencies:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm install
'
```

This will take 2–5 minutes and download many packages.

Build the frontend for production:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm run build
'
```

This will take 1–3 minutes. RAM usage will spike to ~700 MB during the build — this is normal. At the end you should see `✓ Generating static pages (19/19)` with no errors.

---

## Step 12 — Create systemd Services

These services make the backend and frontend start automatically whenever the container boots.

### Create the backend service file

```bash
cat > /etc/systemd/system/muni-backend.service << 'EOF'
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
EOF
```

### Create the frontend service file

```bash
cat > /etc/systemd/system/muni-frontend.service << 'EOF'
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
EOF
```

### Load and start both services

Tell systemd about the new files:

```bash
systemctl daemon-reload
```

Enable both services so they start on every boot:

```bash
systemctl enable muni-backend
systemctl enable muni-frontend
```

Start them now:

```bash
systemctl start muni-backend
systemctl start muni-frontend
```

Wait 5 seconds, then check they are running:

```bash
systemctl status muni-backend --no-pager
```

Look for `Active: active (running)`. If it says `failed`, see the Troubleshooting section at the end.

```bash
systemctl status muni-frontend --no-pager
```

Same — look for `Active: active (running)`.

Test the backend directly:

```bash
curl http://127.0.0.1:8000/health
```

Expected output: `{"status":"ok"}` or similar JSON.

Test the frontend directly:

```bash
curl -I http://127.0.0.1:3000
```

Expected output: `HTTP/1.1 200 OK` on the first line.

---

## Step 13 — Install Tailscale

Tailscale gives the container a permanent IP address (`100.x.y.z`) that works from your phone, laptop, or any device on your Tailscale network — even when you are away from home.

Install Tailscale:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
```

Start Tailscale and connect it to your account:

```bash
tailscale up
```

It will print a URL like `https://login.tailscale.com/a/xxxxxxxx`. Open that URL on any device and log in with your Tailscale account. The container will then be authorized.

Get the container's Tailscale IP address:

```bash
tailscale ip -4
```

Example output: `100.64.1.42`

**Write this IP down.** You will use it everywhere below. Replace `100.64.1.42` with your actual IP in all following commands.

### Update the environment files with the real Tailscale IP

Update the backend CORS allowed origins:

```bash
sed -i 's|100.x.y.z|100.64.1.42|g' /opt/muni/app/backend/.env
```

Update the frontend API URL:

```bash
sed -i 's|100.x.y.z|100.64.1.42|g' /opt/muni/app/frontend/.env.local
```

Verify both files look correct:

```bash
cat /opt/muni/app/backend/.env
cat /opt/muni/app/frontend/.env.local
```

The backend `.env` should have your Tailscale IP in the `CORS_ORIGINS` line.
The frontend `.env.local` should show `NEXT_PUBLIC_API_URL=http://100.64.1.42`.

Rebuild the frontend so it bakes in the correct API URL:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm run build
'
```

Restart both services to pick up the new environment:

```bash
systemctl restart muni-backend muni-frontend
```

---

## Step 14 — Set Up Nginx

Nginx sits in front of both services and routes requests — `/api/` goes to the backend on port 8000, everything else goes to the frontend on port 3000. This means you access the app on port 80 instead of manually specifying ports.

Create the Nginx config for Muni:

```bash
cat > /etc/nginx/sites-available/muni << 'EOF'
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
EOF
```

Enable the Muni site and disable the default placeholder:

```bash
ln -s /etc/nginx/sites-available/muni /etc/nginx/sites-enabled/muni
rm -f /etc/nginx/sites-enabled/default
```

Test that the config has no errors:

```bash
nginx -t
```

Expected output: `syntax is ok` and `test is successful`.

Enable Nginx so it starts on boot and start it now:

```bash
systemctl enable nginx
systemctl start nginx
```

Verify Nginx is running:

```bash
systemctl status nginx --no-pager
```

Test that the full stack works through Nginx:

```bash
curl -I http://localhost
```

Expected: `HTTP/1.1 200 OK`

```bash
curl http://localhost/health
```

Expected: `{"status":"ok"}`

---

## Step 15 — Install Tailscale on Your Devices

On every device you want to access Muni from:

- **iPhone / Android**: Download the Tailscale app from the App Store or Play Store. Sign in with the same Tailscale account you used in Step 13.
- **Windows / Mac laptop**: Download from tailscale.com. Sign in with the same account.

Once signed in on a device, open a browser and go to:

```
http://100.64.1.42
```

(Replace with your actual Tailscale IP from Step 13)

You should see the Muni login page.

Log in with:
- Username: `keaton` Password: `finance123`
- Username: `katherine` Password: `finance123`

**Change both passwords immediately** via Settings → Change Password inside the app.

---

## Step 16 — Set Up Automatic Daily Database Backup

This creates a backup of your database every day at 2:15 AM and keeps 14 days of history.

Install the sqlite3 command-line tool:

```bash
apt install -y sqlite3
```

Create the backup script:

```bash
cat > /usr/local/bin/muni-backup << 'EOF'
#!/usr/bin/env bash
set -euo pipefail
mkdir -p /opt/backups/muni
sqlite3 /opt/muni/app/backend/finance.db ".backup /opt/backups/muni/finance-$(date +%F-%H%M).db"
find /opt/backups/muni -type f -mtime +14 -delete
echo "Backup complete: /opt/backups/muni/finance-$(date +%F-%H%M).db"
EOF
```

Make it executable:

```bash
chmod +x /usr/local/bin/muni-backup
```

Test it runs without error:

```bash
muni-backup
ls /opt/backups/muni
```

You should see a `.db` file with today's date.

Add it to the daily cron schedule. Run:

```bash
crontab -e
```

If it asks which editor to use, type `1` and press Enter to choose `nano`.

Add this line at the bottom of the file:

```
15 2 * * * /usr/local/bin/muni-backup
```

Save and exit: press `Ctrl+X`, then `Y`, then `Enter`.

---

## Step 17 — Create the Deploy Script

This script lets you update Muni to the latest production version with a single command.

```bash
cat > /usr/local/bin/muni-deploy << 'EOF'
#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "=== Muni Deploy ==="
echo ""

echo "--> Pulling latest code from main branch..."
sudo -u muni -H bash -lc '
cd /opt/muni/app
git fetch origin
git checkout main
git pull origin main
'

echo "--> Installing backend dependencies..."
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
pip install -r requirements.txt
'

echo "--> Running database migrations..."
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic upgrade head
'

echo "--> Installing frontend dependencies..."
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm install
'

echo "--> Building frontend (this takes 1-3 minutes)..."
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm run build
'

echo "--> Restarting services..."
systemctl restart muni-backend muni-frontend

echo "--> Waiting for services to come up..."
sleep 3

echo ""
systemctl status muni-backend --no-pager
echo ""
systemctl status muni-frontend --no-pager
echo ""
echo "=== Deploy complete ==="
echo ""
EOF
```

Make it executable:

```bash
chmod +x /usr/local/bin/muni-deploy
```

---

## Step 18 — Final Verification

Run these checks to confirm everything is working end to end:

```bash
# All four services running
systemctl status muni-backend --no-pager
systemctl status muni-frontend --no-pager
systemctl status nginx --no-pager
systemctl status tailscaled --no-pager
```

```bash
# Internal connectivity
curl http://127.0.0.1:8000/health
curl -I http://127.0.0.1:3000
curl -I http://localhost
```

```bash
# Tailscale connectivity (replace with your IP)
curl -I http://100.64.1.42
```

Open `http://100.64.1.42` in your phone browser and log in. Setup is complete.

---

---

# PART 2 — DAILY STARTUP

## When You Turn the Proxmox Server On

When the Dell OptiPlex powers on, Proxmox boots automatically. The LXC containers **do not start automatically by default** unless you configured autostart. Here is how to handle both cases.

### Option A — Configure autostart (recommended, do this once)

This makes CT 102 start automatically whenever Proxmox boots — you never have to think about it.

1. In the Proxmox UI, click **CT 102 (muni)** in the left panel
2. Click **Options**
3. Double-click **Start at boot**
4. Set it to **Yes**
5. Click **OK**

After this, CT 102 starts by itself on every boot. The `muni-backend`, `muni-frontend`, and `nginx` services start automatically inside the container because you ran `systemctl enable` on them in Step 12 and 14.

### Option B — Start the container manually

If autostart is not configured, after Proxmox boots:

1. Log into the Proxmox UI at `https://<proxmox-ip>:8006`
2. Click **CT 102 (muni)** in the left panel
3. Click **Start** at the top
4. Wait 10–15 seconds for the container to boot
5. The services start automatically inside the container — you do not need to do anything else

### Verify everything started after boot

After the container is running, open its console (Proxmox UI → CT 102 → Console) and run:

```bash
systemctl status muni-backend --no-pager
systemctl status muni-frontend --no-pager
systemctl status nginx --no-pager
```

All three should show `Active: active (running)`.

If any are not running, start them manually:

```bash
systemctl start muni-backend
systemctl start muni-frontend
systemctl start nginx
```

---

---

# PART 3 — SHUTDOWN

## How to Safely Shut Down Muni

### To stop the app without shutting down the server

Stop the services inside the container:

```bash
systemctl stop muni-frontend
systemctl stop muni-backend
systemctl stop nginx
```

Stop in that order — frontend first, then backend, then nginx.

### To shut down the container completely

First stop the services as above, then from inside the container run:

```bash
shutdown -h now
```

Or from the Proxmox UI: click **CT 102 (muni)** → click **Shutdown** at the top.

### To shut down the entire Proxmox server

1. Stop CT 102 (muni) as described above
2. Also stop CT 100 and CT 101 the same way if they are running
3. In the Proxmox UI, click your **node name** in the left panel (e.g. `pve`)
4. Click **Shell** to open a terminal on the Proxmox host itself
5. Run:

```bash
shutdown -h now
```

Or from the Proxmox UI: Node → **Shutdown** button at the top right.

---

---

# PART 4 — DEPLOYING UPDATES FROM GITHUB

## Branch Strategy

| Branch | Purpose |
|---|---|
| `main` | Stable, production-ready — **always deploy from this** |
| `feature/insights` | Active development — do not deploy until merged to main |

New features are developed on `feature/insights`. When they are ready and tested, they get merged into `main`. You then pull `main` on the server.

---

## Check What Version Is Currently Running

SSH into the container or open its console in Proxmox, then:

```bash
cd /opt/muni/app && git log --oneline -5
```

This shows the last 5 commits on the server. The top line is what is currently deployed.

---

## Check If There Are New Updates Available

```bash
cd /opt/muni/app
git fetch origin
git log HEAD..origin/main --oneline
```

If the output is **empty**: your server is already on the latest version of main. Nothing to do.

If the output **lists commits**: those are new changes waiting to be deployed. Each line is one commit.

---

## Deploy the Latest Production Version

Run the deploy script created in Step 17:

```bash
muni-deploy
```

That is the entire command. It will:

1. Pull the latest `main` branch from GitHub
2. Install any new Python packages
3. Run any new database migrations
4. Install any new Node packages
5. Rebuild the frontend
6. Restart both services
7. Show you the service status when done

The whole process takes about 3–5 minutes. The app will be briefly unavailable during the service restart (a few seconds).

---

## What the Deploy Script Does Step by Step

If you prefer to run each step manually instead of using `muni-deploy`:

**Step 1 — Pull the latest code**

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app
git fetch origin
git checkout main
git pull origin main
'
```

**Step 2 — Install new Python packages** (only needed if `requirements.txt` changed)

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
pip install -r requirements.txt
'
```

**Step 3 — Run database migrations** (only needed if new models were added)

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic upgrade head
'
```

**Step 4 — Install new frontend packages** (only needed if `package.json` changed)

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm install
'
```

**Step 5 — Rebuild the frontend** (always required for any frontend change)

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm run build
'
```

**Step 6 — Restart the services**

```bash
systemctl restart muni-backend
systemctl restart muni-frontend
```

**Step 7 — Verify they came back up**

```bash
systemctl status muni-backend --no-pager
systemctl status muni-frontend --no-pager
```

---

## Rollback to a Previous Version

If after a deploy the app is broken, roll back to the last working version.

Find the commit hash you want to go back to:

```bash
sudo -u muni -H bash -lc 'cd /opt/muni/app && git log --oneline -10'
```

Example output:
```
9bf25bd3 Add production deploy workflow
d9c606a3 Rewrite PROXMOX_SETUP for Muni
90c95d22 Add bug fixes: transaction names, calendar legend
```

Roll back to a specific commit (replace `90c95d22` with the hash you want):

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app
git checkout 90c95d22
'
```

Rebuild the frontend:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm run build
'
```

Restart:

```bash
systemctl restart muni-backend muni-frontend
```

When you are ready to go back to the latest version:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app
git checkout main
git pull origin main
'
```

Then run `muni-deploy` again.

---

---

# PART 5 — TROUBLESHOOTING

## Service won't start

Check the logs:

```bash
journalctl -u muni-backend -n 50 --no-pager
```

```bash
journalctl -u muni-frontend -n 50 --no-pager
```

Look for error messages near the bottom of the output.

## Frontend shows blank page or can't reach API

Check the frontend `.env.local` has the correct Tailscale IP:

```bash
cat /opt/muni/app/frontend/.env.local
```

If the IP is wrong, update it:

```bash
nano /opt/muni/app/frontend/.env.local
```

Change the `NEXT_PUBLIC_API_URL` line, save (`Ctrl+X` → `Y` → `Enter`), then rebuild:

```bash
sudo -u muni -H bash -lc 'cd /opt/muni/app/frontend && npm run build'
systemctl restart muni-frontend
```

## Tailscale IP changed

The Tailscale IP is permanent and should never change unless you re-install Tailscale. If for some reason it did:

```bash
tailscale ip -4
```

Get the new IP, then update both env files:

```bash
nano /opt/muni/app/backend/.env
nano /opt/muni/app/frontend/.env.local
```

Then rebuild and restart:

```bash
sudo -u muni -H bash -lc 'cd /opt/muni/app/frontend && npm run build'
systemctl restart muni-backend muni-frontend
```

## Nginx error

Test the config:

```bash
nginx -t
```

View logs:

```bash
journalctl -u nginx -n 50 --no-pager
```

## CSV/file upload fails

The uploaded file is too large. Increase the limit in the Nginx config:

```bash
nano /etc/nginx/sites-available/muni
```

Change `client_max_body_size 25M;` to `client_max_body_size 50M;`, save, then reload:

```bash
nginx -t && systemctl reload nginx
```

## "alembic upgrade head" says "table already exists"

This happens when the database was created before Alembic ran. Fix it once with:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic stamp head
'
```

Then run `alembic upgrade head` again — it will say "Already up to date."

## Database is corrupt or missing

Restore from backup:

```bash
ls /opt/backups/muni
```

Pick the most recent backup file, then:

```bash
cp /opt/backups/muni/finance-2026-03-18-0215.db /opt/muni/app/backend/finance.db
chown muni:muni /opt/muni/app/backend/finance.db
systemctl restart muni-backend
```

## Check resource usage

See how much RAM and CPU the container is using:

```bash
free -h
top
```

Press `q` to exit `top`.

---

---

# PART 6 — QUICK REFERENCE CARD

Print or save this section for day-to-day use.

### Start everything
```bash
systemctl start muni-backend muni-frontend nginx
```

### Stop everything
```bash
systemctl stop muni-frontend muni-backend nginx
```

### Restart everything
```bash
systemctl restart muni-backend muni-frontend nginx
```

### Check status
```bash
systemctl status muni-backend muni-frontend nginx --no-pager
```

### View live logs (backend)
```bash
journalctl -u muni-backend -f
```

### View live logs (frontend)
```bash
journalctl -u muni-frontend -f
```

### Deploy latest production code
```bash
muni-deploy
```

### Check what version is deployed
```bash
cd /opt/muni/app && git log --oneline -5
```

### Check if updates are available
```bash
cd /opt/muni/app && git fetch origin && git log HEAD..origin/main --oneline
```

### Manual database backup
```bash
muni-backup
```

### App URL (from any Tailscale device)
```
http://<your-tailscale-ip>
```
