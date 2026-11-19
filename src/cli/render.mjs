import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, ensureDir, line, section, color, ok, info, warn, bad, humanBytes, nowStamp } from '../core/util.mjs';
import { hashJson } from '../core/media.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';
import { subtitleStats, writeSubtitleFiles } from '../story/subs.mjs';
import { resolveSubtitleOption } from './subtitle-option.mjs';
import { subtitleOptionsFrom, validateSubtitles } from './subs.mjs';
import { launchBrowser } from '../render/browser.mjs';
import { startHost } from '../render/host.mjs';
import { renderVideo } from '../render/render.mjs';
import { concatSegments, probeVideo } from '../render/encode.mjs';
import { muxAudio } from '../audio/mix.mjs';
import { probeAudio, probeDuration } from '../audio/probe.mjs';

function fmtScenes(storyboard) {
  return storyboard.scenes
    .map((s) => `${s.id}:${s.type} ${s.start.toFixed(2)}–${s.end.toFixed(2)}s`)
    .join(' · ');
}

function num(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export async function renderCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);
  const subOpt = await resolveSubtitleOption({ cfg, project, flags });
  const result = await runRender({ cfg, project, flags, subOpt });
  return result.code;
}

/**
 * Render final yang bisa dipakai ulang oleh `render`, `finish`, dan `make`.
 * `subOpt` boleh sudah di-resolve supaya pipeline tidak bertanya dua kali.
 */
