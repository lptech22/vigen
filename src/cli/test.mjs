import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from '../core/config.mjs';
import {
  parseArgs, ensureDir, line, section, color, ok, bad, warn, info, humanBytes, nowStamp,
} from '../core/util.mjs';
import { launchBrowser } from '../render/browser.mjs';
import { startHost } from '../render/host.mjs';
import { renderVideo } from '../render/render.mjs';
import { concatSegments, probeVideo } from '../render/encode.mjs';
import { demoStoryboard } from '../story/storyboard.mjs';

export async function testCommand(argv) {
  const { flags } = parseArgs(argv);
  const cfg = loadConfig();
  const { width, height, fps } = cfg.output;

  const duration = Number(flags.duration ?? 5);
  const totalFrames = Math.round(duration * fps);
  const capture = String(flags.capture || 'png');

  const out = path.resolve(String(flags.out || path.join(cfg.render.tempDir, 'smoke.mp4')));
  const work = path.resolve(String(flags.work || path.join(path.dirname(out), 'work')));
  ensureDir(path.dirname(out));
  ensureDir(work);

  const stopAt = flags['stop-at'] ? Number(flags['stop-at']) : null;
  const hashFile = flags['hash-file'] ? path.resolve(String(flags['hash-file'])) : null;
  const hashEvery = flags['hash-every'] ? Number(flags['hash-every']) : 0;
  const storyboard = demoStoryboard(cfg, duration);

  line(`${color.bold('Vigen test')} ${color.gray(`— ${duration} dtk @ ${width}x${height} ${fps}fps · ${capture}`)}`);
  info(`output : ${out}`);
  info(`kerja  : ${work}`);
  if (stopAt) warn(`mode uji resume: berhenti setelah ${stopAt} frame`);

  const host = await startHost({ onFrame: async () => {} });
  const browser = await launchBrowser(cfg, {
    width, height, stageUrl: host.stageUrl, postUrl: host.postUrl, storyboard,
  });

  let result;
  const started = Date.now();
  try {
    result = await renderVideo({
      cfg,
      session: browser.session,
      host,
      workDir: work,
      outDir: path.dirname(out),
      totalFrames,
      options: {
        chunk: flags.chunk ? Number(flags.chunk) : cfg.render.chunk,
        stopAt,
        force: Boolean(flags.force),
        hashEvery,
        hashFile,
        capture,
        quiet: Boolean(flags.quiet),
        storyHash: crypto.createHash('sha256').update(JSON.stringify(storyboard)).digest('hex').slice(0, 16),
      },
    });
  } finally {
    await browser.close();
    await host.close();
  }

  const totalMs = Date.now() - started;
  const rendered = result.framesRendered;
  const avgFps = rendered / Math.max(totalMs / 1000, 0.001);
  const msPerFrame = rendered ? totalMs / rendered : 0;

  section('Hasil render');
  ok(`${rendered} frame dirender` + (result.framesSkipped ? `, ${result.framesSkipped} frame dilewati (resume)` : ''));
  ok(`${avgFps.toFixed(2)} fps rata-rata (${msPerFrame.toFixed(0)} ms/frame, total ${(totalMs / 1000).toFixed(1)} dtk)`);
  if (result.totalBytes) info(`data frame terkirim ${humanBytes(result.totalBytes)}`);

  if (result.stopped) {
    warn(`dihentikan sesuai --stop-at (${stopAt} frame). Jalankan lagi tanpa --stop-at untuk melanjutkan.`);
    return 3;
  }

  const video = await concatSegments(cfg, result.segmentFiles, out);
  const probe = await probeVideo(cfg, video);
  const st = probe.streams?.[0] || {};
  const fmt = probe.format || {};
  const gotFrames = Number(st.nb_read_frames || 0);
  const gotDuration = Number(fmt.duration || st.duration || 0);
  const size = Number(fmt.size || fs.statSync(video).size);

  const checks = [
    { name: 'jumlah frame', pass: gotFrames === totalFrames, detail: `${gotFrames}/${totalFrames}` },
    { name: 'durasi', pass: Math.abs(gotDuration - duration) <= 1 / fps + 0.001, detail: `${gotDuration.toFixed(3)} dtk (target ${duration.toFixed(3)})` },
    { name: 'codec', pass: st.codec_name === 'h264', detail: String(st.codec_name) },
    { name: 'pixel format', pass: st.pix_fmt === 'yuv420p', detail: String(st.pix_fmt) },
    { name: 'resolusi', pass: st.width === width && st.height === height, detail: `${st.width}x${st.height}` },
  ];

  section('Validasi');
  for (const c of checks) {
    if (c.pass) ok(`${c.name}: ${c.detail}`);
    else bad(`${c.name}: ${c.detail}`);
  }

  const frames60 = 60 * fps;
  const eta60 = Math.round((frames60 * msPerFrame) / 1000);
  section('Ringkasan');
  ok(`video: ${video}`);
  info(`ukuran ${humanBytes(size)} · ${(size / duration / 1024).toFixed(0)} KB/dtk`);
  info(`estimasi video 60 dtk: ${Math.floor(eta60 / 60)} m ${eta60 % 60} s`);
  info(`uji selesai ${nowStamp()}`);

  const allPass = checks.every((c) => c.pass);
  if (allPass) {
    ok('semua validasi lulus.');
    return 0;
  }
  bad('ada validasi yang gagal.');
  return 1;
}
