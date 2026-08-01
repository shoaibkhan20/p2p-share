import dynamic from 'next/dynamic';
import Link from 'next/link';

const SendFlow = dynamic(() => import('../../components/SendFlow'), {
  ssr: false,
});

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
