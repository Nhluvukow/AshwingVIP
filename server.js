import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import nodemailer from 'nodemailer';
import imaps from 'imap-simple';
import { simpleParser } from 'mailparser';

import QRCode from 'qrcode';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  initWhatsApp,
  sendWhatsApp,
  getStatus as waGetStatus,
  getQRHandler,
  getReceivedMessages,
} from './whatsapp-service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const PORT = process.env.PORT || 3001;

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const serviceLabels = {
  shuttle: 'Shuttle Service',
  chauffeur: 'Chauffeur Service',
  'airport-transfer': 'Airport Transfer',
  'car-rental': 'Car Rental',
};

function emailShell(innerHtml, { title = 'Booking Confirmation — Ashwing VIP', greeting = null, cta = null } = {}) {
  return `
      <div style="font-family:sans-serif;max-width:600px;margin:0 auto;background:#121212;color:#ebebeb;padding:40px;border-radius:8px">
        <h1 style="font-size:26px;margin:0 0 4px;letter-spacing:2px">ASHWING<span style="color:#d4a84b">VIP</span></h1>
        <p style="color:#999;font-size:13px;margin:0 0 24px">Premium Chauffeur & Car Rental Services</p>
        <p style="color:#25d366;font-size:18px;font-weight:bold;margin:0 0 16px">${title}</p>
        ${greeting ? `<p style="margin:0 0 16px">${greeting}</p>` : ''}
        <table style="width:100%;border-collapse:collapse;margin:0 0 24px">${innerHtml}</table>
        ${cta ? `<p style="color:#999;font-size:14px;margin:0 0 24px">${cta}</p>` : ''}
        <hr style="border:none;border-top:1px solid #333;margin:24px 0" />
        <p style="color:#666;font-size:12px">Ashwing VIP — Premium Chauffeur & Car Rental Services</p>
      </div>
    `;
}

function row(label, value) {
  return value
    ? `<tr><td style="padding:8px 12px;border:1px solid #333;color:#999">${label}</td><td style="padding:8px 12px;border:1px solid #333">${value}</td></tr>`
    : '';
}

async function sendClientEmail({ name, email, service, date, time, pickup, dropoff, passengers, carGroup }) {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Ashwing VIP'}" <${process.env.FROM_EMAIL || 'noreply@ashwingvip.com'}>`,
    to: email,
    subject: 'Booking Confirmation — Ashwing VIP',
    html: emailShell([
      row('Service', `${serviceLabels[service] || service}`),
      row('Date', date),
      row('Time', time),
      row('Pickup', pickup),
      row('Drop-Off', dropoff),
      row('Passengers', passengers),
      row('Car Group', carGroup),
    ].join(''), {
      greeting: `Dear ${name},`,
      cta: `If you have any questions, call us at <a href="tel:+263775752700" style="color:#d4a84b">+263 77 575 2700</a>.`,
    }),
  });
}

async function sendProviderEmail({ name, email, phone, service, date, time, pickup, dropoff, passengers, carGroup, message }) {
  await transporter.sendMail({
    from: `"${process.env.FROM_NAME || 'Ashwing VIP'}" <${process.env.FROM_EMAIL || 'noreply@ashwingvip.com'}>`,
    to: process.env.PROVIDER_EMAIL,
    subject: `New Booking — ${name}`,
    html: emailShell([
      row('Name', name),
      row('Email', email),
      row('Phone', phone),
      row('Service', `${serviceLabels[service] || service}`),
      row('Date', date),
      row('Time', time),
      row('Pickup', pickup),
      row('Drop-Off', dropoff),
      row('Passengers', passengers),
      row('Car Group', carGroup),
      row('Message', message),
    ].join(''), {
      title: 'New Booking Received',
    }),
  });
}

function formatBookingText({ name, email, phone, service, date, time, pickup, dropoff, passengers, carGroup, message }) {
  return [
    `*New Booking — Ashwing VIP*`,
    ``,
    `*Name:* ${name}`,
    `*Email:* ${email}`,
    `*Phone:* ${phone}`,
    `*Service:* ${serviceLabels[service] || service}`,
    `*Date:* ${date}`,
    time ? `*Time:* ${time}` : null,
    pickup ? `*Pickup:* ${pickup}` : null,
    dropoff ? `*Drop-Off:* ${dropoff}` : null,
    passengers ? `*Passengers:* ${passengers}` : null,
    carGroup ? `*Car Group:* ${carGroup}` : null,
    message ? `*Message:* ${message}` : null,
  ].filter(Boolean).join('\n');
}

async function sendClientWhatsApp({ name, phone, service, date, time, pickup, dropoff }) {
  const text = [
    `Thank you for booking with *Ashwing VIP*!`,
    ``,
    `*Service:* ${serviceLabels[service] || service}`,
    `*Date:* ${date}`,
    time ? `*Time:* ${time}` : null,
    pickup ? `*Pickup:* ${pickup}` : null,
    dropoff ? `*Drop-Off:* ${dropoff}` : null,
    ``,
    `We will contact you shortly to confirm your reservation.`,
    `Call us: +263 77 575 2700`,
  ].filter(Boolean).join('\n');
  await sendWhatsApp(phone, text);
}

