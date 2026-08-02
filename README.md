# Ashwing VIP — Booking & Hosting Guide

## Overview
Ashwing VIP is a single-server Node.js booking platform (Express) for the
Ashwing VIP chauffeur & car rental business (Zimbabwe + South Africa).

- Booking form → `/api/book`
- Client & provider receive **email** notifications (Gmail SMTP)
- Client & provider receive **WhatsApp** notifications (Baileys, free, no API key)
- Static site (HTML/CSS/JS) served by the same Express app

## Directory Layout
```
ashwing-vip/
├── index.html          # Main landing page + booking form
├── terms.html          # Terms & Conditions page
├── 404.html            # Error page
├── styles.css          # All styling
├── script.js           # Frontend form logic (combines phone + country code)
├── server.js           # Express app, /api/book, email sending
├── whatsapp-service.js # Baileys WhatsApp connection + send/receive
├── assets/             # Images (cars, flags)
├── wa_auth/            # WhatsApp session (DO NOT commit, must exist on server)
├── .env                # Secrets (DO NOT commit)
└── package.json        # npm scripts: start, dev
```

## Environment Variables (`.env`)
| Variable | Purpose | Example |
|---|---|---|
| `SMTP_HOST` | Email SMTP server | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP port | `587` |
| `SMTP_USER` | SMTP login | `norahtheceo@gmail.com` |
| `SMTP_PASS` | SMTP app password | `xxxx xxxx xxxx xxxx` |
| `FROM_EMAIL` | Sender address | `norahtheceo@gmail.com` |
| `FROM_NAME` | Sender display name | `Ashwing VIP Bookings` |
| `PROVIDER_EMAIL` | Provider notification inbox | `norahtheceo@gmail.com` |
| `IMAP_HOST` | Inbound mail host | `imap.gmail.com` |
| `IMAP_PORT` | Inbound mail port | `993` |
| `IMAP_USER` | Inbound mail login | `norahtheceo@gmail.com` |
| `IMAP_PASS` | Inbound mail password | same app password |
| `PORT` | Server port | `3001` |
| `NODE_ENV` | `production` | |

> **Gmail app passwords:** SMTP_PASS / IMAP_PASS must be an App Password from
> https://myaccount.google.com/apppasswords (2-Step Verification required).
> Never use your normal Gmail password.

## Booking Notification Flow
On `/api/book` the server sends 4 notifications:

1. **Client email** — confirmation to the booking form's email
2. **Provider email** — full details to `PROVIDER_EMAIL`
3. **Client WhatsApp** — confirmation to the booking form's phone number
4. **Provider WhatsApp** — full details to both `+263 77 575 2700` and `+27 65 846 8391`

The client phone number is normalized in `script.js`:
- Country code chosen in the form (🇿🇼 +263 or 🇿🇦 +27) + local number
- e.g. `0658468391` + `27` → `+2765848391`
- e.g. `0736102040` + `263` → `+263736102040`

The WhatsApp **sender** is the number linked on the server (currently the
South African number **+27 65 846 8391**). Client confirmations appear to
come from that number.

## WhatsApp Session (`wa_auth/`)
The first time the server starts with an empty `wa_auth/` folder, it prints a
**QR code in the terminal**. Scan it with the phone (WhatsApp → Linked
Devices → Link a Device) to link the account.

- The session is saved in `wa_auth/` and reused on restart.
- **You must copy the `wa_auth/` folder from this machine to the server** so
  the same linked device is reused (no re-scan needed).
- If the server moves to a new IP / datacenter, WhatsApp may force a re-scan —
  if so, delete `wa_auth/`, restart, and scan the new QR.

## Common Issues
| Symptom | Cause | Fix |
|---|---|---|
| No client WhatsApp | Wrong phone format | Ensure number is `+263...` / `+27...` international |
| `statusCode=405/401/515` in log | Stale session / conflict | Delete `wa_auth/`, restart, re-scan QR |
| `WhatsApp not ready` | Not linked yet | Scan QR, wait for `[WhatsApp] Ready.` in log |
| Booking `success:true` but no email | Bad SMTP creds | Check `.env`, test with a known address |
| Server crashed silently | Uncaught error | Handlers log to `server.log`; check with `pm2 logs` |

## Quick Start (local)
```bash
npm install
copy .env.example .env   # then fill in real values
npm start                # → http://localhost:3001
# scan the QR printed in the terminal to link WhatsApp
```
