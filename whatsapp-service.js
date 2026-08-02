import { makeWASocket, useMultiFileAuthState, DisconnectReason } from '@whiskeysockets/baileys';
import qrcode from 'qrcode-terminal';
import pino from 'pino';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, 'wa_auth');

let sock = null;
let qrCallback = null;
let messageCallback = null;
let isReady = false;
let lastQR = null;
let reconnectTimer = null;
let active = false;
const receivedMessages = [];

const logger = pino({ level: 'silent' });

export async function initWhatsApp(onQR, onMessage) {
  qrCallback = onQR;
  messageCallback = onMessage;
  await connect();
}

export function getQRHandler() {
  return () => lastQR;
}

export function getStatus() {
  return {
    connected: sock?.user !== undefined,
    ready: isReady,
    user: sock?.user ? { id: sock.user.id, name: sock.user.name } : null,
  };
}

async function connect() {
  if (active) return;
  active = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (sock) {
    sock.end(undefined);
    sock.ws?.close();
  }

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_DIR);

  sock = makeWASocket({
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['Ashwing VIP', 'Chrome', '120.0'],
    syncFullHistory: false,
  });

  const thisSock = sock;

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', (update) => {
    if (sock !== thisSock) return;

    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      lastQR = qr;
      qrcode.generate(qr, { small: true });
      console.log('[WhatsApp] Scan the QR code above with your phone to link WhatsApp.');
      if (qrCallback) qrCallback(qr);
    }

    if (connection === 'open') {
      isReady = true;
      lastQR = null;
      console.log('[WhatsApp] Connected as', sock.user?.id);
      if (qrCallback) qrCallback(null);
    }

    if (connection === 'close') {
      isReady = false;
      active = false;
      const statusCode = lastDisconnect?.error?.output?.statusCode;
      console.log(`[WhatsApp] Connection closed. statusCode=${statusCode} message=${lastDisconnect?.error?.message || 'unknown'}`);
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect) {
        console.log('[WhatsApp] Disconnected. Reconnecting in 5s...');
        reconnectTimer = setTimeout(connect, 5000);
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages }) => {
    if (sock !== thisSock) return;
    for (const msg of messages) {
      if (!msg.key.fromMe && msg.message && messageCallback) {
        const text = msg.message.conversation ||
          msg.message.extendedTextMessage?.text ||
          '';
        const entry = {
          from: msg.key.remoteJid,
          text,
          timestamp: msg.messageTimestamp,
        };
        receivedMessages.unshift(entry);
        messageCallback(entry);
      }
    }
  });
}

function waitForReady(timeout = 8000) {
  return new Promise((resolve, reject) => {
    if (isReady && sock?.user) return resolve();
    const start = Date.now();
    const check = setInterval(() => {
      if (isReady && sock?.user) {
        clearInterval(check);
        resolve();
      }
      if (Date.now() - start > timeout) {
        clearInterval(check);
        reject(new Error('WhatsApp not ready'));
      }
    }, 500);
  });
}

export async function sendWhatsApp(to, text) {
  await waitForReady();
  let clean = String(to).replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = clean.slice(1);
  }
  const jid = clean.includes('@s.whatsapp.net') ? clean : `${clean}@s.whatsapp.net`;

  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (!sock) throw new Error('Socket not available');
      if (sock.ws?.isOpen !== true) {
        await new Promise(r => setTimeout(r, 2000));
        lastErr = new Error('Socket not open (isOpen=' + (sock.ws?.isOpen ?? 'n/a') + ')');
        continue;
      }
      await sock.sendMessage(jid, { text });
      return { success: true, to: jid };
    } catch (err) {
      lastErr = err;
      if (err?.message?.includes('Connection Closed') && attempt < 2) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('WhatsApp send failed');
}

export async function getReceivedMessages(limit = 10) {
  if (!sock || !sock.user) return [];
  return receivedMessages.slice(0, Math.min(limit, 50));
}
