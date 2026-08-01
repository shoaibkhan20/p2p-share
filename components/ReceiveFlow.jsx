'use client';

/**
 * ReceiveFlow — Receiver side of a P2P file transfer
 *
 * State machine:
 *   idle → connecting → waiting → waiting-for-file → awaiting-accept
 *        → receiving → complete
 *                    ↘ error (any step)
 *
 * On Chrome/Edge with File System Access API:
 *   User clicks "Save File…" → showSaveFilePicker() → writable stream
 *   → chunks written directly to disk as they arrive (true streaming)
 *
 * On Firefox / Safari (no FSA):
 *   Chunks are buffered in memory → Blob → auto-download when complete
 */

import { useState, useRef, useEffect } from 'react';
import ProgressBar from './ProgressBar';
import { getRTCConfig } from '@/lib/rtc-config';

export default function ReceiveFlow() {
  // ── UI state ──────────────────────────────────────────────────────────────
  const [status,       setStatus]       = useState('idle');
  const [codeInput,    setCodeInput]    = useState('');
  const [incomingFile, setIncomingFile] = useState(null);  // { name, size, mimeType }
  const [transferred,  setTransferred]  = useState(0);
  const [speed,        setSpeed]        = useState(0);
  const [eta,          setEta]          = useState(Infinity);
  const [error,        setError]        = useState('');
  const [fsaSupported, setFsaSupported] = useState(false); // detected after mount
  const [usingFSA,     setUsingFSA]     = useState(false); // true if streaming to disk

  // ── Refs ──────────────────────────────────────────────────────────────────
  const wsRef             = useRef(null);
  const pcRef             = useRef(null);
  const dcRef             = useRef(null);
  const iceCandidateQueue = useRef([]);
  const remoteDescSet     = useRef(false);
  const isComplete        = useRef(false);

  // File reception state
  const writerRef         = useRef(null);   // FileSystemWritableFileStream
  const chunksRef         = useRef([]);     // memory fallback buffer
  const writeQueue        = useRef(Promise.resolve()); // serialise async writes
  const fileMetaRef       = useRef(null);   // { name, size, mimeType }
  const receivedBytes     = useRef(0);
  const startTime         = useRef(0);
  const lastSpeedTime     = useRef(0);
  const lastSpeedBytes    = useRef(0);

  // ── Feature detection (client-only) ──────────────────────────────────────
  useEffect(() => {
    setFsaSupported(typeof window !== 'undefined' && 'showSaveFilePicker' in window);
    return () => closeAll();   // cleanup on unmount
  }, []);

  // ── Cleanup ───────────────────────────────────────────────────────────────

  function closeAll() {
    try { dcRef.current?.close();  } catch {}
    try { pcRef.current?.close();  } catch {}
    try { wsRef.current?.close();  } catch {}
    dcRef.current = null;
    pcRef.current = null;
    wsRef.current = null;
    iceCandidateQueue.current = [];
    remoteDescSet.current     = false;
  }

  function fail(msg) {
    if (isComplete.current) return;
    closeAll();
    setError(msg);
    setStatus('error');
  }

  function reset() {
    isComplete.current    = false;
    writerRef.current     = null;
    chunksRef.current     = [];
    writeQueue.current    = Promise.resolve();
    fileMetaRef.current   = null;
    receivedBytes.current = 0;
    closeAll();
    setStatus('idle');
    setCodeInput('');
    setIncomingFile(null);
    setTransferred(0);
    setSpeed(0);
    setEta(Infinity);
    setError('');
    setUsingFSA(false);
  }

  // ── Chunk handling ────────────────────────────────────────────────────────

  function handleChunk(buffer) {
    receivedBytes.current += buffer.byteLength;
    const received = receivedBytes.current;
    const total    = fileMetaRef.current?.size || 1;

    if (writerRef.current) {
      // Stream to disk — queue writes so they stay in order
      const w = writerRef.current;
      writeQueue.current = writeQueue.current
        .then(() => w.write(buffer))
        .catch(e  => fail('Disk write error: ' + e.message));
    } else {
      chunksRef.current.push(buffer);
    }

    // Throttled progress update
    const now = Date.now();
    setTransferred(received);
    if (now - lastSpeedTime.current > 150) {
      const dt     = (now - lastSpeedTime.current) / 1000;
      const db     = received - lastSpeedBytes.current;
      const spd    = dt > 0 ? db / dt : 0;
      const remain = total - received;
      setSpeed(spd);
      setEta(spd > 0 ? remain / spd : Infinity);
      lastSpeedTime.current  = now;
      lastSpeedBytes.current = received;
    }
  }

  async function finishReceiving() {
    if (writerRef.current) {
      // Wait for all queued disk writes then close the stream
      await writeQueue.current;
      await writerRef.current.close();
      writerRef.current = null;
    } else {
      // Memory fallback — build a Blob and trigger browser download
      const meta = fileMetaRef.current;
      const blob = new Blob(chunksRef.current, {
        type: meta?.mimeType || 'application/octet-stream',
      });
      chunksRef.current = [];

      const url = URL.createObjectURL(blob);
      const a   = Object.assign(document.createElement('a'), {
        href:     url,
        download: meta?.name || 'downloaded-file',
      });
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 8_000);
    }

    isComplete.current = true;
    setTransferred(fileMetaRef.current?.size || 0);
    setStatus('complete');
    closeAll();
  }

  // ── Data channel setup ────────────────────────────────────────────────────

  function setupDataChannel(dc) {
    dcRef.current  = dc;
    dc.binaryType  = 'arraybuffer';

    dc.onmessage = async ({ data }) => {
      try {
        if (typeof data === 'string') {
          const msg = JSON.parse(data);

          if (msg.type === 'metadata') {
            fileMetaRef.current = msg;
            setIncomingFile({ name: msg.name, size: msg.size, mimeType: msg.mimeType });
            setStatus('awaiting-accept');

          } else if (msg.type === 'transfer-complete') {
            await finishReceiving();
          }

        } else {
          // Binary chunk
          handleChunk(data);
        }
      } catch (e) {
        fail('Receive error: ' + e.message);
      }
    };

    dc.onerror = (e) => fail('Data channel error: ' + (e.error?.message || 'unknown'));
  }

  // ── Signaling connection ──────────────────────────────────────────────────

  function connect() {
    const code = codeInput.trim().toUpperCase();
    if (code.length !== 6) { fail('Please enter a valid 6-character code.'); return; }

    setStatus('connecting');
    isComplete.current = false;

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws    = new WebSocket(`${proto}://${location.host}/ws`);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: 'join-room', code }));
    };

    ws.onmessage = async ({ data }) => {
      let msg;
      try { msg = JSON.parse(data); } catch { return; }

      switch (msg.type) {

        case 'room-joined': {
          // Create the peer connection now so it's ready when the offer arrives
          const pc = new RTCPeerConnection(getRTCConfig());
          pcRef.current = pc;

          pc.onicecandidate = ({ candidate }) => {
            if (candidate) {
              wsRef.current?.send(JSON.stringify({ type: 'ice-candidate', candidate }));
            }
          };

          pc.oniceconnectionstatechange = () => {
            const s = pc.iceConnectionState;
            if (s === 'failed')       fail('P2P connection failed. A TURN server may be needed on this network.');
            if (s === 'disconnected') fail('Connection was lost during transfer.');
          };

          // Sender will create the data channel; we receive it here
          pc.ondatachannel = ({ channel }) => setupDataChannel(channel);

          setStatus('waiting');
          break;
        }

        case 'offer': {
          const pc = pcRef.current;
          if (!pc) break;
          try {
            await pc.setRemoteDescription(new RTCSessionDescription(msg.sdp));
            remoteDescSet.current = true;

            // Drain queued ICE candidates
            for (const c of iceCandidateQueue.current) {
              await pc.addIceCandidate(new RTCIceCandidate(c));
            }
            iceCandidateQueue.current = [];

            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            wsRef.current?.send(JSON.stringify({ type: 'answer', sdp: pc.localDescription }));
            setStatus('waiting-for-file');
          } catch (e) {
            fail('SDP error: ' + e.message);
          }
          break;
        }

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
          if (!isComplete.current) fail('Sender disconnected before the transfer could complete.');
          break;

        case 'error':
          fail(msg.message);
          break;
      }
    };

    ws.onerror = () => fail('Could not connect to the signaling server.');
  }

  // ── Accept transfer (user-gesture required for FSA picker) ────────────────

  async function acceptTransfer() {
    const meta = fileMetaRef.current;
    if (!meta) return;

    // Reset counters
    receivedBytes.current  = 0;
    startTime.current      = Date.now();
    lastSpeedTime.current  = Date.now();
    lastSpeedBytes.current = 0;
    chunksRef.current      = [];
    writeQueue.current     = Promise.resolve();

    // Try File System Access API (Chrome/Edge) — requires user activation
    if ('showSaveFilePicker' in window) {
      try {
        const handle   = await window.showSaveFilePicker({
          suggestedName: meta.name,
          types: [{
            description: 'File',
            accept: { [meta.mimeType || 'application/octet-stream']: [] },
          }],
        });
        writerRef.current = await handle.createWritable();
        setUsingFSA(true);
      } catch {
        // User cancelled the picker or browser error → fall back to memory buffer
        writerRef.current = null;
        setUsingFSA(false);
      }
    }

    // Signal sender: "we're ready, start sending chunks now"
    dcRef.current?.send(JSON.stringify({ type: 'receiver-ready' }));
    setStatus('receiving');
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function fmtBytes(n) {
    if (!n) return '';
    if (n < 1024)       return `${n} B`;
    if (n < 1024 ** 2)  return `${(n / 1024).toFixed(1)} KB`;
    if (n < 1024 ** 3)  return `${(n / 1024 ** 2).toFixed(1)} MB`;
    return                     `${(n / 1024 ** 3).toFixed(2)} GB`;
  }

  function handleCodeChange(e) {
    // Only allow valid code characters; convert to uppercase
    const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
    setCodeInput(v);
    // Clear any previous error when user re-types
    if (error) { setError(''); setStatus('idle'); }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && codeInput.length === 6) connect();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flow-card">

      {/* ── 1. Idle — enter code ── */}
      {status === 'idle' && (
        <div className="flow-step">
          <div className="flow-icon">📥</div>
          <h2 className="flow-title">Receive a File</h2>
          <p className="flow-desc">
            Enter the 6-character code that the sender shared with you.
          </p>
          <input
            className="code-input"
            type="text"
            value={codeInput}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            placeholder="A B C 1 2 3"
            maxLength={6}
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
          />
          <button
            className="btn-primary"
            onClick={connect}
            disabled={codeInput.length !== 6}
          >
            Connect
          </button>
          {error && (
            <div className="status-indicator error mt-2">{error}</div>
          )}
        </div>
      )}

      {/* ── 2. Connecting ── */}
      {status === 'connecting' && (
        <div className="flow-step">
          <div className="spinner" />
          <p className="flow-desc">Connecting to signaling server…</p>
        </div>
      )}

      {/* ── 3 & 4. Waiting for WebRTC handshake / file selection ── */}
      {(status === 'waiting' || status === 'waiting-for-file') && (
        <div className="flow-step">
          <div className="spinner" />
          <div className="status-indicator success mt-2">
            <span className="dot-ok" />
            {status === 'waiting'
              ? 'Connected — waiting for P2P handshake…'
              : 'P2P connected! Waiting for sender to choose a file…'}
          </div>
          <p className="flow-desc-sm mt-2">
            🔒 DTLS encrypted · direct peer-to-peer
          </p>
        </div>
      )}

      {/* ── 5. Awaiting user accept ── */}
      {status === 'awaiting-accept' && incomingFile && (
        <div className="flow-step">
          <div className="flow-icon">📂</div>
          <h3 className="flow-title-sm">Incoming file</h3>

          <div className="file-info-box">
            <span className="file-info-name">{incomingFile.name}</span>
            <span className="file-info-size">{fmtBytes(incomingFile.size)}</span>
          </div>

          {fsaSupported ? (
            <p className="flow-desc mt-2">
              Click <strong>Save File…</strong> to choose a location.
              Chunks stream directly to disk as they arrive.
            </p>
          ) : (
            <p className="flow-desc mt-2">
              Click <strong>Accept &amp; Download</strong>. The file will
              be buffered and saved to your Downloads folder when complete.
            </p>
          )}

          <button className="btn-primary mt-4" onClick={acceptTransfer}>
            {fsaSupported ? '💾 Save File…' : '📥 Accept & Download'}
          </button>
        </div>
      )}

      {/* ── 6. Receiving ── */}
      {status === 'receiving' && (
        <div className="flow-step">
          <h3 className="flow-title-sm">📥 Receiving…</h3>
          <p className="flow-filename">{incomingFile?.name}</p>

          {usingFSA
            ? <p className="flow-desc-sm">Streaming directly to disk…</p>
            : <p className="flow-desc-sm">Buffering in memory — will download when complete.</p>
          }

          <ProgressBar
            transferred={transferred}
            total={incomingFile?.size || 0}
            speed={speed}
            eta={eta}
          />
          <p className="flow-desc-sm mt-2">🔒 DTLS encrypted · direct peer-to-peer</p>
        </div>
      )}

      {/* ── 7. Complete ── */}
      {status === 'complete' && (
        <div className="flow-step">
          <div className="flow-icon">✅</div>
          <h3 className="flow-title-sm">Transfer complete!</h3>
          <p className="flow-filename">{incomingFile?.name}</p>
          <ProgressBar
            transferred={incomingFile?.size || 0}
            total={incomingFile?.size || 0}
            speed={0}
            eta={0}
          />
          {!usingFSA && (
            <p className="flow-desc-sm mt-2">
              File saved to your Downloads folder.
            </p>
          )}
          <button className="btn-secondary mt-4" onClick={reset}>
            Receive Another File
          </button>
        </div>
      )}

      {/* ── Error ── */}
      {status === 'error' && (
        <div className="flow-step">
          <div className="flow-icon">❌</div>
          <div className="status-indicator error">{error}</div>
          <button className="btn-secondary mt-4" onClick={reset}>
            Try Again
          </button>
        </div>
      )}

    </div>
  );
}
