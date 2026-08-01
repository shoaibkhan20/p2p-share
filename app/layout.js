import './globals.css';

export const metadata = {
  title: {
    default: 'P2P Share — Instant Browser-to-Browser File Transfer',
    template: '%s — P2P Share',
  },
  description:
    'Transfer files directly between browsers with WebRTC. No server storage, no installation, end-to-end encrypted via DTLS.',
  keywords: [
    'p2p file transfer',
    'webrtc',
    'browser file sharing',
    'peer to peer file transfer',
    'secure file sharing',
  ],
  openGraph: {
    title: 'P2P Share — Instant Browser-to-Browser File Transfer',
    description:
      'Transfer files directly between browsers with WebRTC. No server storage, no installation, end-to-end encrypted via DTLS.',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'P2P Share — Instant Browser-to-Browser File Transfer',
    description:
      'Transfer files directly between browsers with WebRTC. No server storage, no installation, end-to-end encrypted via DTLS.',
  },
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
