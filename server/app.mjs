import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
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
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Referrer-Policy', 'same-origin');
    next();
  });

  app.get('/api/health', (_req, res) =>
    res.json({ service: 'smartfarm-camera-gateway', ok: true }),
  );

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
      if (!contentType.includes(expected))
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