export async function runRender({
  cfg, project, flags = {}, subOpt = null, quiet = false,
}) {
  const { width, height, fps } = cfg.output;
  const opt = subOpt || await resolveSubtitleOption({ cfg, project, flags });
  const subsOptions = subtitleOptionsFrom(cfg, flags);

  const { storyboard, timeline } = await prepareStoryboard({
    cfg, project, retime: !flags['no-retime'], subs: opt.enabled, subsOptions,
  });

  const subStats = subtitleStats(storyboard.subs || []);
  const subProblems = opt.enabled ? validateSubtitles(storyboard.subs || [], subsOptions) : [];

  const totalFrames = Math.max(1, Math.round(storyboard.duration * fps));
  const duration = totalFrames / fps;
  const storyHash = hashJson(storyboard).slice(0, 16);
  const capture = String(flags.capture || 'png');

  const work = path.join(project.dir, '.work', 'render');
  const outDir = ensureDir(path.join(project.dir, 'out'));
  const out = flags.out
    ? path.resolve(String(flags.out))
    : path.join(outDir, `${project.slug}_${width}x${height}.mp4`);
  ensureDir(path.dirname(out));
  ensureDir(work);

  if (!quiet) {
    line(`${color.bold('Vigen render')} ${color.gray(`— ${project.name}`)}`);
    ok(`storyboard: ${storyboard.scenes.length} scene · ${duration.toFixed(3)} dtk · ${width}x${height} @${fps}fps`);
    info(`${totalFrames} frame · ${capture}`);
  }
  if (opt.enabled) {
    const src = { flag: 'flag', asked: 'pilihan kamu', project: 'diingat project', config: 'default config' }[opt.source] || opt.source;
    if (subStats.count) {
      if (!quiet) {
        ok(`subtitle: ${subStats.count} potongan · maks ${subStats.maxLines} baris (${src})`);
      }
      const files = writeSubtitleFiles(project.dir, storyboard.subs, { dir: outDir });
      if (!quiet) info(`ekspor: ${path.basename(files.srt)} + ${path.basename(files.ass)}`);
      for (const p of subProblems.slice(0, 4)) warn(`subtitle ${p}`);
    } else if (!quiet) {
      warn('subtitle aktif tetapi narasi kosong — render tanpa subtitle. Isi `narasi` di scene.js.');
    }
  } else if (!quiet) {
    info(`subtitle: nonaktif (${opt.source === 'flag' ? '--no-subs' : 'diingat project'})`);
  }

  if (timeline) {
    const labels = {
      voice: 'durasi voice per scene',
      'voice-single': '1 audio utuh · dibagi proporsional',
      'voice-blocks': 'blok audio · dibagi proporsional',
      estimate: 'estimasi naskah',
    };
    if (!quiet) info(`timeline: ${labels[timeline.source] || timeline.source}`);
  }
  for (const n of storyboard.notes) warn(n);

  const audioFile = path.join(outDir, 'audio.wav');
  const hasAudio = fs.existsSync(audioFile) && !flags['no-audio'];
  if (hasAudio && timeline) {
    try {
      const ad = await probeDuration(cfg, audioFile);
      const diff = ad - timeline.totalDuration;
      if (Math.abs(diff) > 0.5) {
        warn(`durasi audio (${ad.toFixed(2)} dtk) beda ${diff > 0 ? '+' : ''}${diff.toFixed(2)} dtk dari voice timeline. ` +
          `Jalankan ulang: vigen audio "${project.name}"`);
      }
    } catch { /* probe gagal: mux tetap dicoba */ }
  } else if (!hasAudio && !quiet) {
    info('audio: tidak dipakai (out/audio.wav belum ada atau --no-audio)');
  }

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
      outDir,
      totalFrames,
      options: {
        chunk: flags.chunk ? Number(flags.chunk) : cfg.render.chunk,
        force: Boolean(flags.force),
        capture,
        quiet: Boolean(flags.quiet || quiet),
        storyHash,
      },
    });
  } finally {
    await browser.close();
    await host.close();
  }

  const renderMs = Date.now() - started;
  const fpsActual = result.framesRendered / Math.max(renderMs / 1000, 0.001);
  const videoOnly = path.join(work, 'video-only.mp4');
  await concatSegments(cfg, result.segmentFiles, videoOnly);

  let final = videoOnly;
  if (hasAudio) {
    const tmp = path.join(work, 'mux.mp4');
    await muxAudio(cfg, { video: videoOnly, audio: audioFile, out: tmp });
    try { fs.renameSync(tmp, out); }
    catch { fs.copyFileSync(tmp, out); fs.rmSync(tmp, { force: true }); }
    final = out;
  } else {
    try { fs.renameSync(videoOnly, out); }
    catch { fs.copyFileSync(videoOnly, out); fs.rmSync(videoOnly, { force: true }); }
    final = out;
  }

  const probe = await probeVideo(cfg, final);
  const st = probe.streams?.[0] || {};
  const fmt = probe.format || {};
  const gotFrames = Number(st.nb_read_frames || 0);
  const gotDuration = Number(fmt.duration || st.duration || 0);
  const size = Number(fmt.size || fs.statSync(final).size);

  const checks = [
    { name: 'jumlah frame', pass: gotFrames === totalFrames, detail: `${gotFrames}/${totalFrames}` },
    { name: 'durasi', pass: Math.abs(gotDuration - duration) <= 1 / fps + 0.01, detail: `${gotDuration.toFixed(3)} dtk (target ${duration.toFixed(3)})` },
    { name: 'codec', pass: st.codec_name === 'h264', detail: String(st.codec_name) },
    { name: 'pixel format', pass: st.pix_fmt === 'yuv420p', detail: String(st.pix_fmt) },
    { name: 'resolusi', pass: st.width === width && st.height === height, detail: `${st.width}x${st.height}` },
  ];

  if (hasAudio) {
    const a = await probeAudio(cfg, final);
    checks.push({
      name: 'audio', pass: a.channels === 2 && a.sampleRate === 48000,
      detail: `${a.sampleRate} Hz ${a.channels === 1 ? 'mono' : 'stereo'} · ${a.codec}`,
    });
  }

  if (!quiet) {
    section('Hasil render');
    ok(`${result.framesRendered} frame · ${fpsActual.toFixed(2)} fps · ${(renderMs / 1000).toFixed(1)} dtk`);
    for (const c of checks) {
      if (c.pass) ok(`${c.name}: ${c.detail}`);
      else bad(`${c.name}: ${c.detail}`);
    }

    section('Ringkasan');
    ok(final);
    info(`${humanBytes(size)} · ${gotDuration.toFixed(3)} dtk · ${hasAudio ? 'dengan audio' : 'tanpa audio'}`);
    info(`scene: ${fmtScenes(storyboard)}`);
    info(`selesai ${nowStamp()}`);
  }

  const allPass = checks.every((c) => c.pass);
  if (!quiet) {
    if (allPass) {
      ok('video lulus validasi.');
      if (!hasAudio && !flags['no-audio']) info(`tambahkan audio: vigen audio "${project.name}" lalu render ulang.`);
    } else {
      bad('ada validasi yang gagal.');
    }
  }

  return {
    code: allPass ? 0 : 1,
    out: final,
    storyboard,
    timeline,
    duration,
    totalFrames,
    framesRendered: result.framesRendered,
    renderMs,
    fpsActual,
    checks,
    allPass,
    hasAudio,
    size,
    subStats,
    subOpt: opt,
    subtitleFiles: opt.enabled && subStats.count
      ? {
        srt: path.join(outDir, 'subtitle.srt'),
        ass: path.join(outDir, 'subtitle.ass'),
      }
      : null,
  };
}