async function sendProviderWhatsApp({ name, email, phone, service, date, time, pickup, dropoff, passengers, carGroup, message }, to) {
  const body = formatBookingText({ name, email, phone, service, date, time, pickup, dropoff, passengers, carGroup, message });
  await sendWhatsApp(to, body);
}

async function fetchEmails(config = {}, limit = 10) {
  const imapConfig = {
    imap: {
      user: process.env.IMAP_USER || process.env.SMTP_USER,
      password: process.env.IMAP_PASS || process.env.SMTP_PASS,
      host: process.env.IMAP_HOST || 'imap.gmail.com',
      port: parseInt(process.env.IMAP_PORT || '993'),
      tls: true,
      tlsOptions: { rejectUnauthorized: false },
    },
  };

  if (!imapConfig.imap.user || !imapConfig.imap.password) return [];

  const connection = await imaps.connect(imapConfig);
  await connection.openBox('INBOX');

  const searchCriteria = ['UNSEEN'];
  const fetchOptions = { bodies: ['HEADER', ''], markSeen: false };

  const messages = await connection.search(searchCriteria, fetchOptions);
  const results = [];

  for (let i = 0; i < Math.min(messages.length, limit); i++) {
    const raw = messages[i].parts.find(p => p.which === '');
    if (raw) {
      const parsed = await simpleParser(raw.body);
      results.push({
        from: parsed.from?.text || '',
        subject: parsed.subject || '',
        text: parsed.text?.substring(0, 1000) || '',
        date: parsed.date,
      });
    }
  }

  connection.end();
  return results;
}

app.post('/api/book', async (req, res) => {
  try {
    const { name, email, phone, service, date, time, pickup, dropoff, passengers, carGroup, message } = req.body;

    if (!name || !email || !phone || !service || !date) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const booking = { name, email, phone, service, date, time, pickup, dropoff, passengers, carGroup, message };
    const errors = [];
    const smtpOk = process.env.SMTP_USER && process.env.SMTP_PASS;
    const waOk = waGetStatus().connected && waGetStatus().ready;

    if (smtpOk) {
      try {
        await sendClientEmail(booking);
      } catch (err) {
        errors.push(`Client email failed: ${err.message}`);
      }
      try {
        await sendProviderEmail(booking);
      } catch (err) {
        errors.push(`Provider email failed: ${err.message}`);
      }
    }

    const waNumbers = ['+263775752700', '+27658468391'];

    if (waOk) {
      try {
        await sendClientWhatsApp(booking);
      } catch (err) {
        errors.push(`Client WhatsApp failed: ${err.message}`);
      }
      for (const waTo of waNumbers) {
        try {
          await sendProviderWhatsApp(booking, waTo);
        } catch (err) {
          errors.push(`Provider WhatsApp (${waTo}) failed: ${err.message}`);
        }
      }
    }

    res.json({
      success: true,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    console.error('[API /book] error:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/send', async (req, res) => {
  try {
    const { channel, to, subject, text } = req.body;

    if (!channel || !to || !text) {
      return res.status(400).json({ error: 'channel, to, and text are required' });
    }

    if (channel === 'whatsapp') {
      const result = await sendWhatsApp(to, text);
      return res.json({ success: true, channel: 'whatsapp', ...result });
    }

    if (channel === 'email') {
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        return res.status(400).json({ error: 'SMTP not configured' });
      }
      await transporter.sendMail({
        from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
        to,
        subject: subject || '(No subject)',
        text,
      });
      return res.json({ success: true, channel: 'email', to });
    }

    res.status(400).json({ error: 'channel must be "whatsapp" or "email"' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/whatsapp', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const messages = await getReceivedMessages(Math.min(limit, 50));
    res.json({ messages });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/messages/email', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const emails = await fetchEmails({}, Math.min(limit, 50));
    res.json({ emails });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/whatsapp/status', (req, res) => {
  res.json(waGetStatus());
});

app.get('/api/whatsapp/qr', (req, res) => {
  const handler = getQRHandler();
  if (!handler) {
    return res.json({ qr: null, message: 'QR handler not ready' });
  }
  const qr = handler();
  res.json({ qr: qr || null });
});

app.get('/api/whatsapp/qr-image', async (req, res) => {
  const handler = getQRHandler();
  if (!handler) {
    return res.status(404).send('QR not available');
  }
  const qr = handler();
  if (!qr) {
    return res.status(404).send('Already connected or QR expired');
  }
  res.setHeader('Content-Type', 'image/png');
  QRCode.toFileStream(res, qr, { type: 'png', width: 400, margin: 2 });
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

process.on('unhandledRejection', (err) => {
  console.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  initWhatsApp(
    (qr) => {
      if (qr) {
        console.log('[WhatsApp] Scan QR to connect. GET /api/whatsapp/qr to retrieve it.');
      } else {
        console.log('[WhatsApp] Ready.');
      }
    },
    (msg) => {
      console.log(`[WhatsApp] Received from ${msg.from}: ${msg.text}`);
    }
  );
});
