import Link from 'next/link';

export const metadata = {
  title: 'P2P Share — Instant Browser-to-Browser File Transfer',
};

export default function HomePage() {
  return (
    <div className="page">

      {/* ── Nav ── */}
      <nav className="nav">
        <div className="nav-logo">
          <span className="logo-icon">⟴</span>
          <span>P2P Share</span>
        </div>
      </nav>

      <main className="landing">

        {/* ── Hero ── */}
        <section className="hero">
          <div className="hero-badge">
            🔒 End-to-end encrypted · No server storage · No sign-up
          </div>

          <h1 className="hero-heading">
            Share files<br />
            <span className="gradient">directly between browsers</span>
          </h1>

          <p className="hero-sub">
            Using WebRTC peer-to-peer technology, your files stream directly
            from one browser to another. Nothing is ever uploaded or stored on
            any server — just share a 6-character code.
          </p>

          <div className="hero-ctas">
            <Link href="/send" className="btn-hero-send">
              <span>📤</span>
              <span>Send a File</span>
            </Link>
            <Link href="/receive" className="btn-hero-receive">
              <span>📥</span>
              <span>Receive a File</span>
            </Link>
          </div>
        </section>

        {/* ── Features ── */}
        <section className="features">
          <div className="features-grid">
            <div className="feature-card">
              <div className="feature-icon">🔒</div>
              <h3>End-to-End Encrypted</h3>
              <p>
                WebRTC data channels use DTLS encryption by default. Your files
                are encrypted in transit and are never stored on any server —
                not even temporarily.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">⚡</div>
              <h3>Real-Time Streaming</h3>
              <p>
                The receiver starts getting data as the sender transmits. No
                waiting for a full upload to finish before the download can
                begin — true simultaneous transfer.
              </p>
            </div>
            <div className="feature-card">
              <div className="feature-icon">🌐</div>
              <h3>No Installation</h3>
              <p>
                Works in any modern browser — Chrome, Firefox, Safari, Edge.
                No apps, plugins, accounts or subscriptions. Just open the
                page and share a 6-character code.
              </p>
            </div>
          </div>
        </section>

        {/* ── How it works ── */}
        <section className="how-it-works">
          <h2>How it works</h2>
          <div className="steps">
            <div className="step-item">
              <span className="step-num">1</span>
              <h4>Generate a code</h4>
              <p>Sender clicks "Send" to get a unique 6-character room code.</p>
            </div>
            <span className="step-arrow">→</span>
            <div className="step-item">
              <span className="step-num">2</span>
              <h4>Share the code</h4>
              <p>Give the code to your receiver via chat, phone, or any channel.</p>
            </div>
            <span className="step-arrow">→</span>
            <div className="step-item">
              <span className="step-num">3</span>
              <h4>Files transfer</h4>
              <p>Browsers connect peer-to-peer via WebRTC and stream the file directly.</p>
            </div>
          </div>
        </section>

      </main>

      <footer className="footer">
        <p>Files never leave your browser until they reach the recipient · DTLS encrypted · WebRTC</p>
      </footer>

    </div>
  );
}
