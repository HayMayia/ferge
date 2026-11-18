import { afterEach, describe, expect, it, vi } from 'vitest';
import { cameraOrigin } from './camera.mjs';
import { createApp } from './app.mjs';

const servers = [];
afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.closeAllConnections();
          server.close(resolve);
        }),
    ),
  );
});

async function serve(options) {
  const server = createApp({ production: false, ...options }).listen(0, '127.0.0.1');
  servers.push(server);
  await new Promise((resolve) => server.on('listening', resolve));
  return `http://127.0.0.1:${server.address().port}`;
}

describe('camera target validation', () => {
  it.each(['192.168.4.3', '10.1.2.3', '172.16.0.2', '172.31.255.1'])(
    'allows a private camera: %s',
    (host) => expect(cameraOrigin(host)).toBe(`http://${host}`),
  );
  it('uses port 81 only for MJPEG', () =>
    expect(cameraOrigin('192.168.4.3', true)).toBe('http://192.168.4.3:81'));
  it.each([
    undefined,
    '',
    '127.0.0.1',
    '169.254.169.254',
    '8.8.8.8',
    '172.32.1.2',
    '192.168.4.0',
    '192.168.4.255',
    'localhost',
    'http://192.168.4.3',
    '192.168.4.3:3001',
    'user@192.168.4.3',
    '::1',
    '192.168.4.3/path',
    ['192.168.4.3'],
  ])('rejects arbitrary origins: %j', (host) => expect(() => cameraOrigin(host)).toThrow());
});

describe('same-origin local gateway', () => {
  it('exposes an honest health endpoint', async () => {
    const root = await serve();
    expect(await (await fetch(`${root}/api/health`)).json()).toEqual({
      service: 'smartfarm-camera-gateway',
      ok: true,
    });
  });
  it('rejects a public target before attempting to fetch', async () => {
    const fetchCamera = vi.fn();
    const root = await serve({ fetchCamera });
    expect((await fetch(`${root}/api/camera/status?host=8.8.8.8`)).status).toBe(400);
    expect(fetchCamera).not.toHaveBeenCalled();
  });
  it('only exposes firmware endpoints', async () => {
    const root = await serve();
    expect((await fetch(`${root}/api/camera/admin?host=192.168.4.3`)).status).toBe(404);
  });
  it('forwards status without caching or following redirects', async () => {
    const telemetry = {
      cls: 1,
      label: 'Healthy',
      solution: 'No action needed.',
      green: 94,
      yellow: 4,
      brown: 2,
    };
    const fetchCamera = vi.fn(async () => Response.json(telemetry));
    const root = await serve({ fetchCamera });
    const response = await fetch(`${root}/api/camera/status?host=192.168.4.3`);
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toEqual(telemetry);
    expect(fetchCamera).toHaveBeenCalledWith(
      'http://192.168.4.3/status',
      expect.objectContaining({ redirect: 'error' }),
    );
  });
  it('forwards the exact JPEG bytes', async () => {
    const bytes = new Uint8Array([255, 216, 255, 217]);
    const root = await serve({
      fetchCamera: async () => new Response(bytes, { headers: { 'Content-Type': 'image/jpeg' } }),
    });
    const response = await fetch(`${root}/api/camera/jpg?host=192.168.4.3`);
    expect(response.headers.get('content-type')).toContain('image/jpeg');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(bytes);
  });
  it('streams MJPEG on port 81 and preserves the multipart boundary', async () => {
    const type = 'multipart/x-mixed-replace;boundary=test-boundary';
    const body = '--test-boundary\r\nContent-Type: image/jpeg\r\n\r\nframe\r\n';
    const fetchCamera = vi.fn(
      async () => new Response(body, { headers: { 'Content-Type': type } }),
    );
    const root = await serve({ fetchCamera });
    const response = await fetch(`${root}/api/camera/stream?host=192.168.4.3`);
    expect(response.headers.get('content-type')).toBe(type);
    expect(await response.text()).toBe(body);
    expect(fetchCamera.mock.calls[0][0]).toBe('http://192.168.4.3:81/stream');
  });
  it('returns a useful offline error, not fabricated readings', async () => {
    const root = await serve({
      fetchCamera: async () => {
        throw new Error('fetch failed');
      },
    });
    const response = await fetch(`${root}/api/camera/status?host=192.168.4.3`);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('same Wi-Fi');
  });
  it('rejects an unexpected device content type', async () => {
    const root = await serve({
      fetchCamera: async () =>
        new Response('<html>not a camera</html>', { headers: { 'Content-Type': 'text/html' } }),
    });
    expect((await fetch(`${root}/api/camera/status?host=192.168.4.3`)).status).toBe(502);
  });
  it('bounds status response size', async () => {
    const root = await serve({
      fetchCamera: async () =>
        new Response('x'.repeat(8193), { headers: { 'Content-Type': 'application/json' } }),
    });
    const response = await fetch(`${root}/api/camera/status?host=192.168.4.3`);
    expect(response.status).toBe(502);
    expect((await response.json()).error).toContain('too large');
  });
});
