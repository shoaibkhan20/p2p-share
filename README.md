# P2P Share

> Instant browser-to-browser file transfer via WebRTC.  
> No server storage · No installation · End-to-end DTLS encrypted

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start the development server
npm run dev

# 3. Open http://localhost:3000
```

For production:

```bash
npm run build
npm start
```

---

## How It Works

```
Browser A (Sender)              Signaling Server (Node.js/WS)            Browser B (Receiver)
        |                                    |                                    |
        |── create-room ─────────────────────▶|                                    |
        |◀─ room-created (code: "ABC123") ───|                                    |
        |                                    |◀───────────────── join-room ────────|
        |◀─ receiver-joined ─────────────────|──────────────── room-joined ───────▶|
        |                                    |                                    |
        |════════════════ WebRTC SDP offer / answer / ICE via signaling ══════════|
        |                                    |                                    |
        |◀══════════════════════ RTCDataChannel (DTLS encrypted) ════════════════▶|
        |                                    |                                    |
        |── metadata { name, size } ──────────────────────────────────────────────▶|
        |◀─ receiver-ready ───────────────────────────────────────────────────────|
        |── [binary chunks 32 KB each] ───────────────────────────────────────────▶|
        |── transfer-complete ─────────────────────────────────────────────────────▶|
```

The signaling server **only introduces the two browsers**. File bytes flow
exclusively over the WebRTC data channel — the server never touches them.

---

## Architecture

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend | Next.js 14 (App Router) | SSR landing page + client flow components |
| Signaling | Node.js + `ws` WebSocket | Pair browsers, relay SDP/ICE |
| Transfer | WebRTC `RTCDataChannel` | Encrypted peer-to-peer file streaming |
| Streaming | File System Access API | Write chunks to disk in real time (Chrome/Edge) |
| Fallback | `Blob` + `createObjectURL` | Buffer in memory → download (Firefox/Safari) |

---

## TURN Server (Production Recommended)

Without TURN, roughly **10–15 % of connections** fail behind symmetric NAT or
strict corporate firewalls. Configure a TURN server in `.env.local`:

```bash
cp .env.example .env.local
# then edit .env.local:
NEXT_PUBLIC_TURN_URL=turn:your-server.com:3478
NEXT_PUBLIC_TURN_USERNAME=username
NEXT_PUBLIC_TURN_CREDENTIAL=password
```

**Free TURN options**
- [Metered.ca Open Relay](https://www.metered.ca/tools/openrelay/) — free tier
- [Self-hosted coturn](https://github.com/coturn/coturn) — full control

---

## Deployment

This project uses a **custom Node.js server** (`server.js`) to co-locate the
Next.js handler and the WebSocket signaling server. It runs anywhere that
supports a long-lived Node process:

| Platform | Notes |
|----------|-------|
| **Railway** | `npm run build && npm start` — detects PORT automatically |
| **Render** | Web Service, start command: `npm start` |
| **Fly.io** | `fly launch` — set `PORT` in fly.toml |
| **VPS (DigitalOcean/Hetzner)** | `pm2 start npm -- start` |
| **Vercel** | ❌ Not compatible (serverless, no long-lived WebSocket) |

> HTTPS is required in production for WebRTC and the File System Access API.
> All platforms above provide TLS automatically.

---

## Browser Support

| Feature | Chrome/Edge | Firefox | Safari |
|---------|-------------|---------|--------|
| WebRTC data channel | ✅ | ✅ | ✅ |
| Stream to disk (FSA) | ✅ | ❌ | ❌ |
| Memory buffer fallback | ✅ | ✅ | ✅ |

On Firefox and Safari the file is buffered in memory and downloaded automatically
when the transfer completes. For very large files (> available RAM), Chrome with
the File System Access API is recommended.

---

## Security

- **DTLS encryption** — all WebRTC data channels are encrypted by default (RFC 5764).
- **Single-use codes** — each 6-character code can only pair one sender + one receiver.
- **Short-lived codes** — unused codes expire after 5 minutes.
- **Rate limiting** — max 10 code generations per IP per minute.
- **No storage** — the signaling server never buffers any file data.

---

## Project Structure

```
p2p-share/
├── server.js                  Custom Node + WebSocket signaling server
├── next.config.js
├── package.json
├── .env.example               Copy to .env.local and fill in TURN details
│
├── lib/
│   └── rtc-config.js          RTCConfiguration (STUN + optional TURN)
│
├── app/
│   ├── layout.js              Root layout + global metadata
│   ├── globals.css            All styles (dark theme)
│   ├── page.js                SEO landing page (server component)
│   ├── send/page.js           /send route wrapper
│   └── receive/page.js        /receive route wrapper
│
└── components/
    ├── SendFlow.jsx            Sender client component
    ├── ReceiveFlow.jsx         Receiver client component
    └── ProgressBar.jsx         Shared progress UI
```
