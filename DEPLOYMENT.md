# Ashwing VIP — Production Hosting Guide (domains.co.za VPS)

Target: **domains.co.za Linux VPS** (VPS 1 or higher, Ubuntu 22.04/24.04),
run under **PM2**, exposed over HTTPS with **Nginx** on **ashwingvip.com**.

---

## 1. Recommended Plan & Cost (2026, VAT incl.)
| Item | First month | Ongoing |
|---|---|---|
| Domain `ashwingvip.com` | R269 | R299/yr renewal |
| Linux VPS 1 (1 vCPU, 2GB, 50GB) | R209 | R209/mo |
| SSL (Let's Encrypt, free) | R0 | R0 |
| **Total** | **R478** | **R209/mo + R299/yr** |

> VPS 1 is enough for this site. Create 2GB swap (deploy.sh does this) to
> protect against memory pressure. Upgrade to VPS 2 (R419/mo) anytime —
> domains.co.za allows instant in-place upgrades, no migration.

---

## 2. Fastest Path — One Command (recommended)
```bash
# SSH into the VPS as root or with sudo, then:
sudo bash -c "$(curl -fsSL https://raw.githubusercontent.com/Nhluvukow/AshwingVIP/main/deploy.sh)"
```
Or upload `deploy.sh` from this repo and run `sudo bash deploy.sh`.

The script: installs Node 20, creates swap, clones the repo, runs
`npm install` (Linux builds), creates `.env` (you fill it in), sets up PM2
with auto-start, configures Nginx, and requests the free SSL certificate.

> **IMPORTANT:** The script pauses after `.env` creation so you can fill in
> your SMTP/IMAP credentials. Run `nano /var/www/ashwingvip/.env` then
> re-run the script.

---

## 3. Manual Setup (if you prefer step by step)

### 3.1 Upload / clone the project
```bash
sudo apt update
sudo apt install -y git curl
sudo mkdir -p /var/www/ashwingvip && cd /var/www/ashwingvip
git clone https://github.com/Nhluvukow/AshwingVIP.git .
```

### 3.2 Install Node.js 20
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # v20.x
```

### 3.3 Install dependencies — ALWAYS fresh on the server
```bash
cd /var/www/ashwingvip
npm install --omit=dev
```
> **Never copy the `node_modules/` from Windows.** It contains
> Windows-compiled binaries (`sharp`, `whatsapp-rust-bridge`) that crash on
> Linux. `npm install` downloads the correct Linux builds automatically.
> The repo deliberately does NOT include `node_modules/`.

### 3.4 Config
```bash
cp .env.example .env
nano .env   # fill in SMTP_PASS, IMAP_PASS, PROVIDER_EMAIL (same values as local)
chmod 600 .env
```
Set `NODE_ENV=production`, `PORT=3001`.

### 3.5 WhatsApp session (IMPORTANT)
- **Copy `wa_auth/` from your PC to `/var/www/ashwingvip/wa_auth/`** so the
  SA number (+27 65 846 8391) stays linked — no re-scan needed.
  ```bash
  scp -r wa_auth root@<server-ip>:/var/www/ashwingvip/
  ```
- If skipped: on first start the server prints a QR in `pm2 logs`; scan it
  with the SA number (WhatsApp → Linked Devices → Link a Device).

### 3.6 Swap (recommended on VPS 1)
```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 3.7 PM2
```bash
sudo npm install -g pm2
cd /var/www/ashwingvip
pm2 start server.js --name ashwingvip
pm2 save
pm2 startup   # run the printed command to enable boot start
```

### 3.8 Nginx + HTTPS
```bash
sudo apt install -y nginx certbot python3-certbot-nginx
sudo nano /etc/nginx/sites-available/ashwingvip
```
```nginx
server {
    listen 80;
    server_name ashwingvip.com www.ashwingvip.com;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
```
```bash
sudo ln -s /etc/nginx/sites-available/ashwingvip /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d ashwingvip.com -d www.ashwingvip.com
```
> The `Upgrade`/`Connection` headers keep the WhatsApp connection alive
> through Nginx.

---

## 4. DNS (at domains.co.za)
| Type | Name | Value |
|---|---|---|
| A | `@` | `<server-ip>` |
| A | `www` | `<server-ip>` |

Allow up to 30 min for DNS to propagate before running Certbot.

---

## 5. Verify
- `https://ashwingvip.com` loads
- Submit a test booking → client email + client WhatsApp + provider email +
  provider WhatsApp (both +263 77 575 2700 and +27 65 846 8391) arrive
- `pm2 status` → `online`
- `pm2 logs ashwingvip` → `[WhatsApp] Ready.`

---

## 6. Updating the site after a change
```bash
cd /var/www/ashwingvip
git pull
npm install --omit=dev     # only if package.json changed
pm2 restart ashwingvip
```

## 7. Security Notes
- `express.static` serves the whole folder — never place `.env`, `wa_auth/`,
  `server.log`, `whatsapp-qr.png` somewhere web-accessible. They're already
  gitignored and never pushed.
- `chmod 600 .env`; keep `wa_auth/` backed up (copy it whenever you change
  servers — WhatsApp session = linked device).

## 8. Backup checklist
- `wa_auth/` (WhatsApp session)
- `.env` (credentials)
- Source files (already on GitHub)
