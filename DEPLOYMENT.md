# Ashwing VIP — Production Hosting Guide

Target: deploy to a Linux VPS (Ubuntu 22.04/24.04), run under **PM2**, expose
over HTTPS with **Nginx** on domain **ashwingvip.com**.

---

## 1. Server Requirements
- Ubuntu 20.04+ (recommended 22.04/24.04)
- Node.js **20.x LTS or newer** (project uses Node 24 features; 20+ is safe)
- 1 vCPU / 1GB RAM minimum
- Ports open: `80`, `443` (Nginx), `3001` (app, internal)

---

## 2. Upload the Project
From your PC, zip the project folder **excluding** secrets and junk, then upload:

```bash
# On your local PC — create a clean archive
cd C:\Users\tsets\Downloads
# (zip the norah folder contents, but EXCLUDE: node_modules, .env, server.log, whatsapp-qr.png)
```

Alternatively use `scp` / `rsync` / Git. On the server:

```bash
sudo apt update
sudo apt install -y git curl
sudo mkdir -p /var/www/ashwingvip
cd /var/www/ashwingvip
# upload files here (index.html, server.js, assets/, package.json, etc.)
```

---

## 3. Install Node.js
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
node -v   # should print v20.x or newer
```

---

## 4. Install Dependencies & Config
```bash
cd /var/www/ashwingvip
npm install --omit=dev
cp .env.example .env
nano .env   # fill in SMTP/IMAP credentials (same as local)
```
**Set `NODE_ENV=production` and `PORT=3001`.**

---

## 5. WhatsApp Session (IMPORTANT)
The `wa_auth/` folder contains the live WhatsApp session (linked to
**+27 65 846 8391**).

- **Copy `wa_auth/` from your PC to the server** so you don't need to re-scan.
  Place it at `/var/www/ashwingvip/wa_auth/`.
- If you skip this, the server will print a QR on first start — scan it with
  the SA number to link fresh.

---

## 6. Run with PM2 (auto-restart + survives reboot)
```bash
sudo npm install -g pm2

cd /var/www/ashwingvip
pm2 start server.js --name ashwingvip
pm2 save
pm2 startup   # follow the printed command to enable boot-start
```
Logs: `pm2 logs ashwingvip` | Status: `pm2 status`

---

## 7. Nginx Reverse Proxy + HTTPS (Certbot)
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
sudo nginx -t
sudo systemctl reload nginx

# Free SSL certificate
sudo certbot --nginx -d ashwingvip.com -d www.ashwingvip.com
```

> The WebSocket/`Upgrade` headers keep the WhatsApp connection alive through
> Nginx.

---

## 8. DNS
Point these records at your server's IP:
| Type | Name | Value |
|---|---|---|
| A | `@` | `<server-ip>` |
| A | `www` | `<server-ip>` |

---

## 9. Verify
- `https://ashwingvip.com` → site loads
- Submit a test booking → client email + client WhatsApp + provider email +
  provider WhatsApp (both numbers) all arrive
- `pm2 status` shows `online`
- `pm2 logs ashwingvip` shows `[WhatsApp] Ready.`

---

## 10. File Permissions / Notes
```bash
sudo chown -R $USER:$USER /var/www/ashwingvip
chmod 600 /var/www/ashwingvip/.env        # keep secrets private
# wa_auth/ must be writable by the node user
```

## Backup Checklist (before/after go-live)
- `wa_auth/` (WhatsApp session) — copy on every change of server
- `.env` (credentials)
- Source files

## Security Notes
- `express.static` serves the whole folder — `.env`, `wa_auth/`, `server.log`
  must NEVER be web-accessible. They're already excluded via `.gitignore`,
  but if you upload manually, delete `server.log` and `whatsapp-qr.png`
  from the server.
