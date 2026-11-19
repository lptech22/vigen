import { loadConfig } from '../src/core/config.mjs';
import { launchBrowser } from '../src/render/browser.mjs';

const cfg = loadConfig();
const { width, height, fps } = cfg.output;
const browser = await launchBrowser(cfg, { width, height });
const s = browser.session;

async function evalJson(expr) {
  const r = await s.send('Runtime.evaluate', { expression: expr, returnByValue: true }, 60000);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
  return r.result.value;
}

async function timeIt(label, expr, n = 8) {
  const times = [];
  let bytes = 0;
  for (let i = 0; i < n; i++) {
    const t = (i * 7) / fps;
    const a = Date.now();
    const v = await s.send('Runtime.evaluate', { expression: expr(t), returnByValue: true }, 60000);
    times.push(Date.now() - a);
    if (v.exceptionDetails) throw new Error(JSON.stringify(v.exceptionDetails));
    const val = v.result.value;
    if (typeof val === 'string') bytes += val.length;
  }
  times.sort((a, b) => a - b);
  console.log(`${label.padEnd(22)} median ${String(times[Math.floor(n / 2)]).padStart(4)} ms  min ${String(times[0]).padStart(4)}  max ${String(times[n - 1]).padStart(4)}  ${bytes ? `~${(bytes / n / 1024).toFixed(0)} KB/frame` : ''}`);
}

// hanya enkode di dalam page, tanpa transfer data
const bench = await evalJson(`(() => { const out=[]; for (let i=0;i<8;i++){ out.push(window.__bench(${(3 / fps).toFixed(4)})); } return out; })()`);
console.log('encode PNG di page  :', bench.map((b) => `${b.encodeMs}ms/${(b.bytes / 1024).toFixed(0)}KB`).join('  '));

await timeIt('PNG toDataURL', (t) => `window.__frameEnc(${t}, 'image/png')`);
await timeIt('JPEG q95', (t) => `window.__frameEnc(${t}, 'image/jpeg', 0.95)`);
await timeIt('WebP q0.9', (t) => `window.__frameEnc(${t}, 'image/webp', 0.9)`);
await timeIt('evaluate kosong', () => '1+1');

await browser.close();
