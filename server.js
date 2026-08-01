/**
 * server.js — Custom Node.js server
 *
 * Combines:
 *  1. Next.js request handler (SSR / static / API routes)
 *  2. WebSocket signaling server on path /ws
 *
 * The signaling server NEVER touches file bytes.
 * It only introduces two browsers so WebRTC can take over.
 *
 * Run:
 *   npm run dev          (development)
 *   npm run build && npm start   (production)
 */

'use strict';

const { createServer } = require('http');
const { parse }        = require('url');
const next             = require('next');
const { WebSocketServer, WebSocket } = require('ws');
const crypto           = require('crypto');

// ─── Config ────────────────────────────────────────────────────────────────

const dev  = process.env.NODE_ENV !== 'production';
const port = parseInt(process.env.PORT || '3000', 10);

const CODE_CHARS          = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
const CODE_LENGTH         = 6;
const CODE_TTL_MS         = 5 * 60 * 1000;   // 5 min
const RATE_LIMIT_MAX      = 10;               // codes per window per IP
const RATE_LIMIT_WINDOW   = 60 * 1000;        // 1 min

// ─── State ──────────────────────────────────────────────────────────────────

/**
 * rooms: Map<code, { sender: WebSocket|null, receiver: WebSocket|null, createdAt: number }>
 */
const rooms      = new Map();

/**
 * rateLimits: Map<ip, { count: number, resetAt: number }>
 */
const rateLimits = new Map();

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateCode() {
  const bytes = crypto.randomBytes(CODE_LENGTH);
  let code = '';
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += CODE_CHARS[bytes[i] % CODE_CHARS.length];
  }
  return code;
}

function checkRateLimit(ip) {
  const now = Date.now();
  let entry = rateLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + RATE_LIMIT_WINDOW };
    rateLimits.set(ip, entry);
  }
  if (entry.count >= RATE_LIMIT_MAX) return false;
  entry.count++;
  return true;
}

function safeSend(ws, payload) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

// ─── Periodic cleanup ───────────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();

  // Expire old rooms
  for (const [code, room] of rooms) {
    if (now - room.createdAt > CODE_TTL_MS) {
      safeSend(room.sender,   { type: 'error', message: 'Room expired (5 min time limit).' });
      safeSend(room.receiver, { type: 'error', message: 'Room expired (5 min time limit).' });
      rooms.delete(code);
    }
  }

  // Prune stale rate-limit windows
  for (const [ip, entry] of rateLimits) {
    if (now > entry.resetAt) rateLimits.delete(ip);
  }
}, 60_000);

// ─── Message handler ────────────────────────────────────────────────────────

function handleMessage(ws, raw, ip) {
  let msg;
  try {
    msg = JSON.parse(raw.toString());
  } catch {
    safeSend(ws, { type: 'error', message: 'Invalid JSON.' });
    return;
  }

  switch (msg.type) {

    // ── Sender: create a new room ──────────────────────────────────────────
    case 'create-room': {
      if (!checkRateLimit(ip)) {
        safeSend(ws, { type: 'error', message: 'Rate limit exceeded — try again in a minute.' });
        return;
      }

      // Avoid collisions
      let code;
      let attempts = 0;
      do { code = generateCode(); attempts++; }
      while (rooms.has(code) && attempts < 20);

      if (rooms.has(code)) {
        safeSend(ws, { type: 'error', message: 'Server busy — please retry.' });
        return;
      }

      ws.roomCode = code;
      ws.roomRole = 'sender';
      rooms.set(code, { sender: ws, receiver: null, createdAt: Date.now() });
      safeSend(ws, { type: 'room-created', code });
      break;
    }

    // ── Receiver: join an existing room ────────────────────────────────────
    case 'join-room': {
      const code = String(msg.code || '').toUpperCase().trim();
      if (code.length !== CODE_LENGTH) {
        safeSend(ws, { type: 'error', message: 'Code must be 6 characters.' });
        return;
      }

      const room = rooms.get(code);
      if (!room) {
        safeSend(ws, { type: 'error', message: 'Code not found or expired.' });
        return;
      }
      if (!room.sender || room.sender.readyState !== WebSocket.OPEN) {
        rooms.delete(code);
        safeSend(ws, { type: 'error', message: 'Sender has already disconnected.' });
        return;
      }
      if (room.receiver) {
        safeSend(ws, { type: 'error', message: 'A receiver has already joined this transfer.' });
        return;
      }

      ws.roomCode = code;
      ws.roomRole = 'receiver';
      room.receiver = ws;

      safeSend(ws,          { type: 'room-joined',     code });
      safeSend(room.sender, { type: 'receiver-joined'       });
      break;
    }

    // ── WebRTC signaling relay ─────────────────────────────────────────────
    case 'offer':
    case 'answer':
    case 'ice-candidate': {
      const room = rooms.get(ws.roomCode);
      if (!room) return;
      const peer = ws.roomRole === 'sender' ? room.receiver : room.sender;
      safeSend(peer, msg);   // relay as-is
      break;
    }

    default:
      safeSend(ws, { type: 'error', message: `Unknown type: ${msg.type}` });
  }
}

// ─── Boot ────────────────────────────────────────────────────────────────────

const app    = next({ dev });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    handle(req, res, parse(req.url, true));
  });

  // Attach WS server to the same HTTP server on path /ws
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const ip = (
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
      req.socket.remoteAddress ||
      'unknown'
    );

    ws.isAlive  = true;
    ws.roomCode = null;
    ws.roomRole = null;

    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', (data) => handleMessage(ws, data, ip));

    ws.on('close', () => {
      const code = ws.roomCode;
      if (!code || !rooms.has(code)) return;

      const room = rooms.get(code);
      const peer = ws.roomRole === 'sender' ? room.receiver : room.sender;
      safeSend(peer, { type: 'peer-disconnected' });

      if (ws.roomRole === 'sender') room.sender   = null;
      else                          room.receiver  = null;

      if (!room.sender && !room.receiver) rooms.delete(code);
    });
  });

  // Heartbeat — terminate zombie connections
  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (!ws.isAlive) { ws.terminate(); continue; }
      ws.isAlive = false;
      ws.ping();
    }
  }, 30_000);

  wss.on('close', () => clearInterval(heartbeat));

  httpServer.listen(port, () => {
    console.log(`\n  🚀  P2P Share  →  http://localhost:${port}\n`);
    if (dev) console.log('  Running in DEVELOPMENT mode\n');
  });
});
