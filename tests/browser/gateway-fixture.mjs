// Software-only ESP32 fixture. This deliberately is NOT a hardware verification.
// The browser makes real HTTPS/CORS requests through the production gateway;
// only the private ESP32's responses are simulated at the upstream boundary.
import { networkInterfaces, tmpdir } from 'node:os';
import { createServer } from 'node:https';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createApp } from '../../server/app.mjs';

export const TEST_ACCESS_KEY = 'software-test-only-not-a-production-key-0123456789';
export async function startTestGateway(jpeg, websiteOrigin) {
  const address = Object.values(networkInterfaces())
    .flat()
    .find((item) => item && !item.internal && item.family === 'IPv4')?.address;
  if (!address) throw new Error('Browser gateway tests require a non-loopback network interface.');
  // Generate a disposable, self-signed test certificate, never a deployment key.
  // Only these browser tests explicitly trust it. Real gateways need trusted TLS.
  const certificates = await fs.mkdtemp(path.join(tmpdir(), 'smartfarm-gateway-test-'));
  const key = path.join(certificates, 'key.pem'),
    cert = path.join(certificates, 'cert.pem');
  execFileSync(
    'openssl',
    [
      'req',
      '-x509',
      '-newkey',
      'rsa:2048',
      '-nodes',
      '-days',
      '1',
      '-subj',
      '/CN=smartfarm-test-only',
      '-addext',
      `subjectAltName=IP:${address}`,
      '-keyout',
      key,
      '-out',
      cert,
    ],
    { stdio: 'ignore' },
  );
  const state = {
    online: true,
    streamBroken: false,
    delay: 0,
    activeStreams: 0,
    calls: { status: 0, jpg: 0, stream: 0 },
    telemetry: {
      cls: 2,
      label: 'Yellowing',
      solution: 'Inspect watering and nutrition.',
      green: 70,
      yellow: 30,
      brown: 0,
    },
  };
  const app = createApp({
    production: false,
    gatewayToken: TEST_ACCESS_KEY,
    allowedOrigins: [websiteOrigin],
    fetchCamera: async (url, { signal }) => {
      if (!state.online) throw new Error('Test camera is offline.');
      const endpoint = new URL(url).pathname.slice(1);
      state.calls[endpoint]++;
      if (state.delay) await new Promise((resolve) => setTimeout(resolve, state.delay));
      if (endpoint === 'status') return Response.json(state.telemetry);
      if (endpoint === 'jpg')
        return new Response(jpeg, { headers: { 'Content-Type': 'image/jpeg' } });
      let cleanup;
      const body = new ReadableStream({
        start(controller) {
          state.activeStreams++;
          let ended = false;
          const finish = (error) => {
            if (ended) return;
            ended = true;
            clearInterval(timer);
            state.activeStreams--;
            signal.removeEventListener('abort', abort);
            if (error) controller.error(error);
          };
          const abort = () => finish(new DOMException('Test stream cancelled.', 'AbortError'));
          const send = () => {
            if (ended) return;
            if (!state.online || state.streamBroken) {
              finish(new Error('Test camera stream disconnected.'));
              return;
            }
            const header = Buffer.from(
              `\r\n--smartfarm-test\r\nContent-Type: image/jpeg\r\nContent-Length: ${jpeg.length}\r\n\r\n`,
            );
            controller.enqueue(header);
            controller.enqueue(jpeg);
          };
          const timer = setInterval(send, 200);
          cleanup = () => finish();
          signal.addEventListener('abort', abort, { once: true });
          if (signal.aborted) abort();
          else send();
        },
        cancel() {
          cleanup?.();
        },
      });
      return new Response(body, {
        headers: { 'Content-Type': 'multipart/x-mixed-replace;boundary=smartfarm-test' },
      });
    },
  });
  const server = createServer(
    { key: await fs.readFile(key), cert: await fs.readFile(cert) },
    app,
  ).listen(0, '0.0.0.0');
  await new Promise((resolve) => server.once('listening', resolve));
  return {
    state,
    url: `https://${address}:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(resolve);
      }).finally(() => fs.rm(certificates, { recursive: true, force: true })),
  };
}
