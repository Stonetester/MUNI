# Muni — Complete Proxmox Server Guide

This guide covers everything: initial setup, daily startup, shutdown, deploying updates from GitHub, and troubleshooting every error you might encounter. Every command is written out in full. Nothing is assumed.

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
| Hostname | `muni` |
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

## Step 4 — Enable Nesting

Enable nesting for the container. This is required for certain system calls inside the container.

1. In the left panel, click **CT 102 (muni)**
2. Click **Options** in the right panel
3. Double-click **Features**
4. Check **nesting**
5. Click **OK**

> **No TUN device setup needed.** Tailscale runs on Roman (the Proxmox host), not inside each container. Roman acts as a subnet router that exposes your entire LAN — see Step 13 for the full setup.

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

> **Note:** You may see a warning: `(trapped) error reading bcrypt version` or `module 'bcrypt' has no attribute '__about__'`. This is a harmless compatibility warning between the `passlib` and `bcrypt` libraries. The app works correctly despite it. Ignore it.

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

Expected output:
```
Seeding database with users and categories...
  Created users: keaton, katherine
  Created default categories
Seed complete!
```

> **Important:** If you skip this step, clicking Keaton or Katherine on the login screen will fail silently because the users do not exist in the database. If the app was already running and the DB existed but was empty, just run the seed command above — it is safe to run at any time.

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
CORS_ORIGINS=["http://localhost:3000","http://10.0.0.48:3000","http://10.0.0.48"]
EOF
```

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
NEXT_PUBLIC_API_URL=http://10.0.0.48
EOF
```

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

This will take 1–3 minutes. RAM usage will spike to ~700 MB during the build — this is normal. At the end you should see `✓ Generating static pages` with no errors.

---

## Step 12 — Create systemd Services (Auto-Start on Boot)

These services make the backend and frontend start automatically whenever the container boots or restarts. You create them once and never need to manually start the app again.

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

### Load and enable all services to start on every boot

Tell systemd about the new files:

```bash
systemctl daemon-reload
```

Enable all services so they start automatically on every container boot:

```bash
systemctl enable muni-backend
systemctl enable muni-frontend
systemctl enable nginx
```

Start them now for the first time:

```bash
systemctl start muni-backend
systemctl start muni-frontend
systemctl start nginx
```

Wait 5 seconds, then check they are running:

```bash
systemctl status muni-backend --no-pager
```

Look for `Active: active (running)`. If it says `failed`, see the Troubleshooting section at the end of this guide.

```bash
systemctl status muni-frontend --no-pager
```

Same — look for `Active: active (running)`.

Test the backend directly:

```bash
curl http://127.0.0.1:8000/health
```

Expected output: `{"status":"ok"}`

Test the frontend directly:

```bash
curl -I http://127.0.0.1:3000
```

Expected output: `HTTP/1.1 200 OK` on the first line.

---

## Step 13 — Configure Remote Access via Roman's Subnet Router

Tailscale is already installed on Roman (your Proxmox host at 10.0.0.11). Instead of installing Tailscale inside each container, Roman acts as a **subnet router** — it advertises your entire home network (10.0.0.0/24) through Tailscale. This means every device on your LAN, including the muni container at 10.0.0.48, is reachable from anywhere with no extra setup per container.

**Your network layout:**
| Machine | LAN IP | Role |
|---|---|---|
| Roman (Proxmox host) | 10.0.0.11 | Tailscale subnet router |
| CT 102 (muni) | 10.0.0.48 | Finance app |
| CT 100 (modoGusto) | 10.0.0.x | Food app |
| CT 101 (cloudflared) | 10.0.0.x | Cloudflare tunnel |

**You access muni at:** `http://10.0.0.48` — from any device connected to your Tailscale account.

---

### Step 13a — Enable subnet routing on Roman

SSH into Roman (not the muni container) or use the Proxmox shell (node → Shell in the left panel).

Enable IP forwarding (required for subnet routing — if you already ran these, running again is harmless):

