import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  apiUrl,
  cameraResponse,
  fetchStatus,
  fetchJpeg,
  normalizeGatewayUrl,
  storeGatewayToken,
  loadGatewayToken,
  validateCameraHost,
} from './transport';
import { DEFAULT_PREFERENCES, DEMO_SCREENING, createScanId, loadPreferences } from './screening';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const target = { host: '192.168.4.3', gatewayUrl: 'https://farm.example.com' };

function storage(value: unknown = null) {
  const values = new Map<string, string>();
  if (value) values.set('smartfarm-preferences', JSON.stringify(value));
  return {
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, data: string) => {
      values.set(key, data);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

describe('real-first workspace and migration', () => {
  it('starts without a pretend camera address or demo consent', () => {
    vi.stubGlobal('localStorage', storage());
    expect(loadPreferences()).toEqual(DEFAULT_PREFERENCES);
    expect(loadPreferences().mode).toBe('device');
    expect(loadPreferences().host).toBe('');
  });
  it('migrates old automatically-saved demo settings to real/offline mode', () => {
    vi.stubGlobal(
      'localStorage',
      storage({ mode: 'demo', host: '192.168.4.3', location: 'North greenhouse' }),
    );
    expect(loadPreferences().mode).toBe('device');
    expect(loadPreferences().host).toBe('');
    expect(loadPreferences().location).toBe('My farm');
  });
  it('only keeps demo mode after explicit consent in the new version', () => {
    vi.stubGlobal('localStorage', storage({ mode: 'demo', demoOptIn: true }));
    expect(loadPreferences().mode).toBe('demo');
  });
  it('preserves actual device and gateway preferences', () => {
    vi.stubGlobal(
      'localStorage',
      storage({ ...DEFAULT_PREFERENCES, ...target, name: 'Real camera' }),
    );
    expect(loadPreferences()).toMatchObject({ ...target, mode: 'device', name: 'Real camera' });
  });
  it('recovers from disabled or invalid browser storage', () => {
    vi.stubGlobal('localStorage', {
      getItem() {
        throw new Error('disabled');
      },
    });
    expect(loadPreferences().mode).toBe('device');
  });
  it('generates valid unique IDs on an ordinary, non-secure HTTP LAN page', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) });
    const ids = Array.from({ length: 20 }, createScanId);
    expect(new Set(ids).size).toBe(20);
    expect(
      ids.every((id) =>
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id),
      ),
    ).toBe(true);
  });
  it('does not reuse an access key for a different gateway origin', () => {
    vi.stubGlobal('sessionStorage', storage());
    storeGatewayToken('key-for-one-gateway', target.gatewayUrl);
    expect(loadGatewayToken(target.gatewayUrl)).toBe('key-for-one-gateway');
    expect(loadGatewayToken('https://another-gateway.example.com')).toBe('');
  });
  it('keeps gateway access keys in session storage, never preferences', () => {
    vi.stubGlobal('sessionStorage', storage());
    const local = { setItem: vi.fn() };
    vi.stubGlobal('localStorage', local);
    storeGatewayToken('test-session-key');
    expect(loadGatewayToken()).toBe('test-session-key');
    expect(local.setItem).not.toHaveBeenCalled();
    storeGatewayToken('');
    expect(loadGatewayToken()).toBe('');
  });
});

