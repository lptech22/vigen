import { loadConfig } from '../src/core/config.mjs';
import { launchBrowser } from '../src/render/browser.mjs';
import { startHost } from '../src/render/host.mjs';

const cfg = loadConfig();
const { width, height, fps } = cfg.output;

let sink = null;
const host = await startHost({ onFrame: async (buf) => { if (sink) await sink(buf); } });
const browser = await launchBrowser(cfg, { width, height, stageUrl: host.stageUrl, postUrl: host.postUrl });

async function timeIt(label, fmt, n = 6) {
  let bytes = 0;
  let total = 0;
  sink = async (buf) => { bytes += buf.length; };
  for (let i = 0; i < n; i++) {
    const t = (i * 7) / fps;
    const a = Date.now();
    const r = await browser.session.send('Runtime.evaluate', {
      expression: `window.__sendFrame(${t.toFixed(4)}, '${fmt}')`,
      awaitPromise: true, returnByValue: true,
    }, 60000);
    if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
    total += Date.now() - a;
  }
  console.log(`${label.padEnd(18)} ${(total / n).toFixed(0)} ms/frame  ~${(bytes / n / 1024).toFixed(0)} KB  → ${(1000 / (total / n)).toFixed(1)} fps`);
}

await timeIt('POST raw RGBA', 'raw');
await timeIt('POST png', 'png');
await timeIt('POST jpeg q92', 'jpeg:0.92');
await timeIt('POST webp q92', 'webp:0.92');

await browser.close();
await host.close();