```bash
echo 'net.ipv4.ip_forward = 1' >> /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' >> /etc/sysctl.d/99-tailscale.conf
sysctl -p /etc/sysctl.d/99-tailscale.conf
```

Tell Tailscale to advertise your LAN subnet:

```bash
tailscale up --advertise-routes=10.0.0.0/24
```

Verify Tailscale is running and the route is being advertised:

```bash
tailscale status
```

You should see Roman listed as a node. The output will mention the subnet route.

---

### Step 13b — Approve the subnet route in the Tailscale admin console

This one-time approval step must be done from a browser:

1. Go to **https://login.tailscale.com/admin/machines**
2. Find **Roman** in the machine list
3. Click the **`...`** menu next to Roman → **Edit route settings**
4. You will see `10.0.0.0/24` listed — toggle it **on**
5. Click **Save**

After approval, any device connected to your Tailscale account can reach `10.0.0.48` (muni), `10.0.0.11` (Roman Proxmox UI), and everything else on your LAN.

---

### Step 13c — Install Tailscale on your devices

On every device you want to use to access Muni:

- **iPhone / Android**: Install the Tailscale app from the App Store or Play Store. Sign in with the same account.
- **Windows / Mac laptop**: Download from tailscale.com. Sign in with the same account.

Once connected, open a browser and go to:

```
http://10.0.0.48
```

You should see the Muni login screen.

---

### Step 13d — Verify from inside the muni container

Back inside the muni container (not Roman), verify the app is reachable at its LAN IP:

```bash
curl http://10.0.0.48/health
```

Expected: `{"status":"ok"}`

---

## Step 14 — Set Up Nginx

Nginx sits in front of both services and routes requests — `/api/` goes to the backend on port 8000, everything else goes to the frontend on port 3000. This means you access the app on port 80 with no port number in the URL.

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

Reload Nginx to apply the config:

```bash
systemctl reload nginx
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
http://10.0.0.48
```

You should see the Muni login screen. Click **Keaton** or **Katherine** to log in — no password required.

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

echo "--> Ensuring frontend .env.local exists..."
if [ ! -f /opt/muni/app/frontend/.env.local ]; then
  echo 'NEXT_PUBLIC_API_URL=http://10.0.0.48' > /opt/muni/app/frontend/.env.local
  chown muni:muni /opt/muni/app/frontend/.env.local
  echo "    Created .env.local with NEXT_PUBLIC_API_URL=http://10.0.0.48"
else
  echo "    .env.local already exists"
fi

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
# All services running
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
# LAN connectivity (reachable via Tailscale subnet route on Roman)
curl -I http://10.0.0.48
```

Open `http://10.0.0.48` in your phone browser (with Tailscale connected) and click Keaton or Katherine to log in. Setup is complete.

---

---

# PART 2 — DAILY STARTUP AND AUTO-START

## How Auto-Start Works

If you followed this guide, **everything starts automatically**. You do not need to do anything after a power on or reboot. Here is what happens in order:

1. Proxmox host (Roman) boots → Tailscale on Roman starts automatically (systemctl enabled on Roman)
2. Proxmox host boots → CT 102 (muni) starts automatically (if you configured autostart — see below)
3. CT 102 boots → `muni-backend` starts automatically (systemctl enabled in Step 12)
4. CT 102 boots → `muni-frontend` starts automatically (systemctl enabled in Step 12)
5. CT 102 boots → `nginx` starts automatically (systemctl enabled in Step 12)

After about 15–20 seconds from power on, the app is accessible at `http://10.0.0.48` from any Tailscale-connected device.

---

## Configure CT 102 to Start Automatically When Proxmox Boots

Do this once. Without it, you have to manually start the container in the Proxmox UI every time.

1. In the Proxmox UI, click **CT 102 (muni)** in the left panel
2. Click **Options**
3. Double-click **Start at boot**
4. Set it to **Yes**
5. Click **OK**

From now on, the entire stack — container, Tailscale, backend, frontend, and Nginx — comes up on its own whenever the server powers on.

---

## Starting the Container Manually (if autostart is off)

If autostart is not configured, after Proxmox boots:

