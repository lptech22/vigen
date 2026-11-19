import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, ensureDir, ok, warn, info, humanBytes, imageSize, color, line } from '../core/util.mjs';
import { launchBrowser } from '../render/browser.mjs';
import { startHost } from '../render/host.mjs';
import { demoStoryboard } from '../story/storyboard.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';

export async function stillCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();

  let storyboard;
  let project = null;
  if (rest.length) {
    project = resolveProject(cfg.workspace, rest[0]);
    ({ storyboard } = await prepareStoryboard({ cfg, project, retime: !flags['no-retime'] }));
  } else {
    storyboard = demoStoryboard(cfg, 5);
  }

  let at = Number(flags.at ?? 0);
  if (!Number.isFinite(at) || at < 0) throw new Error('--at harus angka detik, contoh: vigen still --at 2.5');

  let scene = null;
  if (flags.scene) {
    scene = storyboard.scenes.find((s) => s.id === String(flags.scene));
    if (!scene) {
      throw new Error(`scene "${flags.scene}" tidak ada. Pilihan: ${storyboard.scenes.map((s) => s.id).join(', ')}`);
    }
    at = scene.start + (flags.at !== undefined ? at : 0.5);
  }
  if (at > storyboard.duration) {
    warn(`--at ${at}s melewati durasi ${storyboard.duration}s; memakai frame terakhir.`);
    at = Math.max(0, storyboard.duration - 1 / cfg.output.fps);
  }

  const fmt = String(flags.format || 'png');
  let out = path.resolve(String(flags.out || path.join(cfg.render.tempDir, 'still.png')));
  if (flags.out && !path.extname(out)) out += fmt.startsWith('png') ? '.png' : '.jpg';
  ensureDir(path.dirname(out));

  const { width, height } = cfg.output;
  const where = scene ? `${project.name} · ${scene.id} (${scene.type})` : project ? project.name : 'demo';
  info(`merender 1 frame pada t=${at.toFixed(3)}s (${where}, ${width}x${height}, ${fmt})…`);

  let saved = null;
  let violations = [];
  const host = await startHost({ onFrame: async (buf) => { saved = buf; } });
  const browser = await launchBrowser(cfg, {
    width, height, stageUrl: host.stageUrl, postUrl: host.postUrl, storyboard,
  });

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
    violations = res.result?.value?.violations || [];

    fs.writeFileSync(out, saved);
    const dim = imageSize(saved);
    ok(`tersimpan: ${out}`);
    info(`ukuran ${humanBytes(saved.length)} · ${dim ? `${dim.width}x${dim.height}` : 'dimensi tidak terbaca'} · ${ms} ms`);

    if (violations.length) {
      line(color.gray('  teks keluar safe area:'));
      for (const v of violations.slice(0, 8)) {
        warn(`${v.id}: ${(v.over || []).join(', ')}`);
      }
      if (violations.length > 8) warn(`… dan ${violations.length - 8} elemen lain`);
      info('perbaiki scene.js, lalu jalankan: vigen check');
      return 1;
    }
    return 0;
  } finally {
    await browser.close();
    await host.close();
  }
}
