import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { parseArgs, ensureDir, ok, info, humanBytes, imageSize } from '../core/util.mjs';
import { launchBrowser } from '../render/browser.mjs';
import { startHost } from '../render/host.mjs';

export async function stillCommand(argv) {
  const { flags } = parseArgs(argv);
  const cfg = loadConfig();
  const at = Number(flags.at ?? 0);
  if (!Number.isFinite(at) || at < 0) throw new Error('--at harus angka detik, contoh: vigen still --at 2.5');

  const fmt = String(flags.format || 'png');
  let out = path.resolve(String(flags.out || path.join(cfg.render.tempDir, 'still.png')));
  if (flags.out && !path.extname(out)) out += fmt.startsWith('png') ? '.png' : '.jpg';
  ensureDir(path.dirname(out));

  const { width, height } = cfg.output;
  info(`merender 1 frame pada t=${at}s (${width}x${height}, ${fmt})…`);

  let saved = null;
  const host = await startHost({ onFrame: async (buf) => { saved = buf; } });
  const browser = await launchBrowser(cfg, { width, height, stageUrl: host.stageUrl, postUrl: host.postUrl });

  try {
    const started = Date.now();
    const res = await browser.session.send('Runtime.evaluate', {
      expression: `window.__sendFrame(${at}, '${fmt}')`,
      awaitPromise: true,
      returnByValue: true,
    }, 60000);
    if (res.exceptionDetails) throw new Error(res.exceptionDetails.text || 'render gagal');
    const ms = Date.now() - started;
    if (!saved) throw new Error('frame tidak diterima dari stage');

    fs.writeFileSync(out, saved);
    const dim = imageSize(saved);
    ok(`tersimpan: ${out}`);
    info(`ukuran ${humanBytes(saved.length)} · ${dim ? `${dim.width}x${dim.height}` : 'dimensi tidak terbaca'} · ${ms} ms`);
    return 0;
  } finally {
    await browser.close();
    await host.close();
  }
}