1. Log into the Proxmox UI at `https://<proxmox-ip>:8006`
2. Click **CT 102 (muni)** in the left panel
3. Click **Start** at the top
4. Wait 15–20 seconds for the container to boot and all services to start
5. The services start automatically inside the container — you do not need to open the console or run any commands

---

## Verify Everything Started After Boot

To confirm all services are up, open the container console (Proxmox UI → CT 102 → Console) or SSH in, then:

```bash
systemctl status muni-backend muni-frontend nginx --no-pager
```

All three should show `Active: active (running)`.

> **Tailscale runs on Roman, not inside this container.** If the app is unreachable from outside your home network, check Tailscale status on Roman: `ssh root@10.0.0.11` then `tailscale status`.

If any container services are not running, start them manually:

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

Stop the services inside the container in this order:

```bash
systemctl stop muni-frontend
systemctl stop muni-backend
systemctl stop nginx
```

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
| `dev` | Integration testing — merged into main when ready |
| `feature/*` | Active development — do not deploy until merged to main |

New features are developed on feature branches, merged to `dev` for testing, then merged to `main`. You then pull `main` on the server.

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
systemctl restart muni-backend muni-frontend
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
9bf25bd3 Add AI report and email notifications
d9c606a3 Remove password auth — profile picker
90c95d22 Fix transaction import bug
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

Every error you might encounter is documented here. Read the exact error message, find the matching section, and follow the steps.

---

## App not reachable from outside home network / Tailscale not working

**Symptom:** You can reach `http://10.0.0.48` from devices on your home Wi-Fi, but not from your phone on mobile data or from a remote laptop.

**Cause:** Tailscale subnet routing is not active on Roman, or the route has not been approved in the admin console, or the device you're connecting from is not signed into Tailscale.

**Fix — check each in order:**

**1. Verify Tailscale is running on Roman:**

```bash
# SSH into Roman, or use Proxmox node → Shell
ssh root@10.0.0.11
tailscale status
```

If the output shows `Stopped` or `tailscale: command not found`, start it:

```bash
systemctl start tailscaled
systemctl enable tailscaled
tailscale up
```

**2. Verify the subnet route is being advertised:**

```bash
# On Roman
tailscale status --active
```

Look for a line showing `10.0.0.0/24` in the routes section. If it's missing, re-run:

```bash
tailscale up --advertise-routes=10.0.0.0/24
```

**3. Verify the route is approved in the admin console:**

Go to **https://login.tailscale.com/admin/machines** → find Roman → **Edit route settings** → confirm `10.0.0.0/24` is toggled on.

**4. Verify the connecting device is on Tailscale:**

On your phone or laptop, open the Tailscale app and confirm it shows as connected. Disconnect and reconnect if needed.

**5. Test the connection:**

From a Tailscale-connected device (not on your home Wi-Fi):

```bash
curl http://10.0.0.48/health
```

Expected: `{"status":"ok"}`

---

## Tailscale subnet routing was working, now stopped

**Cause:** Roman rebooted and Tailscale's `tailscaled` service didn't start automatically.

**Fix — on Roman:**

```bash
systemctl enable tailscaled   # ensure it auto-starts on boot
systemctl start tailscaled
sleep 3
tailscale up --advertise-routes=10.0.0.0/24
```

To prevent this permanently, verify it's enabled:

```bash
systemctl is-enabled tailscaled
```

Should output: `enabled`

---

## Tailscale: IP forwarding not working after Roman reboot

If subnet routing stops after Roman reboots, verify the sysctl settings persisted:

```bash
# On Roman
sysctl net.ipv4.ip_forward
```

Expected: `net.ipv4.ip_forward = 1`

If it shows `0`, the file wasn't saved properly. Re-run:

```bash
echo 'net.ipv4.ip_forward = 1' > /etc/sysctl.d/99-tailscale.conf
echo 'net.ipv6.conf.all.forwarding = 1' >> /etc/sysctl.d/99-tailscale.conf
sysctl -p /etc/sysctl.d/99-tailscale.conf
```

