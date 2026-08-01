import './globals.css';

export const metadata = {
  title: {
    default:  'P2P Share — Instant Browser-to-Browser File Transfer',
    template: '%s — P2P Share',
  },
  description:
    'Transfer files directly between browsers with WebRTC. No server storage, no installation, end-to-end encrypted via DTLS.',
  keywords: ['p2p file transfer', 'webrtc', 'browser file share', 'peer to peer', 'no upload'],
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
