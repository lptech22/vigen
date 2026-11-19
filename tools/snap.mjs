import fs from 'node:fs';
import { loadConfig } from '../src/core/config.mjs';
import { launchBrowser } from '../src/render/browser.mjs';
import { startHost } from '../src/render/host.mjs';

const cfg = loadConfig();
const { width, height } = cfg.output;
const t = Number(process.argv[2] || 2.5);
const fmt = process.argv[3] || 'jpeg:0.95';
const out = process.argv[4] || `/data/data/com.termux/files/usr/tmp/vigen/snap.${fmt.startsWith('png') ? 'png' : 'jpg'}`;

let saved = null;
const host = await startHost({ onFrame: async (buf) => { saved = buf; } });
const browser = await launchBrowser(cfg, { width, height, stageUrl: host.stageUrl, postUrl: host.postUrl });
const r = await browser.session.send('Runtime.evaluate', {
  expression: `window.__sendFrame(${t}, '${fmt}')`, awaitPromise: true, returnByValue: true,
}, 60000);
if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
fs.writeFileSync(out, saved);
console.log(`${out}  ${(saved.length / 1024).toFixed(0)} KB`);
await browser.close();
await host.close();
