import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { timingSafeEqual } from 'node:crypto';
import { cameraOrigin } from './camera.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

async function readLimitedBody(body, limit) {
  const chunks = [];
  let length = 0;
  for await (const chunk of body) {
    length += chunk.byteLength;
    if (length > limit) throw new Error('Camera response is too large.');
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export function createApp({
  fetchCamera = fetch,
  production = process.env.NODE_ENV === 'production',
  gatewayToken = process.env.GATEWAY_TOKEN || '',
  allowedOrigins = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
} = {}) {
  if (gatewayToken && !/^[A-Za-z0-9._~+/-]{32,256}={0,2}$/.test(gatewayToken))
    throw new Error('GATEWAY_TOKEN must contain 32–256 URL-safe random characters.');
  if (allowedOrigins.length && !gatewayToken)
    throw new Error(
      'GATEWAY_TOKEN is required before allowing another website to use this gateway.',
    );
  for (const origin of allowedOrigins) {
    const url = new URL(origin);
    if (url.origin !== origin || !['https:', 'http:'].includes(url.protocol))
      throw new Error('ALLOWED_ORIGINS must contain exact origins, not wildcards or paths.');
  }
  const expectedToken = Buffer.from(`Bearer ${gatewayToken}`);
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    const origin = req.get('origin');
    if (!origin && req.get('sec-fetch-site') === 'cross-site') {
      return res.status(403).json({
        error: 'Cross-site camera embedding is not allowed. Use the authenticated dashboard.',
      });
    }
    let sameOrigin = false;
    try {
      sameOrigin = !!origin && new URL(origin).host === req.get('host');
    } catch {
      /* Reject malformed origins. */
    }
    if (origin && !sameOrigin && !allowedOrigins.includes(origin)) {
      return res
        .status(403)
        .json({ error: 'This website is not in the gateway’s ALLOWED_ORIGINS list.' });
    }
    if (origin) {
      res.set('Access-Control-Allow-Origin', origin);
      res.vary('Origin');
    }
    if (req.method === 'OPTIONS') {
      res.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
      res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      if (req.get('Access-Control-Request-Private-Network') === 'true')
        res.set('Access-Control-Allow-Private-Network', 'true');
      return res.sendStatus(204);
    }
    next();
  });

  app.get('/api/health', (_req, res) =>
    res.json({ service: 'smartfarm-camera-gateway', ok: true, authRequired: !!gatewayToken }),
  );

  app.use('/api/camera', (req, res, next) => {
    if (gatewayToken) {
      const supplied = Buffer.from(req.get('authorization') || '');
      if (supplied.length !== expectedToken.length || !timingSafeEqual(supplied, expectedToken)) {
        res.set('WWW-Authenticate', 'Bearer');
        return res.status(401).json({ error: 'A valid gateway access key is required.' });
      }
    }
    next();
  });

  app.get('/api/camera/:endpoint', async (req, res) => {
    const { endpoint } = req.params;
    if (!['status', 'jpg', 'stream'].includes(endpoint))
      return res.status(404).json({ error: 'Unknown camera endpoint.' });
    let origin;
    try {
      origin = cameraOrigin(req.query.host, endpoint === 'stream');
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }

    const controller = new AbortController();
    let timeout = setTimeout(() => controller.abort(), 5000);
    res.on('close', () => {
      clearTimeout(timeout);
      controller.abort();
    });

    try {
      const response = await fetchCamera(`${origin}/${endpoint}`, {
        signal: controller.signal,
        redirect: 'error',
      });
      if (!response.ok || !response.body)
        throw new Error(`Camera returned HTTP ${response.status}.`);
      const contentType = response.headers.get('content-type') || '';
      const expected =
        endpoint === 'status'
          ? 'application/json'
          : endpoint === 'jpg'
            ? 'image/jpeg'
            : 'multipart/x-mixed-replace';
      if (contentType.split(';')[0].trim().toLowerCase() !== expected)
        throw new Error('Unexpected camera response. Check the IP address and firmware.');
      res.set('Cache-Control', 'no-store');
      if (endpoint === 'status') {
        const text = (await readLimitedBody(response.body, 8192)).toString('utf8');
        return res.json(JSON.parse(text));
      }
      if (endpoint === 'jpg') {
        const image = await readLimitedBody(response.body, 5 * 1024 * 1024);
        return res.type('jpeg').send(image);
      }
      clearTimeout(timeout);
      res.set('Content-Type', contentType);
      res.set('X-Accel-Buffering', 'no');
      const stream = Readable.fromWeb(response.body);
      timeout = setTimeout(() => controller.abort(), 15_000);
      stream.on('data', () => {
        clearTimeout(timeout);
        timeout = setTimeout(() => controller.abort(), 15_000);
      });
      stream.on('error', () => {
        if (!res.destroyed) res.destroy();
      });
      stream.pipe(res);
    } catch (error) {
      controller.abort();
      if (res.headersSent || res.destroyed) return;
      res.status(502).json({
        error:
          error.name === 'AbortError'
            ? 'Camera timed out. Check its IP address and connect this computer to F450-ESP32-DRONE Wi-Fi.'
            : `Could not reach the camera. Make sure the gateway and ESP32-CAM are on the same Wi-Fi. ${error.message === 'fetch failed' ? '' : error.message}`.trim(),
      });
    } finally {
      if (endpoint !== 'stream' || res.writableEnded) {
        clearTimeout(timeout);
        controller.abort();
      }
    }
  });

  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  if (production) {
    app.use(express.static(path.join(root, 'dist')));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(root, 'dist', 'index.html')));
  }
  return app;
}
