'use client';

function fmtBytes(n) {
  if (n < 1024)        return `${n} B`;
  if (n < 1024 ** 2)   return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3)   return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return                      `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function fmtSpeed(bps) {
  if (!bps || bps < 0)  return '—';
  if (bps < 1024)       return `${bps.toFixed(0)} B/s`;
  if (bps < 1024 ** 2)  return `${(bps / 1024).toFixed(1)} KB/s`;
  return                       `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
}

function fmtEta(sec) {
  if (!isFinite(sec) || sec <= 0) return '—';
  if (sec < 60)  return `${Math.ceil(sec)}s`;
  const m = Math.floor(sec / 60);
  const s = Math.ceil(sec % 60);
  return `${m}m ${s}s`;
}

/**
 * Props:
 *   transferred  — bytes transferred so far
 *   total        — total bytes
 *   speed        — current transfer speed in B/s
 *   eta          — estimated seconds remaining
 */
export default function ProgressBar({ transferred, total, speed, eta }) {
  const pct = total > 0 ? Math.min(100, Math.round((transferred / total) * 100)) : 0;

  return (
    <div className="progress-wrap">
      <div className="progress-head">
        <span className="progress-pct">{pct}%</span>
        <span className="progress-bytes">
          {fmtBytes(transferred)} / {fmtBytes(total)}
        </span>
      </div>

      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${pct}%` }} />
      </div>

      <div className="progress-foot">
        <span>{fmtSpeed(speed)}</span>
        <span>ETA: {fmtEta(eta)}</span>
      </div>
    </div>
  );
}
