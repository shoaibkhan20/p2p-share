/**
 * getRTCConfig()
 *
 * Returns the RTCConfiguration object used by both sender and receiver.
 *
 * STUN servers (Google + Cloudflare) handle ~85-90% of connections for
 * free by helping browsers discover their public IP/port.
 *
 * TURN is a relay fallback for symmetric NAT / restrictive firewalls (~10-15%).
 * Configure your own TURN server via .env.local:
 *
 *   NEXT_PUBLIC_TURN_URL=turn:your-server.com:3478
 *   NEXT_PUBLIC_TURN_USERNAME=username
 *   NEXT_PUBLIC_TURN_CREDENTIAL=password
 *
 * Free TURN options:
 *  - Metered.ca (free tier):  https://www.metered.ca/tools/openrelay/
 *  - Self-hosted coturn:      https://github.com/coturn/coturn
 */
export function getRTCConfig() {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302'  },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun.cloudflare.com:3478' },
  ];

  const turnUrl = process.env.NEXT_PUBLIC_TURN_URL;
  if (turnUrl) {
    iceServers.push({
      urls:       turnUrl,
      username:   process.env.NEXT_PUBLIC_TURN_USERNAME   || '',
      credential: process.env.NEXT_PUBLIC_TURN_CREDENTIAL || '',
    });
  }

  return { iceServers };
}
