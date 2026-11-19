import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureDir, exists } from '../core/util.mjs';
import { probeDuration } from './probe.mjs';
import { ensureSfx, SFX_IDS } from './sfx.mjs';

const execFileAsync = promisify(execFile);

const MUSIC_EXT = new Set(['.mp3', '.wav', '.m4a', '.ogg', '.flac']);
const MUSIC_VOLUME = 0.25;
// Ducking dihitung dari timeline (bukan sidechaincompress) supaya deterministik.
const DUCK_DEPTH = 0.65;   // ~ -9,1 dB saat voice aktif
const DUCK_ATTACK = 0.06;  // detik, mulai meredup sebelum voice
const DUCK_RELEASE = 0.25; // detik, kembali setelah voice selesai

const r3 = (n) => Math.round(n * 1000) / 1000;

async function runFfmpeg(cfg, args, { allowFail = false } = {}) {
  try {
    return await execFileAsync(cfg.paths.ffmpeg, args, { maxBuffer: 32 * 1024 * 1024 });
  } catch (err) {
    if (allowFail) return { stdout: err.stdout || '', stderr: err.stderr || '' };
    const msg = String(err.stderr || err.message).trim().split('\n').slice(-4).join(' | ');
    throw new Error(`ffmpeg gagal: ${msg}`);
  }
}

export function findMusic(projectDir, override) {
  if (override) {
    const p = path.resolve(override);
    if (!exists(p)) throw new Error(`musik tidak ditemukan: ${p}`);
    return p;
  }
  const dir = path.join(projectDir, 'assets');
  if (!exists(dir)) return null;
  const hit = fs.readdirSync(dir).find((f) => /^music\./i.test(f) && MUSIC_EXT.has(path.extname(f).toLowerCase()));
  return hit ? path.join(dir, hit) : null;
}

function parseCueFile(p) {
  let raw;
  try {
    raw = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (err) {
    throw new Error(`file SFX tidak valid (${p}): ${err.message}`);
  }
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.cues)) return raw.cues;
  throw new Error(`file SFX harus array atau { "cues": [...] } (${p})`);
}

export function readSfxCues(projectDir, override) {
  if (override) {
    const p = path.resolve(override);
    if (!exists(p)) throw new Error(`file SFX tidak ditemukan: ${p}`);
    return parseCueFile(p);
  }
  const p = path.join(projectDir, 'sfx.json');
  if (!exists(p)) return [];
  return parseCueFile(p);
}

function voiceGroups(timeline) {
  if (Array.isArray(timeline.groups) && timeline.groups.length) {
    return timeline.groups
      .filter((g) => g.file && Number.isFinite(g.start))
      .map((g) => ({
        file: g.file,
        start: g.start,
        duration: Number(g.duration ?? (g.end - g.start)),
        end: Number(g.end ?? (g.start + g.duration)),
      }))
      .sort((a, b) => a.start - b.start);
  }
  return timeline.scenes
    .filter((s) => s.file)
    .reduce((groups, s) => {
      const end = Number(s.end ?? (s.start + s.duration));
      const hit = groups.find((g) => g.file === s.file);
      if (hit) {
        hit.end = Math.max(hit.end, end);
        hit.duration = hit.end - hit.start;
      } else {
        groups.push({ file: s.file, start: s.start, duration: end - s.start, end });
      }
      return groups;
    }, [])
    .sort((a, b) => a.start - b.start);
}

async function renderVoiceBus(cfg, projectDir, timeline, dir) {
  const groups = voiceGroups(timeline);
  if (!groups.length) {
    throw new Error('timeline tidak punya file voice. Isi voice/ lalu jalankan: vigen timing');
  }

  const out = path.join(dir, 'voice-bus.wav');
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  const parts = [];
  const labels = [];

  groups.forEach((g, i) => {
    args.push('-i', path.join(projectDir, g.file));
    parts.push(`[${i}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,adelay=${Math.round(g.start * 1000)}:all=1[v${i}]`);
    labels.push(`[v${i}]`);
  });

  parts.push(`${labels.join('')}amix=inputs=${groups.length}:normalize=0:duration=longest,apad=whole_dur=${timeline.totalDuration}[out]`);
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out);
  await runFfmpeg(cfg, args);
  return out;
}

