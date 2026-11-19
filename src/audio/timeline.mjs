import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_VERSION, readJson, writeJson } from '../core/config.mjs';
import { ensureDir } from '../core/util.mjs';
import { probeDuration } from './probe.mjs';

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

/**
 * Bangun timeline dari durasi voice asli. Bila voice belum ada, pakai estimasi
 * 2,4 kata/detik dari script.json supaya visual tetap bisa disiapkan.
 */
export async function buildTimeline({ cfg, project, gap = DEFAULT_GAP, wps = WORDS_PER_SECOND }) {
  const files = listVoiceFiles(project.dir);
  const scenes = [];
  let cursor = 0;
  let source = 'voice';

  if (files.length) {
    for (const f of files) {
      const rel = `voice/${f}`;
      const dur = await probeDuration(cfg, path.join(project.dir, rel));
      scenes.push({
        id: path.basename(f, path.extname(f)),
        file: rel,
        start: r3(cursor),
        duration: r3(dur),
        end: r3(cursor + dur),
      });
      cursor += dur + gap;
    }
    cursor -= gap;
  } else {
    source = 'estimate';
    const script = readJson(path.join(project.dir, 'script.json'), {});
    const list = Array.isArray(script.scenes) ? script.scenes : [];
    const usable = list.filter((s) => s && typeof s.narasi === 'string' && s.narasi.trim());
    if (!usable.length) {
      throw new Error('tidak ada file di voice/ dan script.json belum punya "narasi". Isi naskah dulu, lalu ulangi.');
    }
    for (let i = 0; i < usable.length; i++) {
      const s = usable[i];
      const words = s.narasi.trim().split(/\s+/).length;
      const dur = Math.max(1, words / wps);
      scenes.push({
        id: s.id || `s${String(i + 1).padStart(2, '0')}`,
        file: null,
        start: r3(cursor),
        duration: r3(dur),
        end: r3(cursor + dur),
        estimated: true,
        words,
      });
      cursor += dur + gap;
    }
    cursor -= gap;
  }

  const timeline = {
    schema: 1,
    engine: ENGINE_VERSION,
    project: project.slug,
    source,
    gap,
    wps,
    fps: cfg.output.fps,
    totalDuration: r3(cursor),
    scenes,
    createdAt: new Date().toISOString(),
  };

  ensureDir(path.join(project.dir, '.work'));
  writeJson(timelinePath(project.dir), timeline);
  return timeline;
}
