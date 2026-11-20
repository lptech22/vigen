import fs from 'node:fs';
import path from 'node:path';
import { ensureDir } from '../core/util.mjs';

/**
 * Subtitle narasi: dipotong dari field `narasi` di scene.js, bukan dari Whisper.
 * Semua timing proporsional terhadap jumlah kata di dalam scene, sehingga
 * hasilnya deterministik dan tidak butuh model tambahan.
 */
export const DEFAULT_SUBS = {
  maxChars: 38,
  maxLines: 2,
  minDuration: 0.55,
};

const r3 = (n) => Math.round(n * 1000) / 1000;

function normalizeText(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function words(text) {
  return normalizeText(text).split(/\s+/).filter(Boolean);
}

/** Pecah per kalimat, tetap mempertahankan tanda baca dan kutip penutup. */
function splitSentences(text) {
  const re = /[^.!?…]+[.!?…]+["'”’)\]]*|[^.!?…]+$/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const s = m[0].trim();
    if (s) out.push(s);
    if (m.index === re.lastIndex) re.lastIndex++;
  }
  return out.length ? out : [text];
}

/** Bungkus kata menjadi baris, hanya berdasarkan jumlah karakter. */
function wrapWords(list, maxChars) {
  const lines = [];
  let line = '';
  for (const w of list) {
    const test = line ? `${line} ${w}` : w;
    if (!line || test.length <= maxChars) line = test;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Bagi satu kalimat menjadi beberapa potongan yang masing-masing <= maxLines baris. */
function chunkSentence(sentence, maxChars, maxLines) {
  const list = words(sentence);
  if (!list.length) return [];
  if (wrapWords(list, maxChars).length <= maxLines) return [list];

  const chunks = [];
  let current = [];
  for (const w of list) {
    const test = [...current, w];
    if (wrapWords(test, maxChars).length <= maxLines) current = test;
    else {
      if (current.length) chunks.push(current);
      current = [w];
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

/**
 * Bangun daftar subtitle dari storyboard yang sudah punya start/end.
 * Scene `outro` dan scene tanpa narasi dilewati.
 */
export function buildSubtitles(storyboard, options = {}) {
  const opts = {
    maxChars: Number(options.maxChars) || DEFAULT_SUBS.maxChars,
    maxLines: Number(options.maxLines) || DEFAULT_SUBS.maxLines,
    minDuration: Number(options.minDuration) || DEFAULT_SUBS.minDuration,
  };
  const scenes = Array.isArray(storyboard?.scenes) ? storyboard.scenes : [];
  const subs = [];

  for (const scene of scenes) {
    if (!scene || scene.type === 'outro') continue;
    const text = normalizeText(scene.narasi);
    if (!text) continue;

    const total = words(text).length;
    const duration = Number(scene.duration);
    if (!total || !Number.isFinite(duration) || duration <= 0) continue;

    const units = [];
    let cursor = 0;
    for (const sentence of splitSentences(text)) {
      for (const part of chunkSentence(sentence, opts.maxChars, opts.maxLines)) {
        units.push({
          words: part,
          wiStart: cursor,
          wiEnd: cursor + part.length,
        });
        cursor += part.length;
      }
    }

    // Gabungkan potongan yang terlalu singkat bila masih muat dalam 2 baris.
    const merged = [];
    for (const unit of units) {
      const dur = duration * (unit.words.length / total);
      const last = merged[merged.length - 1];
      if (last && last.dur < opts.minDuration) {
        const combo = [...last.words, ...unit.words];
        if (wrapWords(combo, opts.maxChars).length <= opts.maxLines) {
          last.words = combo;
          last.wiEnd = unit.wiEnd;
          last.dur = duration * (combo.length / total);
          continue;
        }
      }
      merged.push({ ...unit, dur });
    }

    // Potongan terakhir yang pendek: coba gabung ke sebelumnya.
    if (merged.length > 1) {
      const last = merged[merged.length - 1];
      if (last.dur < opts.minDuration) {
        const prev = merged[merged.length - 2];
        const combo = [...prev.words, ...last.words];
        if (wrapWords(combo, opts.maxChars).length <= opts.maxLines) {
          prev.words = combo;
          prev.wiEnd = last.wiEnd;
          prev.dur = duration * (combo.length / total);
          merged.pop();
        }
      }
    }

    merged.forEach((unit, i) => {
      const start = scene.start + duration * (unit.wiStart / total);
      const end = i === merged.length - 1
        ? scene.end
        : scene.start + duration * (unit.wiEnd / total);
      const lines = wrapWords(unit.words, opts.maxChars);
      const textOut = unit.words.join(' ');
      const safeEnd = Math.max(end, start + 0.01);
      // Timing per kata untuk subtitle karaoke. Dibagi rata di dalam cue
      // (setara dengan porsi global wiStart..wiEnd), tetap deterministik.
      const step = (safeEnd - start) / unit.words.length;
      const wordTimes = unit.words.map((w, k) => ({
        text: w,
        start: r3(start + step * k),
        end: r3(start + step * (k + 1)),
      }));
      subs.push({
        id: `${scene.id}:sub${i + 1}`,
        sceneId: scene.id,
        text: textOut,
        lines,
        start: r3(start),
        end: r3(safeEnd),
        duration: r3(Math.max(0.01, end - start)),
        words: unit.words.length,
        wordTimes,
      });
    });
  }

  return subs.sort((a, b) => a.start - b.start);
}

export function subtitleStats(subs) {
  const list = Array.isArray(subs) ? subs : [];
  const maxLines = list.reduce((m, s) => Math.max(m, s.lines?.length || 0), 0);
  const maxChars = list.reduce(
    (m, s) => Math.max(m, ...(s.lines || []).map((l) => l.length)),
    0,
  );
  return {
    count: list.length,
    maxLines,
    maxChars,
    firstStart: list.length ? list[0].start : 0,
    lastEnd: list.length ? list[list.length - 1].end : 0,
    words: list.reduce((a, s) => a + (s.words || 0), 0),
  };
}

/**
 * Periksa konsistensi `wordTimes` (subtitle karaoke). Cue lama tanpa
 * `wordTimes` dianggap sah (runtime memakai penggambaran biasa).
 */
export function validateWordTimes(subs) {
  const problems = [];
  for (const s of Array.isArray(subs) ? subs : []) {
    const wt = s.wordTimes;
    if (wt === undefined) continue;
    if (!Array.isArray(wt)) {
      problems.push(`${s.id}: wordTimes harus array`);
      continue;
    }
    const total = words(s.text || (s.lines || []).join(' ')).length;
    if (wt.length !== total) {
      problems.push(`${s.id}: wordTimes ${wt.length} kata, teks ${total} kata`);
    }
    let prev = -Infinity;
    for (let i = 0; i < wt.length; i++) {
      const w = wt[i];
      const at = `${s.id}: wordTimes #${i + 1}`;
      if (!w || typeof w !== 'object') {
        problems.push(`${at} bukan objek`);
        continue;
      }
      if (!w.text) problems.push(`${at} tanpa text`);
      if (!Number.isFinite(w.start) || !Number.isFinite(w.end)) {
        problems.push(`${at} start/end bukan angka`);
        continue;
      }
      if (w.end <= w.start) problems.push(`${at} end <= start`);
      if (w.start < s.start - 0.002 || w.start > s.end + 0.002 || w.end > s.end + 0.002) {
        problems.push(`${at} keluar rentang cue`);
      }
      if (w.start < prev - 0.002) problems.push(`${at} waktu mundur`);
      prev = w.start;
    }
  }
  return problems;
}


function srtTime(t) {
  const ms = Math.max(0, Math.round(Number(t) * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const r = ms % 1000;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(r).padStart(3, '0')}`;
}

export function toSrt(subs) {
  return (Array.isArray(subs) ? subs : [])
    .map((s, i) => `${i + 1}\n${srtTime(s.start)} --> ${srtTime(s.end)}\n${s.lines.join('\n')}\n`)
    .join('\n');
}

function assTime(t) {
  const cs = Math.max(0, Math.round(Number(t) * 100));
  const h = Math.floor(cs / 360000);
  const m = Math.floor((cs % 360000) / 6000);
  const s = Math.floor((cs % 6000) / 100);
  const c = cs % 100;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(c).padStart(2, '0')}`;
}

function escapeAss(line) {
  return String(line)
    .replace(/\\/g, '\\\\')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}');
}

const ASS_HEADER = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 2
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Vigen,DejaVu Sans,44,&H00C9E6F2,&H00C9E6F2,&H00070B10,&H80000000,-1,0,0,0,100,100,0,0,1,2,0,2,84,84,370,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

export function toAss(subs) {
  const body = (Array.isArray(subs) ? subs : []).map((s) => {
    const text = (s.lines || []).map(escapeAss).join('\\N');
    return `Dialogue: 0,${assTime(s.start)},${assTime(s.end)},Vigen,,0,0,0,,${text}`;
  }).join('\n');
  return `${ASS_HEADER}${body}${body ? '\n' : ''}`;
}

/** Tulis out/subtitle.srt + out/subtitle.ass. */
export function writeSubtitleFiles(projectDir, subs, { dir = path.join(projectDir, 'out') } = {}) {
  ensureDir(dir);
  const srt = path.join(dir, 'subtitle.srt');
  const ass = path.join(dir, 'subtitle.ass');
  fs.writeFileSync(srt, toSrt(subs));
  fs.writeFileSync(ass, toAss(subs));
  return { srt, ass };
}
