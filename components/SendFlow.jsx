'use client';

/**
 * SendFlow — Sender side of a P2P file transfer
 *
 * State machine:
 *   idle → creating → waiting → peer-connected → selecting → transferring → complete
 *                                                                         ↘ error (any step)
 *
 * Protocol (over data channel):
 *   Sender → Receiver :  { type:'metadata', name, size, mimeType }
 *   Receiver → Sender :  { type:'receiver-ready' }
 *   Sender → Receiver :  [binary ArrayBuffer chunks…]
 *   Sender → Receiver :  { type:'transfer-complete' }
 */

import { useState, useRef, useEffect } from 'react';
import ProgressBar from './ProgressBar';
import { getRTCConfig } from '../lib/rtc-config';

const CHUNK_SIZE    = 32  * 1024;  // 32 KB per chunk
const BUFFER_HIGH   = 256 * 1024;  // pause if bufferedAmount > 256 KB
const BUFFER_LOW    = 64  * 1024;  // resume when bufferedAmount drops below 64 KB

export default function SendFlow() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [status,      setStatus]      = useState('idle');
  const [code,        setCode]        = useState('');
  const [copied,      setCopied]      = useState(false);
  const [fileName,    setFileName]    = useState('');
  const [fileSize,    setFileSize]    = useState(0);
  const [transferred, setTransferred] = useState(0);
  const [speed,       setSpeed]       = useState(0);
  const [eta,         setEta]         = useState(Infinity);
  const [error,       setError]       = useState('');
  const [queueCount,  setQueueCount]  = useState(0);

  // ── Refs (mutable, never cause re-render) ─────────────────────────────────
  const wsRef                = useRef(null);
  const pcRef                = useRef(null);
  const dcRef                = useRef(null);
  const iceCandidateQueue    = useRef([]);
  const remoteDescSet        = useRef(false);
  const startTime            = useRef(0);
  const lastSpeedTime        = useRef(0);
  const lastSpeedBytes       = useRef(0);
  const isComplete           = useRef(false);   // guards against spurious errors after done
  const fileQueueRef         = useRef([]);
  const isSendingBatchRef    = useRef(false);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  function closePeerConnection() {
    try { dcRef.current?.close();  } catch {}
    try { pcRef.current?.close();  } catch {}
    dcRef.current = null;
    pcRef.current = null;
    iceCandidateQueue.current = [];
    remoteDescSet.current     = false;
  }

  function closeSignalingConnection() {
    try { wsRef.current?.close();  } catch {}
    wsRef.current = null;
  }

  function closeAll() {
    closePeerConnection();
    closeSignalingConnection();
  }

  function fail(msg) {
    if (isComplete.current) return;   // ignore errors after a successful transfer
    setError(msg);
    setStatus('error');
  }

  function reset() {
    isComplete.current = false;
    fileQueueRef.current = [];
    isSendingBatchRef.current = false;
    setQueueCount(0);
    setFileName('');
    setFileSize(0);
    setTransferred(0);
    setSpeed(0);
    setEta(Infinity);
    setError('');
    setStatus(dcRef.current?.readyState === 'open' ? 'selecting' : 'idle');
  }

  function closeConnection() {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: 'close-connection' }));
    }
    closePeerConnection();
    closeSignalingConnection();
    fileQueueRef.current = [];
    isSendingBatchRef.current = false;
    setQueueCount(0);
    setStatus('idle');
    setCode('');
    setCopied(false);
    setFileName('');
    setFileSize(0);
    setTransferred(0);
    setSpeed(0);
    setEta(Infinity);
    setError('');
  }

  // Unmount safety
  useEffect(() => () => closeAll(), []);

  // ── WebRTC peer connection setup ──────────────────────────────────────────

  async function setupPeerConnection() {
    const pc = new RTCPeerConnection(getRTCConfig());
    pcRef.current = pc;

    // Create the data channel on the sender side
    const dc = pc.createDataChannel('transfer', { ordered: true });
    dcRef.current = dc;

    dc.onopen = () => {
      setStatus('selecting');
    };

    dc.onerror = (e) => {
      fail('Data channel error: ' + (e.error?.message || 'unknown'));
    };

    pc.onicecandidate = ({ candidate }) => {
      if (candidate) {
        wsRef.current?.send(JSON.stringify({ type: 'ice-candidate', candidate }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      const s = pc.iceConnectionState;
      if (s === 'failed')       fail('P2P connection failed. Try again; a TURN server helps on restrictive networks.');
      if (s === 'disconnected') fail('Connection was lost during transfer.');
    };

    // Create and send the SDP offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    wsRef.current?.send(JSON.stringify({ type: 'offer', sdp: pc.localDescription }));
  }

  // ── Signaling connection ──────────────────────────────────────────────────

  function startSend() {
    setStatus('creating');
    isComplete.current = false;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws    = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'create-room' }));
    };

    ws.onmessage = async ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      switch (msg.type) {

        case 'room-created':
          setCode(msg.code);
          setStatus('waiting');
          break;

        case 'receiver-joined':
          setStatus('peer-connected');
          try {
            await setupPeerConnection();
          } catch (e) {
            fail('Failed to set up P2P connection: ' + e.message);
          }
          break;

        case 'answer':
          if (!pcRef.current) break;
          try {
            await pcRef.current.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            remoteDescSet.current = true;
            // Drain any ICE candidates that arrived early
            for (const c of iceCandidateQueue.current) {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(c));
            }
            iceCandidateQueue.current = [];
          } catch (e) {
            fail('SDP error: ' + e.message);
          }
          break;

        case 'ice-candidate':
          if (remoteDescSet.current && pcRef.current) {
            try {
              await pcRef.current.addIceCandidate(new RTCIceCandidate(msg.candidate));
            } catch {}
          } else {
            iceCandidateQueue.current.push(msg.candidate);
          }
          break;

        case 'peer-disconnected':
          fail('Receiver disconnected before the transfer could complete.');
          break;

        case 'connection-closed':
          closePeerConnection();
          closeSignalingConnection();
          setCode('');
          setCopied(false);
          setFileName('');
          setFileSize(0);
          setTransferred(0);
          setSpeed(0);
          setEta(Infinity);
          setError('');
          setStatus('idle');
          break;

        case 'error':
          fail(msg.message);
          break;
      }
    };

    ws.onerror = () => fail('Could not connect to the signaling server.');

    ws.onclose = () => {
      // Unexpected close while still active
      if (!isComplete.current && status !== 'error') {
        setStatus(prev => {
          if (prev !== 'complete' && prev !== 'error') {
            setError('Signaling connection closed unexpectedly.');
            return 'error';
          }
          return prev;
        });
      }
    };
  }

  // ── File transfer ─────────────────────────────────────────────────────────

  async function sendFile(file, { resetProgress = false } = {}) {
    const dc = dcRef.current;
    if (!dc || dc.readyState !== 'open') { fail('Data channel not ready.'); return; }

    isComplete.current = false;

    if (resetProgress) {
      setFileName(file.name);
      setFileSize(file.size);
      setTransferred(0);
      setStatus('transferring');
    }

    const transferId = `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(16).slice(2)}`;

    // 1 ─ Set up handler FIRST so we don't miss receiver-ready
    const receiverReadyPromise = new Promise((resolve, reject) => {
      const prev = dc.onmessage;

      dc.onmessage = ({ data }) => {
        if (typeof data === 'string') {
          let m;
          try { m = JSON.parse(data); } catch { return; }
          if (m.type === 'receiver-ready' && m.transferId === transferId) {
            dc.onmessage = prev;
            resolve();
          } else if (m.type === 'error' && m.transferId === transferId) {
            dc.onmessage = prev;
            reject(new Error(m.message));
          }
        }
      };

      // Safety timeout — 90 seconds for user to click "Accept"
      setTimeout(() => {
        dc.onmessage = prev;
        reject(new Error('Receiver did not respond within 90 s'));
      }, 90_000);
    });

    // 2 ─ Send metadata so receiver can show the file details
    dc.send(JSON.stringify({
      type:      'metadata',
      transferId,
      name:      file.name,
      size:      file.size,
      mimeType:  file.type || 'application/octet-stream',
    }));

    // 3 ─ Wait for receiver to click "Accept"
    try {
      await receiverReadyPromise;
    } catch (e) {
      fail(e.message);
      return;
    }

    // 4 ─ Stream chunks
    startTime.current      = Date.now();
    lastSpeedTime.current  = Date.now();
    lastSpeedBytes.current = 0;
    let offset = 0;

    while (offset < file.size) {
      if (dc.readyState !== 'open') break;

      // Backpressure — pause if the send buffer is full
      if (dc.bufferedAmount > BUFFER_HIGH) {
        await new Promise((resolve) => {
          dc.bufferedAmountLowThreshold = BUFFER_LOW;
          dc.onbufferedamountlow = () => {
            dc.onbufferedamountlow = null;
            resolve();
          };
        });
      }

      if (dc.readyState !== 'open') break;

      // Read and send one chunk
      const end    = Math.min(offset + CHUNK_SIZE, file.size);
      const chunk  = await file.slice(offset, end).arrayBuffer();
      dc.send(chunk);
      offset += chunk.byteLength;

      // Update progress UI (throttled to every 150 ms)
      const now = Date.now();
      setTransferred(offset);
      if (now - lastSpeedTime.current > 150) {
        const dt     = (now - lastSpeedTime.current) / 1000;
        const db     = offset - lastSpeedBytes.current;
        const spd    = db / dt;
        const remain = file.size - offset;
        setSpeed(spd);
        setEta(spd > 0 ? remain / spd : Infinity);
        lastSpeedTime.current  = now;
        lastSpeedBytes.current = offset;
      }
    }

    // 5 ─ Signal completion
    if (dc.readyState === 'open') {
      dc.send(JSON.stringify({ type: 'transfer-complete', transferId }));
    }

    setTransferred(file.size);
    setStatus('selecting');
  }

  async function processQueue() {
    if (isSendingBatchRef.current || fileQueueRef.current.length === 0) return;
    isSendingBatchRef.current = true;

    try {
      while (fileQueueRef.current.length > 0) {
        const file = fileQueueRef.current.shift();
        if (!file) continue;
        await sendFile(file, { resetProgress: true });
        setQueueCount(fileQueueRef.current.length);
      }

      isComplete.current = true;
      setQueueCount(0);
      setStatus('selecting');
    } catch (err) {
      fail(err.message);
    } finally {
      isSendingBatchRef.current = false;
    }
  }

  function onFileChange(e) {
    const selectedFiles = Array.from(e.target.files || []);
    if (!selectedFiles.length) return;

    e.target.value = '';
    const files = selectedFiles.filter(Boolean);
    if (files.length === 0) return;

    if (dcRef.current?.readyState !== 'open') {
      fail('Data channel not ready.');
      return;
    }

    fileQueueRef.current.push(...files);
    setQueueCount(fileQueueRef.current.length);
    setStatus('transferring');
    processQueue().catch(err => fail(err.message));
  }

  function copyCode() {
    navigator.clipboard?.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flow-card">

      {/* ── 1. Idle ── */}
      {status === 'idle' && (
        <div className="flow-step">
          <div className="flow-icon">📤</div>
          <h2 className="flow-title">Send a File</h2>
          <p className="flow-desc">
            Generate a unique room code and share it with the person who will receive your file.
            Your file transfers directly — never stored on any server.
          </p>
          <button className="btn-primary" onClick={startSend}>
            Generate Code
          </button>
        </div>
      )}

      {/* ── 2. Creating room ── */}
      {status === 'creating' && (
        <div className="flow-step">
          <div className="spinner" />
          <p className="flow-desc">Creating a secure room…</p>
        </div>
      )}

      {/* ── 3. Waiting for receiver ── */}
      {status === 'waiting' && (
        <div className="flow-step">
          <p className="flow-label">Share this code with the receiver</p>

          <div className="code-box">
            <span className="code-text">{code.split('').join(' ')}</span>
          </div>

          <button className="btn-copy" onClick={copyCode}>
            {copied ? '✓ Copied!' : '📋 Copy Code'}
          </button>

          <div className="status-indicator waiting">
            <span className="pulse-dot" />
            Waiting for receiver to connect…
          </div>

          <p className="flow-desc-sm mt-2">
            Code expires in 5 minutes · single-use
          </p>
        </div>
      )}

      {/* ── 4. Receiver joined, setting up WebRTC ── */}
      {status === 'peer-connected' && (
        <div className="flow-step">
          <p className="flow-label">Share this code with the receiver</p>
          <div className="code-box">
            <span className="code-text">{code.split('').join(' ')}</span>
          </div>
          <div className="status-indicator success">
            <span className="dot-ok" />
            Receiver connected! Establishing P2P…
          </div>
          <div className="spinner mt-4" />
        </div>
      )}

      {/* ── 5. P2P ready — pick a file ── */}
      {status === 'selecting' && (
        <div className="flow-step">
          <div className="status-indicator success">
            <span className="dot-ok" />
            Peer-to-peer connection established
          </div>
          <p className="flow-desc mt-2">Choose one or more files to send over the same connection:</p>
          <label className="file-picker mt-2">
            <input type="file" multiple onChange={onFileChange} />
            <span className="file-picker-btn">📁 Choose Files</span>
          </label>
          {queueCount > 0 && (
            <p className="flow-desc-sm mt-2">{queueCount} file(s) queued to send</p>
          )}
        </div>
      )}

      {/* ── 6. Transferring ── */}
      {status === 'transferring' && (
        <div className="flow-step">
          <h3 className="flow-title-sm">📤 Sending…</h3>
          <p className="flow-filename">{fileName}</p>
          <ProgressBar
            transferred={transferred}
            total={fileSize}
            speed={speed}
            eta={eta}
          />
          <p className="flow-desc-sm mt-2">
            🔒 DTLS encrypted · direct peer-to-peer
          </p>
          {queueCount > 0 && (
            <p className="flow-desc-sm mt-2">Queued: {queueCount} file(s)</p>
          )}
        </div>
      )}

      {/* ── 7. Complete ── */}
      {status === 'complete' && (
        <div className="flow-step">
          <div className="flow-icon">✅</div>
          <h3 className="flow-title-sm">Transfer complete!</h3>
          <p className="flow-filename">{fileName}</p>
          <ProgressBar
            transferred={fileSize}
            total={fileSize}
            speed={0}
            eta={0}
          />
          <div className="mt-4" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={reset}>
              Send More Files
            </button>
            <button className="btn-secondary" onClick={closeConnection}>
              Close Connection
            </button>
          </div>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && (
        <div className="flow-step">
          <div className="flow-icon">❌</div>
          <div className="status-indicator error">{error}</div>
          <div className="mt-4" style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
            <button className="btn-secondary" onClick={reset}>
              Try Again
            </button>
            <button className="btn-secondary" onClick={closeConnection}>
              Close Connection
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
