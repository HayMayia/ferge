import net from 'node:net';

/** Limit this unauthenticated local-network bridge to RFC1918 camera addresses.
 * No DNS names, redirects, credentials, arbitrary ports or loopback targets.
 */
export function cameraOrigin(host, stream = false) {
  if (typeof host !== 'string' || net.isIP(host) !== 4) {
    throw new Error('Enter the camera’s local IPv4 address, for example 192.168.4.3.');
  }
  const octets = host.split('.').map(Number);
  const privateIp =
    octets[0] === 10 ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168);
  if (!privateIp || octets[3] === 0 || octets[3] === 255) {
    throw new Error(
      'Use a private, local-network camera address (10.x.x.x, 172.16–31.x.x or 192.168.x.x).',
    );
  }
  return `http://${host}${stream ? ':81' : ''}`;
}
