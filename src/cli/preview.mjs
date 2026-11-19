import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { loadConfig } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, ensureDir, line, section, color, ok, info, warn, humanBytes, nowStamp } from '../core/util.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';
import { launchBrowser } from '../render/browser.mjs';
import { startHost } from '../render/host.mjs';
import { renderVideo } from '../render/render.mjs';
import { concatSegments, probeVideo } from '../render/encode.mjs';
import { muxAudio } from '../audio/mix.mjs';
import { probeAudio } from '../audio/probe.mjs';
import { subtitleStats, writeSubtitleFiles } from '../story/subs.mjs';
import { resolveSubtitleOption } from './subtitle-option.mjs';
import { subtitleOptionsFrom, validateSubtitles } from './subs.mjs';

/**
 * `vigen preview` — render draf cepat 540x960 CRF 30 untuk review alur & subtitle.
 * Tidak untuk diunggah: nama file selalu berakhiran `_preview.mp4`.
 */
export async function previewCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);

  const scale = flags.scale !== undefined ? Number(flags.scale) : Number(cfg.preview?.scale || 0.5);
  const crf = flags.crf !== undefined ? Number(flags.crf) : Number(cfg.preview?.crf || 30);
  const capture = String(flags.capture || cfg.preview?.capture || 'jpeg:0.92');
  const fps = cfg.output.fps;
  const width = Math.round(cfg.output.width * scale / 2) * 2;
  const height = Math.round(cfg.output.height * scale / 2) * 2;

  const subOpt = await resolveSubtitleOption({ cfg, project, flags });
  const { storyboard, timeline } = await prepareStoryboard({
    cfg, project, retime: !flags['no-retime'], subs: subOpt.enabled,
    subsOptions: subtitleOptionsFrom(cfg, flags),
  });

  const totalFrames = Math.max(1, Math.round(storyboard.duration * fps));
  const duration = totalFrames / fps;
  const storyHash = crypto.createHash('sha256')
    .update(JSON.stringify({ sb: storyboard, w: width, h: height, crf, pre: true }))
    .digest('hex').slice(0, 16);

  const work = path.join(project.dir, '.work', 'preview');
  ensureDir(work);
  const outDir = ensureDir(path.join(project.dir, 'out'));
  const out = flags.out
    ? path.resolve(String(flags.out))
    : path.join(outDir, `${project.slug}_preview.mp4`);
  ensureDir(path.dirname(out));

  line(`${color.bold('Vigen preview')} ${color.gray(`— ${project.name}`)}`);
  ok(`draf: ${storyboard.scenes.length} scene · ${duration.toFixed(3)} dtk · ${width}x${height} @${fps}fps · CRF ${crf}`);
  info(`${totalFrames} frame · ${capture} (bukan untuk upload)`);
  if (subOpt.enabled && storyboard.subs?.length) {
    const st = subtitleStats(storyboard.subs);
    ok(`subtitle: ${st.count} potongan`);
    writeSubtitleFiles(project.dir, storyboard.subs, { dir: outDir });
    const problems = validateSubtitles(storyboard.subs, subtitleOptionsFrom(cfg, flags));
    for (const p of problems.slice(0, 4)) warn(`subtitle ${p}`);
  } else {
    info('subtitle: nonaktif');
  }

  const audioFile = path.join(outDir, 'audio.wav');
  const hasAudio = fs.existsSync(audioFile) && !flags['no-audio'];
  if (!hasAudio) info('audio: tidak dipakai (out/audio.wav belum ada atau --no-audio)');

  const host = await startHost({ onFrame: async () => {} });
  const browser = await launchBrowser(cfg, {
    width, height, stageUrl: host.stageUrl, postUrl: host.postUrl, storyboard,
  });

  let result;
  const started = Date.now();
  try {
    result = await renderVideo({
      cfg, session: browser.session, host,
      workDir: work, outDir, totalFrames,
      options: {
        width, height, fps, crf, capture,
        chunk: flags.chunk ? Number(flags.chunk) : cfg.render.chunk,
        force: Boolean(flags.force),
        quiet: Boolean(flags.quiet),
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
  } else {
    try { fs.renameSync(videoOnly, out); }
    catch { fs.copyFileSync(videoOnly, out); fs.rmSync(videoOnly, { force: true }); }
  }
  final = out;

  const probe = await probeVideo(cfg, final);
  const st = probe.streams?.[0] || {};
  const fmt = probe.format || {};
  const size = Number(fmt.size || fs.statSync(final).size);

  section('Hasil preview');
  ok(`${result.framesRendered} frame · ${fpsActual.toFixed(2)} fps · ${(renderMs / 1000).toFixed(1)} dtk`);
  if (hasAudio) {
    const a = await probeAudio(cfg, final);
    info(`audio: ${a.sampleRate} Hz ${a.channels === 1 ? 'mono' : 'stereo'} · ${a.codec}`);
  }

  section('Ringkasan');
  ok(final);
  info(`${humanBytes(size)} · ${st.width}x${st.height} · ${duration.toFixed(3)} dtk`);
  if (timeline) info(`timeline: ${timeline.source} · ${timeline.totalDuration.toFixed(3)} dtk`);
  info(`selesai ${nowStamp()}`);
  warn('preview bukan untuk diunggah. Render final: vigen finish "' + project.name + '"');
  return 0;
}