async function renderMusic(cfg, musicFile, totalDuration, dir) {
  const raw = path.join(dir, 'music-raw.wav');
  await runFfmpeg(cfg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-stream_loop', '-1', '-i', musicFile,
    '-af', `aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${MUSIC_VOLUME},atrim=0:${totalDuration},asetpts=PTS-STARTPTS`,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', raw,
  ]);
  return raw;
}

function duckExpression(timeline) {
  const active = voiceGroups(timeline)
    .filter((s) => Number.isFinite(s.start) && Number.isFinite(s.end) && s.end > s.start)
    .sort((a, b) => a.start - b.start);
  if (!active.length) return null;

  const r3 = (n) => Number(n.toFixed(3));
  const terms = active.map((s) => {
    const down = r3(s.start - DUCK_ATTACK);
    const up = r3(s.end + DUCK_RELEASE);
    return `clip((t-${down})/${DUCK_ATTACK},0,1)*clip((${up}-t)/${DUCK_RELEASE},0,1)`;
  });

  // max() memastikan ducking tidak menumpuk bila ada scene yang berdekatan.
  let ramp = terms[0];
  for (let i = 1; i < terms.length; i++) ramp = `max(${ramp},${terms[i]})`;
  return `1-${DUCK_DEPTH}*${ramp}`;
}

async function duckMusic(cfg, musicRaw, timeline, dir) {
  const out = path.join(dir, 'music-duck.wav');
  const expr = duckExpression(timeline);
  const tail = `atrim=0:${timeline.totalDuration},asetpts=PTS-STARTPTS`;
  const af = expr ? `volume='${expr}':eval=frame,${tail}` : tail;
  await runFfmpeg(cfg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', musicRaw,
    '-af', af,
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out,
  ]);
  return out;
}

