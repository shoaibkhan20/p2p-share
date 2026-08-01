import Link from 'next/link';
import ReceiveFlow from '../../components/ReceiveFlow';

export const metadata = {
  title: 'Receive File',
};

export default function ReceivePage() {
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
        <ReceiveFlow />
      </main>
    </div>
  );
}
