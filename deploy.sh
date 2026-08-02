#!/usr/bin/env bash
# ============================================================
# Ashwing VIP — One-command server setup (Ubuntu 22.04/24.04)
# Run as root or with sudo:
#   sudo bash deploy.sh
#
# What it does:
#   1. Installs Node.js 20 LTS
#   2. Creates 2GB swap (VPS 1 has only 2GB RAM — highly recommended)
#   3. Clones the repo (or uses existing /var/www/ashwingvip)
#   4. Installs Linux dependencies (npm install — fresh, NOT the repo's
#      Windows node_modules; sharp + whatsapp-rust-bridge must build for Linux)
#   5. Creates .env from .env.example (you edit it)
#   6. Installs PM2, starts the app, enables auto-start on reboot
#   7. Installs Nginx + Certbot, configures HTTPS reverse proxy
#
# Requirements before running:
#   - VPS with Ubuntu 22.04/24.04 (domains.co.za Linux VPS 1 or higher)
#   - DNS A records for ashwingvip.com + www pointing at this server
#   - Ports 80/443 open
# ============================================================

set -euo pipefail

DOMAIN="ashwingvip.com"
APP_DIR="/var/www/ashwingvip"
APP_USER="${SUDO_USER:-$(whoami)}"

echo "==> [1/8] Installing Node.js 20 LTS"
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
node -v && npm -v

echo "==> [2/8] Creating 2GB swap (protects against OOM on VPS 1)"
if [ ! -f /swapfile ]; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo "Swap created."
else
  echo "Swapfile already exists — skipping."
fi

echo "==> [3/8] Installing git, nginx, certbot"
apt-get install -y git nginx certbot python3-certbot-nginx

echo "==> [4/8] Getting the code"
mkdir -p "$APP_DIR"
if [ -z "$(ls -A "$APP_DIR" | grep -v '^\.env$' | head -1)" ]; then
  echo "Cloning repo..."
  git clone https://github.com/Nhluvukow/AshwingVIP.git "$APP_DIR"
else
  echo "$APP_DIR already has files — using existing code."
fi

echo "==> [5/8] Installing dependencies (Linux builds)"
cd "$APP_DIR"
npm install --omit=dev

if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "!!! EDIT .env NOW: nano $APP_DIR/.env  (fill SMTP_PASS, IMAP_PASS, PROVIDER_EMAIL)"
  echo "    Then run: sudo bash deploy.sh --continue"
  exit 1
fi

echo "==> [6/8] WhatsApp session"
if [ ! -d wa_auth ] || [ -z "$(ls -A wa_auth 2>/dev/null)" ]; then
  echo "No wa_auth/ found."
  echo "  Option A (recommended): copy wa_auth/ from your PC to $APP_DIR/wa_auth/"
  echo "  Option B: skip — the server will print a QR on first start;"
  echo "            scan it with +27 65 846 8391 (WhatsApp > Linked Devices)."
fi

echo "==> [7/8] PM2 (auto-restart + survives reboot)"
npm install -g pm2
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"
sudo -u "$APP_USER" pm2 start server.js --name ashwingvip
sudo -u "$APP_USER" pm2 save
pm2 startup systemd -u "$APP_USER" --hp "/home/$APP_USER" | bash

echo "==> [8/8] Nginx reverse proxy + HTTPS"
cat > /etc/nginx/sites-available/ashwingvip <<EOF
server {
    listen 80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 86400;
    }
}
EOF
ln -sf /etc/nginx/sites-available/ashwingvip /etc/nginx/sites-enabled/ashwingvip
nginx -t
systemctl reload nginx

echo ""
echo "==> Requesting free SSL certificate (Certbot)"
echo "    Make sure DNS for $DOMAIN points to this server BEFORE continuing."
read -r -p "DNS pointed at this server? Press Enter to continue... " _unused
certbot --nginx -d "$DOMAIN" -d "www.$DOMAIN"

echo ""
echo "================================================"
echo "DONE. Verify:"
echo "  https://$DOMAIN        -> site loads"
echo "  pm2 status             -> ashwingvip online"
echo "  pm2 logs ashwingvip    -> [WhatsApp] Ready."
echo "  Submit a test booking  -> client + provider WhatsApp & email arrive"
echo "================================================"