---

## Login does nothing when clicking Keaton or Katherine

**Symptom:** Clicking the profile cards on the login screen does nothing. The backend logs show:
```
POST /api/v1/auth/switch/keaton HTTP/1.1" 404 Not Found
```

**Cause:** The database was not seeded — the users `keaton` and `katherine` do not exist in the database.

**Fix:**

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
python seed/seed_data.py
'
```

Expected output: `Created users: keaton, katherine`

If it says "Database already seeded. Skipping." but login still fails, the database may be corrupt or in a different location. Check:

```bash
ls -la /opt/muni/app/backend/finance.db
```

If the file is 0 bytes or missing, delete it and re-seed:

```bash
rm -f /opt/muni/app/backend/finance.db
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic upgrade head
python seed/seed_data.py
'
systemctl restart muni-backend
```

---

## Backend service won't start

Check the full error logs:

```bash
journalctl -u muni-backend -n 100 --no-pager
```

Look for error messages near the bottom.

**Common causes:**

**Missing `.env` file:**
```
EnvironmentFile=/opt/muni/app/backend/.env: No such file or directory
```
Fix: Create the `.env` file following Step 10 of this guide.

**Missing Python package:**
```
ModuleNotFoundError: No module named 'xxx'
```
Fix:
```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
pip install -r requirements.txt
'
systemctl restart muni-backend
```

**Port already in use:**
```
error: [Errno 98] Address already in use
```
Fix:
```bash
fuser -k 8000/tcp
systemctl restart muni-backend
```

**Database permission error:**
```
sqlite3.OperationalError: unable to open database file
```
Fix:
```bash
chown muni:muni /opt/muni/app/backend/finance.db
chmod 644 /opt/muni/app/backend/finance.db
systemctl restart muni-backend
```

---

## Frontend service won't start

Check the logs:

```bash
journalctl -u muni-frontend -n 100 --no-pager
```

**Common causes:**

**Build not run:**
```
Error: Cannot find module '.next/server/app/page_client-reference-manifest.js'
```
Fix: The frontend was never built or the build failed.
```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm install
npm run build
'
systemctl restart muni-frontend
```

**Node not found:**
```
/usr/bin/npm: not found
```
Fix:
```bash
which node && which npm
```
If those return nothing, reinstall Node:
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt install -y nodejs
```

---

## Frontend shows blank page or "Failed to fetch" / can't reach API

**Cause:** The `NEXT_PUBLIC_API_URL` in the frontend `.env.local` has the wrong IP, or the backend is not running.

Check the current config:

```bash
cat /opt/muni/app/frontend/.env.local
```

