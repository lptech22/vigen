import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_VERSION, readJson, writeJson } from '../core/config.mjs';
import { ensureDir } from '../core/util.mjs';
import { probeDuration } from './probe.mjs';
import { loadNarration, splitByWords } from '../story/narration.mjs';

export const DEFAULT_GAP = 0.35;
export const WORDS_PER_SECOND = 2.4;

const VOICE_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);

export function naturalSort(a, b) {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' });
}

const r3 = (n) => Math.round(n * 1000) / 1000;

export function timelinePath(projectDir) {
  return path.join(projectDir, '.work', 'timeline.json');
}

export function readTimeline(projectDir) {
  return readJson(timelinePath(projectDir), null);
}

export function listVoiceFiles(projectDir) {
  const dir = path.join(projectDir, 'voice');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((f) => VOICE_EXT.has(path.extname(f).toLowerCase()))
    .sort(naturalSort);
}

function projectMeta(dir) {
  return readJson(path.join(dir, 'vigen.project.json'), {}) || {};
}

/** Bagi durasi total sesuai bobot kata; bobot kosong → rata. */
function spread(total, weights) {
  const n = weights.length;
  if (!n) return [];
  const sum = weights.reduce((a, b) => a + (Number(b) || 0), 0);
  if (!sum) return Array.from({ length: n }, () => total / n);
  return weights.map((w) => total * ((Number(w) || 0) / sum));
}

function rowsFor(narration, file, block, total) {
  const durs = spread(total, narration.map((n) => n.words));
  const rows = [];
  let cursor = 0;
  for (let i = 0; i < narration.length; i++) {
    const start = cursor;
    cursor += durs[i];
    rows.push({
      id: narration[i].id,
      type: narration[i].type,
      file,
      block,
      start: r3(start),
      duration: r3(cursor - start),
      end: r3(cursor),
      words: narration[i].words,
    });
  }
  return rows;
}

async function singleTimeline({ cfg, project, narration, file }) {
  const rel = `voice/${file}`;
  const total = r3(await probeDuration(cfg, path.join(project.dir, rel)));
  const scenes = rowsFor(narration, rel, 0, total);
  const last = scenes[scenes.length - 1];
  last.end = total;
  last.duration = r3(total - last.start);

  const notes = [];
  if (!narration.some((n) => n.words > 0)) {
    notes.push('narasi kosong; durasi audio dibagi rata antar scene.');
  }
  return {
    scenes,
    groups: [{ file: rel, start: 0, duration: total, end: total }],
    totalDuration: total,
    source: 'voice-single',
    mode: 'single',
    gap: 0,
    notes,
  };
}

async function blockTimeline({ cfg, project, narration, files, gap, split }) {
  const blocks = split(narration, files.length);
  const scenes = [];
  const groups = [];
  let cursor = 0;

  for (let i = 0; i < blocks.length; i++) {
    const file = files[i];
    const rel = `voice/${file}`;
    const dur = r3(await probeDuration(cfg, path.join(project.dir, rel)));
    const rows = rowsFor(blocks[i], rel, i, dur).map((row) => ({
      ...row,
      start: r3(row.start + cursor),
      end: r3(row.end + cursor),
    }));
    scenes.push(...rows);
    groups.push({ file: rel, start: r3(cursor), duration: dur, end: r3(cursor + dur) });
    cursor += dur + gap;
  }

  const total = r3(cursor - gap);
  return {
    scenes,
    groups,
    totalDuration: total,
    source: 'voice-blocks',
    mode: 'blocks',
    gap,
    notes: [],
  };
}

/**
 * Bangun timeline dari durasi voice asli. Tiga mode:
 * - `scenes`: satu file per scene (perilaku lama)
 * - `single`: satu audio utuh, dibagi proporsional dari jumlah kata `narasi`
 * - `blocks`: beberapa audio, tiap file mencakup beberapa scene berurutan
 * Fallback estimasi 2,4 kata/detik dari script.json bila voice belum ada.
 */
export async function buildTimeline({ cfg, project, gap = DEFAULT_GAP, wps = WORDS_PER_SECOND }) {
  const files = listVoiceFiles(project.dir);
  const meta = projectMeta(project.dir);
  const narration = await loadNarration(project.dir);
  const sceneCount = narration?.length || 0;

  let result;

  if (!files.length) {
    result = estimateTimeline({ project, wps, gap });
  } else if (files.length === 1 && sceneCount > 1) {
    result = await singleTimeline({ cfg, project, narration, file: files[0] });
  } else if (narration && files.length > 1 && files.length < sceneCount) {
    result = await blockTimeline({
      cfg, project, narration, files, gap, split: splitByWords,
    });
  } else {
    if (narration && files.length > sceneCount) {
      throw new Error(`voice/ punya ${files.length} file, tetapi scene.js hanya ${sceneCount} scene. ` +
        `Kurangi file voice atau tambah scene.`);
    }
    result = await scenesTimeline({ cfg, project, files, narration, gap });
  }

  const timeline = {
    schema: 1,
    engine: ENGINE_VERSION,
    project: project.slug,
    source: result.source,
    mode: result.mode,
    gap: result.gap,
    wps,
    fps: cfg.output.fps,
    totalDuration: result.totalDuration,
    scenes: result.scenes,
    groups: result.groups,
    notes: result.notes || [],
    declaredVoices: Number(meta.audio?.voices) || null,
    createdAt: new Date().toISOString(),
  };

  ensureDir(path.join(project.dir, '.work'));
  writeJson(timelinePath(project.dir), timeline);
  return timeline;
}

async function scenesTimeline({ cfg, project, files, narration, gap }) {
  const scenes = [];
  const groups = [];
  let cursor = 0;

  for (let i = 0; i < files.length; i++) {
    const rel = `voice/${files[i]}`;
    const id = path.basename(files[i], path.extname(files[i]));
    const dur = r3(await probeDuration(cfg, path.join(project.dir, rel)));
    const start = r3(cursor);
    const end = r3(cursor + dur);
    scenes.push({
      id,
      file: rel,
      block: i,
      start,
      duration: dur,
      end,
      words: narration?.find((n) => n.id === id)?.words ?? 0,
    });
    groups.push({ file: rel, start, duration: dur, end });
    cursor += dur + gap;
  }

  return {
    scenes,
    groups,
    totalDuration: r3(cursor - gap),
    source: 'voice',
    mode: 'scenes',
    gap,
    notes: [],
  };
}

function estimateTimeline({ project, wps, gap }) {
  const script = readJson(path.join(project.dir, 'script.json'), {});
  const list = Array.isArray(script.scenes) ? script.scenes : [];
  const usable = list.filter((s) => s && typeof s.narasi === 'string' && s.narasi.trim());
  if (!usable.length) {
    throw new Error('tidak ada file di voice/ dan script.json belum punya "narasi". ' +
      'Isi naskah dulu, atau buat prompt dengan: vigen prompt');
  }

  const scenes = [];
  let cursor = 0;
  for (let i = 0; i < usable.length; i++) {
    const s = usable[i];
    const words = s.narasi.trim().split(/\s+/).length;
    const dur = Math.max(1, words / wps);
    scenes.push({
      id: s.id || `s${String(i + 1).padStart(2, '0')}`,
      file: null,
      block: null,
      start: r3(cursor),
      duration: r3(dur),
      end: r3(cursor + dur),
      estimated: true,
      words,
    });
    cursor += dur + gap;
  }
  cursor -= gap;

  return {
    scenes,
    groups: [],
    totalDuration: r3(cursor),
    source: 'estimate',
    mode: 'estimate',
    gap,
    notes: [],
  };
}
