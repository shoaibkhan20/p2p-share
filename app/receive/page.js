import dynamic from 'next/dynamic';
import Link from 'next/link';

const ReceiveFlow = dynamic(() => import('../../components/ReceiveFlow'), {
  ssr: false,
});

export const metadata = {
  title: 'Receive File — P2P Share',
  description:
    'Receive files instantly via a secure browser-to-browser WebRTC link with P2P Share. No server storage, no sign-up, and encrypted transfer in real time.',
  keywords: [
    'receive file online',
    'p2p file receive',
    'secure file download',
    'webrtc receive file',
    'browser file receive',
  ],
  openGraph: {
    title: 'Receive File — P2P Share',
    description:
      'Receive files instantly via a secure browser-to-browser WebRTC link with P2P Share. No server storage, no sign-up, and encrypted transfer in real time.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Receive File — P2P Share',
    description:
      'Receive files instantly via a secure browser-to-browser WebRTC link with P2P Share. No server storage, no sign-up, and encrypted transfer in real time.',
  },
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
