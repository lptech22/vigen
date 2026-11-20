#!/usr/bin/env node
/**
 * Benchmark diorama (tahap 0).
 *
 * Mengukur biaya render nyata: draw canvas -> encode PNG -> POST -> ffmpeg.
 * Dua mode dibandingkan:
 *   text : latar + header + subtitle (beban teks, seperti engine sekarang)
 *   full : latar + 4 prop isometrik + karakter + partikel + kamera + teks
 *
 * Contoh:
 *   node tools/bench-diorama.mjs --frames 90
 *   node tools/bench-diorama.mjs --frames 60 --modes full
 */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { loadConfig, ROOT } from '../src/core/config.mjs';
import { ensureDir, humanBytes } from '../src/core/util.mjs';
import { launchBrowser } from '../src/render/browser.mjs';
import { openEncoder } from '../src/render/encode.mjs';

const args = process.argv.slice(2);
const argNum = (name, fallback) => {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : fallback;
};
const frames = Math.max(10, argNum('--frames', 90));
const fps = Math.max(1, argNum('--fps', 30));
const modeArg = (() => {
  const i = args.indexOf('--modes');
  return i >= 0 && args[i + 1] ? args[i + 1].split(',') : ['text', 'full'];
})();
const modes = modeArg.filter((m) => m === 'text' || m === 'full');
const capture = (() => {
  const i = args.indexOf('--capture');
  return i >= 0 && args[i + 1] ? String(args[i + 1]) : 'png';
})();
const warmup = 4;

const cfg = loadConfig();
const W = cfg.output.width;
const H = cfg.output.height;
const benchDir = ensureDir(path.join(cfg.render.tempDir, 'bench'));
const stageFile = path.join(ROOT, 'tools/bench-stage.html');
if (!fs.existsSync(stageFile)) {
  console.error(`✗ ${stageFile} tidak ditemukan`);
  process.exit(1);
}

function startBenchHost() {
  let handler = async () => {};
  const server = http.createServer(async (req, res) => {
    const url = req.url.split('?')[0];
    if (req.method === 'GET' && url === '/stage.html') {
      const html = fs.readFileSync(stageFile);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
      res.end(html);
      return;
    }
    if (req.method === 'POST' && url === '/frame') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      await handler(Buffer.concat(chunks));
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('ok');
      return;
    }
    res.writeHead(404).end('not found');
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      const base = `http://127.0.0.1:${port}`;
      resolve({
        stageUrl: `${base}/stage.html`,
        postUrl: `${base}/frame`,
        setHandler(fn) { handler = fn; },
        close() { return new Promise((r) => server.close(() => r())); },
      });
    });
  });
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};
const mean = (arr) => arr.reduce((a, b) => a + b, 0) / Math.max(1, arr.length);

async function runMode(host, mode) {
  const outFile = path.join(benchDir, `bench-${mode}.mp4`);
  fs.rmSync(outFile, { force: true });
  const enc = openEncoder(cfg, outFile, { fps, width: W, height: H, input: 'image', crf: cfg.output.crf });

  let sinkBytes = 0;
  host.setHandler(async (buf) => {
    sinkBytes += buf.length;
    await enc.write(buf);
  });

  const browser = await launchBrowser(cfg, {
    width: W,
    height: H,
    stageUrl: host.stageUrl,
    postUrl: host.postUrl,
    storyboard: { mode, capture, duration: frames / fps, width: W, height: H },
  });

  try {
    // warm-up: font raster, path cache
    for (let i = 0; i < warmup; i++) {
      const r = await browser.session.send('Runtime.evaluate', {
        expression: `window.__sendFrame(${(i / fps).toFixed(4)})`,
        awaitPromise: true,
        returnByValue: true,
      }, 60000);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'warm-up gagal');
    }

    const samples = [];
    const startedAt = Date.now();
    for (let i = 0; i < frames; i++) {
      const t = i / fps;
      const t0 = Date.now();
      const r = await browser.session.send('Runtime.evaluate', {
        expression: `window.__sendFrame(${Number(t.toFixed(6))})`,
        awaitPromise: true,
        returnByValue: true,
      }, 60000);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || `frame ${i} gagal`);
      const v = r.result.value || {};
      samples.push({ ...v, wallMs: Date.now() - t0 });
      process.stdout.write(`\r  [${mode}] frame ${i + 1}/${frames}  ${(v.drawMs || 0).toFixed(0)} ms draw   `);
    }
    const elapsedMs = Date.now() - startedAt;
    await enc.finish();
    process.stdout.write('\n');

    const rate = frames / (elapsedMs / 1000);
    return {
      mode,
      capture,
      frames,
      elapsedMs,
      fps: rate,
      msPerFrame: elapsedMs / frames,
      drawMs: median(samples.map((s) => s.drawMs)),
      pngMs: median(samples.map((s) => s.pngMs)),
      postMs: median(samples.map((s) => s.postMs)),
      wallMs: median(samples.map((s) => s.wallMs)),
      bytes: sinkBytes / frames,
      fileBytes: fs.existsSync(outFile) ? fs.statSync(outFile).size : 0,
    };
  } finally {
    try { await enc.abort(); } catch { /* noop */ }
    await browser.close();
  }
}

const host = await startBenchHost();
const results = [];
try {
  for (const mode of modes) {
    results.push(await runMode(host, mode));
  }
} finally {
  await host.close();
}

const line = (s) => process.stdout.write(s + '\n');
line('');
line('  mode   fps    ms/frame   draw   enc    post   KB/frame   45 dtk');
line('  ' + '-'.repeat(66));
for (const r of results) {
  const mins = (1350 / r.fps) / 60;
  line(
    `  ${r.mode.padEnd(6)} ${r.fps.toFixed(1).padStart(4)}   ${r.msPerFrame.toFixed(0).padStart(5)}     ` +
    `${String(Math.round(r.drawMs)).padStart(4)}  ${String(Math.round(r.pngMs)).padStart(4)}   ` +
    `${String(Math.round(r.postMs)).padStart(4)}   ${(r.bytes / 1024).toFixed(0).padStart(5)}      ` +
    `${mins.toFixed(1)} mnt`
  );
}

const full = results.find((r) => r.mode === 'full');
const text = results.find((r) => r.mode === 'text');
if (full && text) {
  line('');
  line(`  biaya diorama: ${(text.fps - full.fps).toFixed(1)} fps lebih lambat ` +
    `(${((1 - full.fps / text.fps) * 100).toFixed(0)}%)`);
}

const summary = {
  at: new Date().toISOString(),
  device: { width: W, height: H, fps, crf: cfg.output.crf },
  capture,
  frames,
  results,
  verdict: full ? (full.fps >= 4 ? 'aman' : full.fps >= 3 ? 'batasi detail' : 'sederhanakan') : null,
};
const summaryFile = path.join(benchDir, `bench-diorama-${capture.split(':')[0]}.json`);
fs.writeFileSync(summaryFile, JSON.stringify(summary, null, 2) + '\n');
line('');
line(`  ${humanBytes(fs.statSync(summaryFile).size)} → ${summaryFile}`);
if (full) {
  line(`  putusan: ${summary.verdict}` +
    (full.fps >= 4 ? ' — lanjut bangun penuh' : full.fps >= 3 ? ' — kurangi bayangan/detail' : ' — sederhanakan desain'));
}
