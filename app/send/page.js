import Link from 'next/link';
import SendFlow from '../../components/SendFlow';

export const metadata = {
  title: 'Send File',
};

export default function SendPage() {
  return (
    <div className="page">
      <nav className="nav">
        <Link href="/" className="nav-logo">
          <span className="logo-icon">⟴</span>
          <span>P2P Share</span>
        </Link>
        <Link href="/" className="nav-back">
          ← Back
        </Link>
      </nav>
      <main className="flow-page">
        <SendFlow />
      </main>
    </div>
  );
}
