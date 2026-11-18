import { parseStatus } from './screening';
import type { Preferences, Screening } from './screening';

export type CameraTarget = Pick<Preferences, 'host' | 'gatewayUrl'>;
export type CameraEndpoint = 'status' | 'jpg' | 'stream';
export const GATEWAY_SETUP_MESSAGE =
  'Live camera access needs a gateway on the camera’s Wi-Fi. Enter its HTTPS URL in Settings, or run this dashboard locally. Photo screening works without a gateway.';

export function validateCameraHost(host: string): string {
  const parts = host.trim().split('.');
  if (
    parts.length !== 4 ||
    parts.some((part) => !/^(0|[1-9]\d{0,2})$/.test(part) || Number(part) > 255)
  ) {
    throw new Error('Enter the camera’s local IPv4 address from its Serial Monitor.');
  }
  const [a, b, , d] = parts.map(Number);
  if (
    !(a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) ||
    d === 0 ||
    d === 255
  ) {
    throw new Error('Use a private camera address: 10.x.x.x, 172.16–31.x.x, or 192.168.x.x.');
  }
  return parts.join('.');
}

export function normalizeGatewayUrl(
  value: string,
  pageProtocol = typeof location === 'undefined' ? 'https:' : location.protocol,
): string {
  if (!value.trim()) return '';
  let url: URL;
  try {
    url = new URL(value.trim());
  } catch {
    throw new Error('Enter a complete gateway URL, such as https://your-gateway.example.com.');
  }
  if (
    !['https:', 'http:'].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/'
  ) {
    throw new Error(
      'Use only the gateway’s origin, without passwords, a path, query, or fragment.',
    );
  }
  if (['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error(
      'Use the gateway’s reachable network address, not the browser’s localhost. Leave this blank when the gateway serves this website.',
    );
  }
  if (url.protocol !== 'https:') {
    if (pageProtocol === 'https:') {
      throw new Error(
        'This HTTPS website requires an HTTPS gateway. A private HTTP camera URL would be blocked by the browser.',
      );
    }
    validateCameraHost(url.hostname);
  }
  return url.origin;
}

export function apiUrl(kind: CameraEndpoint, target: CameraTarget): string {
  const host = validateCameraHost(target.host);
  const gateway = normalizeGatewayUrl(target.gatewayUrl || '');
  const base = gateway ? `${gateway}/api` : `${import.meta.env.BASE_URL}api`;
  return `${base}/camera/${kind}?host=${encodeURIComponent(host)}`;
}

async function readCameraBody(
  response: Response,
  limit: number,
  name: string,
): Promise<Uint8Array> {
  const tooLarge = () => new Error(`${name} response is too large.`);
  if (Number(response.headers.get('content-length')) > limit) {
    await response.body?.cancel();
    throw tooLarge();
  }
  if (!response.body) throw new Error(`${name} response is empty.`);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

export async function cameraResponse(
  kind: CameraEndpoint,
  target: CameraTarget,
  token = '',
  signal?: AbortSignal,
): Promise<Response> {
  if (
    !target.gatewayUrl?.trim() &&
    typeof location !== 'undefined' &&
    location.hostname.endsWith('.github.io')
  ) {
    throw new Error(GATEWAY_SETUP_MESSAGE);
  }
  const url = apiUrl(kind, target);
  const timeout = kind === 'stream' ? 10000 : 8000;
  const requestSignal =
    kind === 'stream' && signal
      ? signal
      : signal
        ? AbortSignal.any([signal, AbortSignal.timeout(timeout)])
        : AbortSignal.timeout(timeout);
  let response: Response;
  try {
    response = await fetch(url, {
      signal: requestSignal,
      cache: 'no-store',
      redirect: 'error',
      credentials: 'omit',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        Accept:
          kind === 'status'
            ? 'application/json'
            : kind === 'jpg'
              ? 'image/jpeg'
              : 'multipart/x-mixed-replace',
      },
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof Error && ['TimeoutError', 'AbortError'].includes(error.name)) {
      throw new Error(
        'The camera gateway timed out. Check that it is running and can reach the ESP32-CAM.',
      );
    }
    throw new Error(
      'Could not reach the camera gateway. Check its URL, HTTPS certificate, and allowed website origin.',
    );
  }
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (!response.ok) {
    if (response.status === 401) {
      await response.body?.cancel();
      throw new Error('The gateway requires a valid access key. Check the key in camera settings.');
    }
    const data =
      contentType === 'application/json'
        ? await readCameraBody(response, 8192, 'Gateway error')
            .then((bytes) => JSON.parse(new TextDecoder().decode(bytes)))
            .catch(() => null)
        : null;
    if (contentType !== 'application/json') await response.body?.cancel();
    throw new Error(
      typeof data?.error === 'string'
        ? data.error.slice(0, 1000)
        : response.status === 404
          ? GATEWAY_SETUP_MESSAGE
          : `The camera gateway returned HTTP ${response.status}.`,
    );
  }
  const expected =
    kind === 'status'
      ? 'application/json'
      : kind === 'jpg'
        ? 'image/jpeg'
        : 'multipart/x-mixed-replace';
  if (contentType !== expected) {
    await response.body?.cancel();
    throw new Error(
      'This address did not return the expected camera data. Check the gateway URL and firmware.',
    );
  }
  return response;
}

export async function fetchStatus(
  target: CameraTarget,
  token = '',
  signal?: AbortSignal,
): Promise<Screening> {
  const response = await cameraResponse('status', target, token, signal);
  const text = new TextDecoder().decode(await readCameraBody(response, 8192, 'Camera status'));
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('The gateway returned invalid camera JSON.');
  }
  return parseStatus(data);
}

export async function fetchJpeg(
  target: CameraTarget,
  token = '',
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await cameraResponse('jpg', target, token, signal);
  const bytes = await readCameraBody(response, 5 * 1024 * 1024, 'Camera JPEG');
  if (
    bytes.length < 4 ||
    bytes[0] !== 255 ||
    bytes[1] !== 216 ||
    bytes[bytes.length - 2] !== 255 ||
    bytes[bytes.length - 1] !== 217
  ) {
    throw new Error('The camera returned an invalid JPEG image.');
  }
  return new Blob([bytes], { type: 'image/jpeg' });
}

const tokenKey = (gateway: string) => `smartfarm-gateway-key:${gateway || 'same-origin'}`;
export function loadGatewayToken(gateway = ''): string {
  try {
    return sessionStorage.getItem(tokenKey(gateway)) || '';
  } catch {
    return '';
  }
}
export function storeGatewayToken(token: string, gateway = ''): void {
  try {
    if (token) sessionStorage.setItem(tokenKey(gateway), token);
    else sessionStorage.removeItem(tokenKey(gateway));
  } catch {
    /* An access key may still be used in memory when storage is disabled. */
  }
}