async function mixFinal(cfg, { voiceBus, musicDuck, cueFiles, totalDuration, dir }) {
  const inputs = [voiceBus];
  const parts = ['[0:a]anull[base]'];
  const labels = ['[base]'];

  if (musicDuck) {
    inputs.push(musicDuck);
    parts.push(`[1:a]anull[mus]`);
    labels.push('[mus]');
  }

  cueFiles.forEach((cue, i) => {
    inputs.push(cue.file);
    const idx = inputs.length - 1;
    parts.push(`[${idx}:a]aresample=48000,aformat=sample_fmts=fltp:channel_layouts=stereo,volume=${cue.volume},adelay=${Math.round(cue.at * 1000)}:all=1[sx${i}]`);
    labels.push(`[sx${i}]`);
  });

  parts.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0:duration=first[out]`);

  const out = path.join(dir, 'mix.wav');
  const args = ['-y', '-hide_banner', '-loglevel', 'error'];
  for (const f of inputs) args.push('-i', f);
  args.push('-filter_complex', parts.join(';'), '-map', '[out]', '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le', out);
  await runFfmpeg(cfg, args);
  return out;
}

function parseLastJson(text) {
  const end = text.lastIndexOf('}');
  if (end < 0) return null;
  const start = text.lastIndexOf('{', end);
  if (start < 0) return null;
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
}

export async function loudnormTwoPass(cfg, inFile, outFile) {
  const pass1 = await runFfmpeg(cfg, [
    '-hide_banner', '-nostats', '-i', inFile,
    '-af', 'loudnorm=I=-14:TP=-1.5:LRA=11:print_format=json',
    '-f', 'null', '-',
  ], { allowFail: true });

  const m = parseLastJson(pass1.stderr || '');
  if (!m || !m.input_i) {
    throw new Error('gagal mengukur loudness (pass 1). Pastikan ffmpeg punya filter loudnorm.');
  }

  await runFfmpeg(cfg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', inFile,
    '-af', [
      'loudnorm=I=-14:TP=-1.5:LRA=11',
      `measured_I=${m.input_i}`,
      `measured_TP=${m.input_tp}`,
      `measured_LRA=${m.input_lra}`,
      `measured_thresh=${m.input_thresh}`,
      `offset=${m.target_offset}`,
      'linear=true',
      'print_format=json',
    ].join(':'),
    '-ar', '48000', '-ac', '2', '-c:a', 'pcm_s16le',
    outFile,
  ]);

  return {
    inputLufs: Number(m.input_i),
    inputTruePeak: Number(m.input_tp),
  };
}

export async function measureLoudness(cfg, file) {
  const r = await runFfmpeg(cfg, [
    '-hide_banner', '-nostats', '-i', file,
    '-af', 'ebur128=peak=true', '-f', 'null', '-',
  ], { allowFail: true });
  const txt = r.stderr || '';
  const iMatches = [...txt.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  const peakMatches = [...txt.matchAll(/Peak:\s*(-?\d+(?:\.\d+)?)\s*dBFS/g)];
  const lufs = iMatches.length ? Number(iMatches[iMatches.length - 1][1]) : null;
  const peak = peakMatches.length ? Number(peakMatches[peakMatches.length - 1][1]) : null;
  return {
    lufs: Number.isFinite(lufs) ? lufs : null,
    truePeak: Number.isFinite(peak) ? peak : null,
  };
}

export async function muxAudio(cfg, { video, audio, out }) {
  const vd = await probeDuration(cfg, video);
  await runFfmpeg(cfg, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', video,
    '-i', audio,
    '-map', '0:v:0', '-map', '1:a:0',
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    // apad menyamakan audio yang lebih pendek, -t membatasi audio yang lebih
    // panjang. Jangan pakai -shortest: pembulatan AAC bisa memotong frame
    // video terakhir (435 → 434).
    '-af', `apad=whole_dur=${r3(vd)}`,
    '-t', r3(vd),
    '-movflags', '+faststart',
    '-map_metadata', '-1',
    out,
  ]);
  return out;
}

/**
 * Rangkai audio episode: voice + jeda, musik + ducking, SFX, loudnorm 2-pass.
 */
export async function buildAudio({ cfg, project, timeline, options = {} }) {
  const dir = ensureDir(path.join(project.dir, '.work', 'audio'));

  const voiceBus = await renderVoiceBus(cfg, project.dir, timeline, dir);

  const musicFile = findMusic(project.dir, options.music);
  let musicRaw = null;
  let musicDuck = null;
  if (musicFile) {
    musicRaw = await renderMusic(cfg, musicFile, timeline.totalDuration, dir);
    musicDuck = await duckMusic(cfg, musicRaw, timeline, dir);
  }

  const cues = [];
  for (const cue of readSfxCues(project.dir, options.sfx)) {
    const id = String(cue.id || '').trim();
    if (!id) continue;
    if (!SFX_IDS.includes(id)) {
      throw new Error(`SFX "${id}" tidak dikenal. Pilihan: ${SFX_IDS.join(', ')}`);
    }
    const at = Number(cue.at);
    if (!Number.isFinite(at) || at < 0 || at > timeline.totalDuration) {
      throw new Error(`cue SFX "${id}" punya waktu tidak valid: ${cue.at}`);
    }
    cues.push({
      file: await ensureSfx(cfg, path.join(project.dir, '.work'), id),
      at,
      volume: Number.isFinite(Number(cue.volume)) ? Number(cue.volume) : 0.7,
    });
  }

  const mixFile = await mixFinal(cfg, {
    voiceBus, musicDuck, cueFiles: cues, totalDuration: timeline.totalDuration, dir,
  });

  const outDir = ensureDir(path.join(project.dir, 'out'));
  const audioOut = path.join(outDir, 'audio.wav');
  const normalize = await loudnormTwoPass(cfg, mixFile, audioOut);
  const measured = await measureLoudness(cfg, audioOut);

  return {
    audioFile: audioOut,
    voiceBus,
    musicFile,
    musicDuck,
    mixFile,
    sfxCount: cues.length,
    normalize,
    measured,
  };
}
