#!/usr/bin/env node
/**
 * Render lembar preview semua karakter ke PNG.
 * Contoh: node tools/cast-sheet.mjs [out.png]
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from '../src/core/config.mjs';
import { ensureDir } from '../src/core/util.mjs';
import { launchBrowser } from '../src/render/browser.mjs';

const cfg = loadConfig();
const out = path.resolve(process.argv[2] || path.join(cfg.render.tempDir, 'cast-sheet.png'));
ensureDir(path.dirname(out));

const sheet = path.join(import.meta.dirname, 'cast-sheet.html');
if (!fs.existsSync(sheet)) throw new Error(`tidak ada: ${sheet}`);

const browser = await launchBrowser(cfg, {
  width: cfg.output.width,
  height: cfg.output.height,
  stageUrl: pathToFileURL(sheet).href,
});

try {
  const r = await browser.session.send('Runtime.evaluate', {
    expression: 'window.__snapshot()',
    returnByValue: true,
  }, 60000);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text || 'snapshot gagal');
  const value = r.result.value || {};
  if (!value.data) throw new Error('canvas tidak mengembalikan data');
  const b64 = String(value.data).split(',')[1];
  fs.writeFileSync(out, Buffer.from(b64, 'base64'));
  console.log(`tersimpan: ${out}`);
  console.log(`karakter: ${value.names.length} · hilang: ${value.missing}`);
  if (value.missing) process.exitCode = 1;
} finally {
  await browser.close();
}
