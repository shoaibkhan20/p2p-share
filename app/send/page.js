import dynamic from 'next/dynamic';
import Link from 'next/link';

const SendFlow = dynamic(() => import('../../components/SendFlow'), {
  ssr: false,
});

export const metadata = {
  title: 'Send File — P2P Share',
  description:
    'Send files securely over a direct browser-to-browser connection with P2P Share. No server upload, no installation, and no account required.',
  keywords: [
    'send file online',
    'p2p file sending',
    'secure file transfer',
    'webrtc send file',
    'browser to browser file share',
  ],
  openGraph: {
    title: 'Send File — P2P Share',
    description:
      'Send files securely over a direct browser-to-browser connection with P2P Share. No server upload, no installation, and no account required.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Send File — P2P Share',
    description:
      'Send files securely over a direct browser-to-browser connection with P2P Share. No server upload, no installation, and no account required.',
  },
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