It should show `NEXT_PUBLIC_API_URL=http://10.0.0.48` (muni's LAN IP). If it shows a different IP or a `100.x.y.z` Tailscale IP, update it:

```bash
nano /opt/muni/app/frontend/.env.local
```

Change the `NEXT_PUBLIC_API_URL` line to `http://10.0.0.48`, save (`Ctrl+X` → `Y` → `Enter`), then rebuild and restart:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/frontend
npm run build
'
systemctl restart muni-frontend
```

Also verify the backend is actually running:

```bash
curl http://127.0.0.1:8000/health
```

If that fails, restart the backend:

```bash
systemctl restart muni-backend
```

---

---

## Nginx error / 502 Bad Gateway

Test the Nginx config for syntax errors:

```bash
nginx -t
```

View recent Nginx logs:

```bash
journalctl -u nginx -n 50 --no-pager
```

**502 Bad Gateway** means Nginx is running but cannot reach the backend or frontend. Check:

```bash
curl http://127.0.0.1:8000/health   # backend
curl -I http://127.0.0.1:3000       # frontend
```

If either fails, start the failing service:

```bash
systemctl start muni-backend
systemctl start muni-frontend
```

---

## Nginx: "sites-enabled/muni already exists" when setting up

```bash
rm /etc/nginx/sites-enabled/muni
ln -s /etc/nginx/sites-available/muni /etc/nginx/sites-enabled/muni
nginx -t && systemctl reload nginx
```

---

## CSV or file upload fails / 413 Request Entity Too Large

The uploaded file is too large for the current Nginx config. Increase the limit:

```bash
nano /etc/nginx/sites-available/muni
```

Change `client_max_body_size 25M;` to `client_max_body_size 50M;`, save, then reload:

```bash
nginx -t && systemctl reload nginx
```

---

## "alembic upgrade head" says "table already exists"

This happens when the database was created by the app before Alembic ran its migrations. Fix it once with:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic stamp head
'
```

Then run `alembic upgrade head` again — it will say "Already up to date."

---

## bcrypt warning on startup or seed

**Warning text:**
```
(trapped) error reading bcrypt version
AttributeError: module 'bcrypt' has no attribute '__about__'
```

**This is harmless.** It is a compatibility warning between the `passlib` library and newer versions of `bcrypt`. The app works correctly. You can ignore this warning entirely. It appears because `passlib 1.7.4` tries to read `bcrypt.__about__.__version__` which no longer exists in `bcrypt 4.x`.

---

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

If there are no backups and the database is completely gone, re-create it from scratch:

```bash
sudo -u muni -H bash -lc '
cd /opt/muni/app/backend
source venv/bin/activate
alembic upgrade head
python seed/seed_data.py
'
systemctl restart muni-backend
```

Note: this wipes all transaction data. Only do this if there is no backup.

---

## Service shows "active (running)" but app is not accessible

The service is up but something is blocking access. Work through this checklist:

1. **Is Tailscale running on Roman (not inside this container)?**
   ```bash
   # SSH into Roman or use Proxmox node → Shell
   ssh root@10.0.0.11
   tailscale status
   ```
   If stopped: `systemctl start tailscaled && tailscale up --advertise-routes=10.0.0.0/24`

2. **Is Nginx running?**
   ```bash
   systemctl status nginx --no-pager
   curl -I http://localhost
   ```

3. **Can you reach the backend internally?**
   ```bash
   curl http://127.0.0.1:8000/health
   ```

4. **Is your device on Tailscale?**
   On your phone or laptop, open the Tailscale app and make sure it shows as connected.

5. **Are you using the right IP?**
   The muni container is at `10.0.0.48`. Open `http://10.0.0.48` in the browser — no `https`, no extra port number. This IP is reachable from any Tailscale-connected device because Roman advertises the 10.0.0.0/24 subnet.

---

## Container uses too much RAM and the build fails

The `npm run build` step uses ~700 MB of RAM. If the container only has 1 GB of RAM, the build will fail with an out-of-memory error.

Fix: increase the container RAM in Proxmox.

1. Stop the container: Proxmox UI → CT 102 → Shutdown
2. Click **Resources** → **Memory**
3. Set Memory to `2048` MiB
4. Click **OK**
5. Start the container and retry the build

---

## Check overall resource usage

See how much RAM and CPU the container is using:

```bash
free -h
```

```bash
top
```

Press `q` to exit `top`.

---

---

# PART 6 — QUICK REFERENCE CARD

Print or save this section for day-to-day use.

### Check status of everything (inside muni container)
```bash
systemctl status muni-backend muni-frontend nginx --no-pager
```

### Check Tailscale status (on Roman, not muni)
```bash
ssh root@10.0.0.11 'tailscale status'
```

### Start everything (inside muni container)
```bash
systemctl start muni-backend muni-frontend nginx
```

### Stop everything (inside muni container)
```bash
systemctl stop muni-frontend muni-backend nginx
```

### Restart everything (inside muni container)
```bash
systemctl restart muni-backend muni-frontend nginx
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

### Re-seed the database (if login fails)
```bash
sudo -u muni -H bash -lc 'cd /opt/muni/app/backend && source venv/bin/activate && python seed/seed_data.py'
```

### App URL (from any Tailscale-connected device)
```
http://10.0.0.48
```

### Tailscale subnet routing (run on Roman if remote access stops working)
```bash
ssh root@10.0.0.11
tailscale up --advertise-routes=10.0.0.0/24
```
