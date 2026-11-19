import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { loadConfig, readJson } from '../core/config.mjs';
import { resolveProject, projectFile } from '../core/workspace.mjs';
import { parseArgs, ensureDir, line, section, color, ok, info, warn, bad, humanBytes, nowStamp } from '../core/util.mjs';
import { pickVideo, isPreviewVideo, projectRelative } from '../core/media.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';
import { probeVideo } from '../render/encode.mjs';
import { probeAudio } from '../audio/probe.mjs';
import { subtitleStats, DEFAULT_SUBS } from '../story/subs.mjs';
import { subtitleOptionsFrom } from './subs.mjs';

const execFileAsync = promisify(execFile);

async function runFf(cfg, args, allowFail = true) {
  try {
    const { stdout, stderr } = await execFileAsync(cfg.paths.ffmpeg, args, { maxBuffer: 12 * 1024 * 1024 });
    return { ok: true, stdout, stderr };
  } catch (err) {
    if (!allowFail) throw err;
    return { ok: false, stdout: err.stdout || '', stderr: err.stderr || String(err.message) };
  }
}

/** Deteksi frame hitam > minDur. Mengembalikan daftar rentang hitam. */
async function detectBlack(cfg, file, minDur = 0.2) {
  const r = await runFf(cfg, [
    '-hide_banner', '-nostats', '-i', file,
    '-vf', `blackdetect=d=${minDur}:pic_th=0.98`,
    '-an', '-f', 'null', '-',
  ]);
  const text = `${r.stderr || ''}`;
  const out = [];
  for (const m of text.matchAll(/black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)\s+black_duration:\s*([\d.]+)/g)) {
    out.push({ start: Number(m[1]), end: Number(m[2]), duration: Number(m[3]) });
  }
  return out;
}

