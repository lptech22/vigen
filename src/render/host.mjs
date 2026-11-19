import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from '../core/config.mjs';

/**
 * Host lokal: menyajikan stage.html (same-origin) dan menerima frame biner
 * lewat POST /frame tanpa base64 — jauh lebih cepat daripada transfer via CDP.
 */
export async function startHost({ onFrame }) {
  const stageFile = path.join(ROOT, 'src/runtime/stage.html');
  if (!fs.existsSync(stageFile)) throw new Error(`stage.html tidak ditemukan: ${stageFile}`);

  let handler = onFrame;

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url.split('?')[0] === '/stage.html') {
        const html = fs.readFileSync(stageFile);
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store',
          'Content-Length': html.length,
        });
        res.end(html);
        return;
      }

      if (req.method === 'POST' && req.url.split('?')[0] === '/frame') {
        const chunks = [];
        for await (const c of req) chunks.push(c);
        const buf = Buffer.concat(chunks);
        await handler(buf, req);
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('ok');
        return;
      }

      if (req.method === 'GET' && req.url.split('?')[0] === '/health') {
        res.writeHead(200).end('ok');
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('not found');
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'text/plain' });
      res.end(err.message);
    }
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const { port } = server.address();
  const base = `http://127.0.0.1:${port}`;

  return {
    port,
    stageUrl: `${base}/stage.html`,
    postUrl: `${base}/frame`,
    healthUrl: `${base}/health`,
    setHandler(fn) { handler = fn; },
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
}