describe('camera endpoint and HTTPS validation', () => {
  it.each(['192.168.4.3', '10.0.0.5', '172.16.5.2'])(
    'accepts private camera addresses: %s',
    (host) => expect(validateCameraHost(host)).toBe(host),
  );
  it.each([
    '',
    'localhost',
    '127.0.0.1',
    '8.8.8.8',
    '192.168.04.3',
    '192.168.4.999',
    '192.168.4.0',
    '192.168.4.255',
    '192.168.4.3:80',
    'http://192.168.4.3',
  ])('rejects invalid or arbitrary camera targets: %s', (host) =>
    expect(() => validateCameraHost(host)).toThrow(),
  );
  it('keeps local browser requests same-origin by default', () =>
    expect(apiUrl('status', { host: target.host })).toBe('/api/camera/status?host=192.168.4.3'));
  it('uses a configured gateway for the static website', () =>
    expect(apiUrl('stream', target)).toBe(
      'https://farm.example.com/api/camera/stream?host=192.168.4.3',
    ));
  it.each([
    'http://192.168.1.2:3001',
    'https://user:password@example.com',
    'ftp://example.com',
    'https://example.com/api',
    'https://example.com?key=x',
    'https://example.com/#x',
    'https://localhost:3001',
  ])('rejects unsafe gateway URLs on HTTPS: %s', (value) =>
    expect(() => normalizeGatewayUrl(value, 'https:')).toThrow(),
  );
  it('allows a private HTTP gateway only from a local HTTP dashboard', () =>
    expect(normalizeGatewayUrl('http://192.168.1.2:3001/', 'http:')).toBe(
      'http://192.168.1.2:3001',
    ));
  it('explains missing gateway support on GitHub Pages without pretending to connect', async () => {
    vi.stubGlobal('location', { protocol: 'https:', hostname: 'haymayia.github.io' });
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    await expect(fetchStatus({ host: target.host })).rejects.toThrow('HTTPS');
    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('actual camera response contract', () => {
  it('sends a bearer header, never a token in the URL, and validates telemetry', async () => {
    const fetch = vi.fn(async () => Response.json(DEMO_SCREENING));
    vi.stubGlobal('fetch', fetch);
    expect(await fetchStatus(target, 'test-only-access-key')).toEqual(DEMO_SCREENING);
    const [url, options] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).not.toContain('test-only-access-key');
    expect(options).toMatchObject({
      credentials: 'omit',
      redirect: 'error',
      headers: { Authorization: 'Bearer test-only-access-key' },
    });
  });
  it('rejects a wrong access key rather than fabricating a status', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ error: 'No key' }, { status: 401 }));
    await expect(fetchStatus(target, 'wrong')).rejects.toThrow('access key');
  });
  it('rejects a static HTML fallback', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('<html></html>', { headers: { 'Content-Type': 'text/html' } }),
    );
    await expect(fetchStatus(target)).rejects.toThrow('expected camera data');
  });
  it('rejects invalid telemetry and malformed JSON', async () => {
    vi.stubGlobal('fetch', async () => Response.json({ cls: 1, green: 500, yellow: 0, brown: 0 }));
    await expect(fetchStatus(target)).rejects.toThrow('invalid colour');
    vi.stubGlobal(
      'fetch',
      async () => new Response('{', { headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(fetchStatus(target)).rejects.toThrow('invalid camera JSON');
  });
  it('rejects wrong stream content types', async () => {
    vi.stubGlobal(
      'fetch',
      async () => new Response('not MJPEG', { headers: { 'Content-Type': 'image/jpeg' } }),
    );
    await expect(cameraResponse('stream', target)).rejects.toThrow('expected camera data');
  });
  it('bounds status data before parsing or retaining oversized responses', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('x'.repeat(8193), { headers: { 'Content-Type': 'application/json' } }),
    );
    await expect(fetchStatus(target)).rejects.toThrow('too large');
  });
  it('reads bounded JPEG bytes and checks actual image markers', async () => {
    const bytes = new Uint8Array([255, 216, 1, 2, 255, 217]);
    vi.stubGlobal(
      'fetch',
      async () => new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } }),
    );
    expect(new Uint8Array(await (await fetchJpeg(target)).arrayBuffer())).toEqual(bytes);
    vi.stubGlobal(
      'fetch',
      async () => new Response('not a JPEG', { headers: { 'Content-Type': 'image/jpeg' } }),
    );
    await expect(fetchJpeg(target)).rejects.toThrow('invalid JPEG');
  });
  it('rejects oversized JPEGs from untrusted gateway responses', async () => {
    vi.stubGlobal(
      'fetch',
      async () =>
        new Response('ignored', {
          headers: { 'Content-Type': 'image/jpeg', 'Content-Length': '6000000' },
        }),
    );
    await expect(fetchJpeg(target)).rejects.toThrow('too large');
  });
  it('returns actionable network failures', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    await expect(fetchStatus(target)).rejects.toThrow('HTTPS certificate');
  });
});
