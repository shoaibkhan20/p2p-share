import dynamic from 'next/dynamic';
import Link from 'next/link';

const ReceiveFlow = dynamic(() => import('../../components/ReceiveFlow'), {
  ssr: false,
});

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