/** Deteksi senyap audio > minDur pada rentang [from, to]. */
async function detectSilence(cfg, file, minDur = 2, range = null) {
  const args = ['-hide_banner', '-nostats'];
  if (range) args.push('-ss', String(range.from), '-to', String(range.to));
  args.push('-i', file, '-af', `silencedetect=noise=-40dB:d=${minDur}`, '-vn', '-f', 'null', '-');
  const r = await runFf(cfg, args);
  const text = `${r.stderr || ''}`;
  const starts = [...text.matchAll(/silence_start:\s*(-?[\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...text.matchAll(/silence_end:\s*(-?[\d.]+)\s*\|\s*silence_duration:\s*([\d.]+)/g)];
  const ranges = [];
  for (let i = 0; i < starts.length; i++) {
    const end = ends[i] ? Number(ends[i][1]) : null;
    const dur = ends[i] ? Number(ends[i][2]) : null;
    ranges.push({ start: starts[i], end, duration: dur });
  }
  return ranges;
}

async function measureLoudness(cfg, file) {
  const r = await runFf(cfg, [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'ebur128=peak=true', '-f', 'null', '-',
  ]);
  const txt = r.stderr || '';
  const iM = [...txt.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  const pM = [...txt.matchAll(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)];
  const lufs = iM.length ? Number(iM[iM.length - 1][1]) : null;
  const peak = pM.length ? Number(pM[pM.length - 1][1]) : null;
  return { lufs, truePeak: peak };
}

function even(n) {
  const v = Math.round(Number(n) / 2) * 2;
  return Math.max(2, v);
}

export async function qcCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);
  try {
    const report = await runQc({ cfg, project, flags });
    return report.passed ? 0 : 1;
  } catch (err) {
    if (err.code === 'ENOVIDEO') {
      bad(err.message);
      info(`render dulu: vigen finish "${project.name}"`);
      return 1;
    }
    throw err;
  }
}

/**
 * Periksa mutu file final. `--preview` memakai resolusi draf dan memilih
 * file `_preview.mp4`, sehingga QC tidak salah memeriksa draft sebagai final.
 */
export async function runQc({
  cfg, project, flags = {}, quiet = false, videoArg = null, expectAudio = true,
}) {
  const preview = Boolean(flags.preview) || (videoArg && isPreviewVideo(path.basename(videoArg)));

  const video = videoArg
    ? path.resolve(String(videoArg))
    : (flags.video
      ? path.resolve(String(flags.video))
      : pickVideo(path.join(project.dir, 'out'), {
        slug: project.slug,
        width: cfg.output.width,
        height: cfg.output.height,
        preview,
      }));

  if (!video || !fs.existsSync(video)) {
    const err = new Error(preview
      ? 'tidak ada video preview untuk diperiksa. Jalankan: vigen preview "<project>"'
      : 'tidak ada video final untuk diperiksa. Render dulu: vigen finish "<project>"');
    err.code = 'ENOVIDEO';
    throw err;
  }

  const loudTarget = Number(flags.lufs ?? -14);
  const loudTol = Number(flags.tol ?? 1);
  const peakMax = Number(flags['peak-max'] ?? -1);
  const blackMax = Number(flags['black-max'] ?? 0.2);
  const silenceMax = Number(flags['silence-max'] ?? 2);
  const scale = Number(flags.scale ?? cfg.preview?.scale ?? 0.5);
  const expectedWidth = preview ? even(cfg.output.width * scale) : cfg.output.width;
  const expectedHeight = preview ? even(cfg.output.height * scale) : cfg.output.height;

  if (!quiet) {
    line(`${color.bold('Vigen qc')} ${color.gray(`— ${project.name}`)}`);
    info(`file: ${path.basename(video)}${preview ? ' (preview)' : ''}`);
    info(`target ${expectedWidth}x${expectedHeight} · loudness ${loudTarget} ±${loudTol} LUFS · true peak ≤ ${peakMax} dBTP`);
  }

  // Storyboard untuk cek subtitle; jangan gagal bila scene.js bermasalah.
  let expectedDuration = null;
  let subOpts = { ...DEFAULT_SUBS, ...(cfg.subs || {}) };
  let subs = [];
  let subsEnabled = false;
  try {
    const meta = readJson(projectFile(project.dir), {}) || {};
    subsEnabled = typeof meta.subs === 'boolean' ? meta.subs : (cfg.subs?.enabled ?? true);
    const { storyboard } = await prepareStoryboard({
      cfg, project, retime: false, subs: subsEnabled,
      subsOptions: subtitleOptionsFrom(cfg, flags),
    });
    expectedDuration = storyboard.duration;
    subs = storyboard.subs || [];
    subOpts = subtitleOptionsFrom(cfg, flags);
  } catch (err) {
    warn(`tidak bisa memuat storyboard: ${err.message}`);
    try {
      const srt = path.join(project.dir, 'out', 'subtitle.srt');
      if (fs.existsSync(srt)) subsEnabled = true;
    } catch { /* noop */ }
  }

  const probe = await probeVideo(cfg, video);
  const st = probe.streams?.[0] || {};
  const fmt = probe.format || {};
  const size = Number(fmt.size || fs.statSync(video).size);
  const gotFrames = Number(st.nb_read_frames || 0);
  const gotDuration = Number(fmt.duration || st.duration || 0);
  const fps = cfg.output.fps;

  const audioInfo = await probeAudio(cfg, video);
  const hasAudio = audioInfo.codec !== null;

  const fpsNum = (() => {
    const raw = String(st.r_frame_rate || '');
    const [a, b] = raw.split('/').map(Number);
    if (Number.isFinite(a) && Number.isFinite(b) && b) return a / b;
    return Number.isFinite(a) ? a : 0;
  })();

  const checks = [];
  const add = (name, pass, detail, severity = 'error') => checks.push({ name, pass, detail, severity });

  // 1. container & video
  add('codec', st.codec_name === 'h264', String(st.codec_name));
  add('pixel format', st.pix_fmt === 'yuv420p', String(st.pix_fmt));
  add('resolusi', st.width === expectedWidth && st.height === expectedHeight,
    `${st.width}x${st.height} (target ${expectedWidth}x${expectedHeight})`);
  add('fps', Math.abs(fpsNum - fps) < 0.01, `${fpsNum.toFixed(2)} (target ${fps})`);

  // 2. durasi vs timeline
  if (expectedDuration) {
    const diff = Math.abs(gotDuration - expectedDuration);
    add('durasi', diff <= 1 / fps + 0.05, `${gotDuration.toFixed(3)} dtk (timeline ${expectedDuration.toFixed(3)}, selisih ${diff.toFixed(3)})`);
  }

  // 3. audio
  if (hasAudio) {
    add('audio', audioInfo.channels === 2 && audioInfo.sampleRate === 48000,
      `${audioInfo.sampleRate} Hz ${audioInfo.channels === 1 ? 'mono' : 'stereo'} · ${audioInfo.codec}`);
    const loud = await measureLoudness(cfg, video);
    if (loud.lufs !== null) add('loudness', Math.abs(loud.lufs - loudTarget) <= loudTol, `${loud.lufs.toFixed(1)} LUFS (target ${loudTarget})`);
    else add('loudness', false, 'tidak terukur');
    if (loud.truePeak !== null) add('true peak', loud.truePeak <= peakMax + 0.05, `${loud.truePeak.toFixed(1)} dBTP`);
  } else if (expectAudio) {
    add('audio', false, 'tidak ada audio');
  } else {
    add('audio', true, 'dinonaktifkan (--no-audio)', 'info');
  }

  // 4. frame hitam
  const blacks = await detectBlack(cfg, video, blackMax);
  add('frame hitam', blacks.length === 0, blacks.length
    ? `${blacks.length} rentang (terpanjang ${Math.max(...blacks.map((b) => b.duration)).toFixed(2)} dtk)`
    : 'tidak ada');

  // 5. audio senyap (abaikan outro 1.5 dtk terakhir)
  if (hasAudio) {
    const outro = Number(cfg.brand?.outro ?? 1.5);
    const checkTo = Math.max(0.1, Math.min(gotDuration, expectedDuration ? expectedDuration - outro : gotDuration - outro));
    const silences = await detectSilence(cfg, video, silenceMax, { from: 0, to: checkTo });
    const badSil = silences.filter((s) => s.duration === null || s.duration >= silenceMax);
    add('audio senyap', badSil.length === 0, badSil.length ? `${badSil.length} rentang hening ≥${silenceMax} dtk` : 'tidak ada');
  }

  // 6. subtitle
  if (subsEnabled && subs.length) {
    const stats = subtitleStats(subs);
    add('subtitle baris', stats.maxLines <= (subOpts.maxLines || 2), `maks ${stats.maxLines} baris`);
    add('subtitle karakter', stats.maxChars <= (subOpts.maxChars || DEFAULT_SUBS.maxChars) + 6, `maks ${stats.maxChars} karakter`);
    add('safe area', !(subs.some((s) => (s.lines || []).some((l) => l.length > (subOpts.maxChars || DEFAULT_SUBS.maxChars) + 12))), 'subtitle dalam batas');
  } else {
    add('subtitle', true, subsEnabled ? 'aktif, tidak ada narasi' : 'nonaktif', 'info');
  }

  if (!quiet) {
    section('Pemeriksaan');
    for (const c of checks) {
      if (c.pass) ok(`${c.name}: ${c.detail}`);
      else if (c.severity === 'info') info(`${c.name}: ${c.detail}`);
      else bad(`${c.name}: ${c.detail}`);
    }
  }

  const failures = checks.filter((c) => !c.pass && c.severity !== 'info');
  const report = {
    project: project.name,
    slug: project.slug,
    file: path.basename(video),
    path: projectRelative(project.dir, video),
    preview,
    checkedAt: new Date().toISOString(),
    duration: gotDuration,
    expectedDuration,
    frames: gotFrames,
    size,
    codec: st.codec_name,
    pixFmt: st.pix_fmt,
    resolution: `${st.width}x${st.height}`,
    expectedResolution: `${expectedWidth}x${expectedHeight}`,
    audio: audioInfo,
    subtitles: subsEnabled ? { count: subs.length, maxLines: subs.length ? subtitleStats(subs).maxLines : 0 } : null,
    checks,
    passed: failures.length === 0,
  };

  const outDir = ensureDir(path.join(project.dir, 'out'));
  const reportFile = flags.out
    ? path.resolve(String(flags.out))
    : path.join(outDir, preview ? 'qc-preview.json' : 'qc.json');
  ensureDir(path.dirname(reportFile));
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2) + '\n');

  if (!quiet) {
    section('Ringkasan');
    ok(reportFile);
    info(`${humanBytes(size)} · ${gotDuration.toFixed(3)} dtk · ${st.width}x${st.height} · ${st.codec_name}/${st.pix_fmt}`);
    info(`qc selesai ${nowStamp()}`);

    if (!failures.length) ok('mutu file lulus pemeriksaan.');
    else bad(`${failures.length} pemeriksaan gagal: ${failures.map((f) => f.name).join(', ')}`);
  }

  report.reportFile = reportFile;
  return report;
}
