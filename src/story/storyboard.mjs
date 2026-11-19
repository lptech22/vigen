import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exists } from '../core/util.mjs';

/** Area aman untuk teks konten (1080x1920). Bawah disisakan untuk UI platform. */
export const SAFE = { left: 84, right: 996, top: 210, bottom: 1580 };

export const STYLE_ID = 'sejarah/sepia-archive';

export const SCENE_TYPES = [
  'hook', 'fact', 'timeline', 'quote', 'stat', 'deadpan', 'punchline', 'outro',
];

export const GAG_TYPES = [
  'stamp', 'freeze-zoom', 'record-scratch', 'timeline-corrected', 'receipt', 'chat-bubble',
];

export const DEFAULT_DURATION = {
  hook: 2.8,
  fact: 4.2,
  timeline: 4.8,
  quote: 3.6,
  stat: 3.2,
  deadpan: 3.4,
  punchline: 3.2,
  outro: 1.5,
};

export const PUNCHLINE_PAUSE = 0.4;

const r3 = (n) => Math.round(n * 1000) / 1000;

export async function loadSceneFile(projectDir) {
  const file = path.join(projectDir, 'scene.js');
  if (!exists(file)) {
    throw new Error(`scene.js tidak ada di ${projectDir}. Jalankan vigen new "<nama>" atau tulis storyboard dulu.`);
  }
  let mod;
  try {
    mod = await import(`${pathToFileURL(file).href}?v=${Date.now()}`);
  } catch (err) {
    throw new Error(`scene.js gagal dimuat: ${err.message}`);
  }
  if (!mod.default || typeof mod.default !== 'object') {
    throw new Error('scene.js harus memakai "export default { ... }"');
  }
  return mod.default;
}

function fail(msg) {
  throw new Error(`scene.js tidak valid: ${msg}`);
}

function normalizeGag(raw, where) {
  if (typeof raw === 'string') return { type: raw, at: 0 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`${where} harus string atau objek`);
  const type = raw.type || raw.id;
  if (!GAG_TYPES.includes(type)) {
    fail(`${where}: gag "${type}" tidak dikenal. Pilihan: ${GAG_TYPES.join(', ')}`);
  }
  return { ...raw, type };
}

function normalizeScene(raw, i) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(`scene #${i + 1} harus objek`);
  const type = String(raw.type || '');
  if (!SCENE_TYPES.includes(type)) {
    fail(`scene #${i + 1}: type "${type}" tidak dikenal. Pilihan: ${SCENE_TYPES.join(', ')}`);
  }
  const id = String(raw.id || `s${String(i + 1).padStart(2, '0')}`);
  if (raw.duration !== undefined && (!Number.isFinite(Number(raw.duration)) || Number(raw.duration) <= 0)) {
    fail(`scene "${id}": duration harus angka > 0`);
  }

  let gags = raw.gags ?? raw.gag;
  if (gags === undefined || gags === null) gags = [];
  else if (!Array.isArray(gags)) gags = [gags];
  gags = gags.map((g, gi) => normalizeGag(g, `scene "${id}" gag #${gi + 1}`));

  return { ...raw, id, type, gags };
}

export function validateSceneData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('harus objek');
  if (Number(raw.schema) !== 1) fail(`schema harus 1 (sekarang ${raw.schema})`);
  const style = raw.style || STYLE_ID;
  if (style !== STYLE_ID) fail(`style "${style}" belum didukung. Pilihan: ${STYLE_ID}`);
  if (!Array.isArray(raw.scenes) || raw.scenes.length === 0) fail('scenes kosong; minimal 1 scene');

  const scenes = raw.scenes.map(normalizeScene);
  const ids = new Set();
  for (const s of scenes) {
    if (ids.has(s.id)) fail(`id scene "${s.id}" dipakai lebih dari sekali`);
    ids.add(s.id);
  }

  // pastikan bisa dikirim ke browser (tanpa fungsi/kelas)
  let plain;
  try {
    plain = JSON.parse(JSON.stringify({ ...raw, style, scenes }));
  } catch (err) {
    fail(`data tidak bisa diserialisasi: ${err.message}`);
  }
  return plain;
}

function findByTimeline(timeline, scenes, notes) {
  const tl = timeline.scenes;
  const byId = new Map(tl.map((s, i) => [s.id, { ...s, index: i }]));

  const head = scenes.slice(0, tl.length);
  const extra = scenes.slice(tl.length);
  const exact = head.every((s) => byId.has(s.id));

  if (!exact) {
    let hasAny = head.some((s) => byId.has(s.id));
    if (hasAny) {
      const missing = head.filter((s) => !byId.has(s.id)).map((s) => s.id);
      fail(`id scene tidak cocok dengan file voice: ${missing.join(', ')}. ` +
        `Samakan id di scene.js dengan nama file voice (tanpa ekstensi).`);
    }
    notes.push('id scene tidak cocok; dipetakan berdasarkan urutan (index).');
  }

  const mapped = head.map((s, i) => {
    const t = exact ? byId.get(s.id) : { ...tl[i], index: i };
    const next = tl[t.index + 1];
    const start = t.start;
    const end = next ? next.start : timeline.totalDuration;
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
      fail(`scene "${s.id}": rentang waktu tidak valid (${start}–${end}). ` +
        `Hapus .work/timeline.json lalu jalankan ulang vigen timing.`);
    }
    return { ...s, start: r3(start), end: r3(end), duration: r3(Math.max(0.05, end - start)), voiceId: t.id };
  });

  let cursor = timeline.totalDuration;
  const extras = extra.map((s) => {
    const dur = Number(s.duration ?? DEFAULT_DURATION[s.type]);
    const start = cursor;
    cursor += dur;
    return { ...s, start: r3(start), end: r3(cursor), duration: r3(dur) };
  });

  return { scenes: [...mapped, ...extras], end: r3(cursor) };
}

function sequential(scenes) {
  let cursor = 0;
  return scenes.map((s) => {
    const dur = Number(s.duration ?? DEFAULT_DURATION[s.type]);
    const start = cursor;
    cursor += dur;
    return { ...s, start: r3(start), end: r3(cursor), duration: r3(dur) };
  });
}

/**
 * Gabungkan storyboard dari scene.js dengan timeline audio.
 * Scene yang punya voice memakai start/end dari timeline (termasuk jeda);
 * scene tambahan dan outro diletakkan setelahnya.
 */
export function buildStoryboard({ cfg, sceneData, timeline = null }) {
  const data = validateSceneData(sceneData);
  const notes = [];

  let baseScenes;
  let cursor;

  if (timeline && Array.isArray(timeline.scenes) && timeline.scenes.length) {
    if (data.scenes.length < timeline.scenes.length) {
      fail(`scene.js punya ${data.scenes.length} scene, tetapi voice punya ${timeline.scenes.length} file. ` +
        `Tambahkan scene yang kurang atau hapus voice berlebih.`);
    }
    const mapped = findByTimeline(timeline, data.scenes, notes);
    baseScenes = mapped.scenes;
    cursor = mapped.end;
  } else {
    baseScenes = sequential(data.scenes);
    cursor = baseScenes.length ? baseScenes[baseScenes.length - 1].end : 0;
  }

  let scenes = baseScenes;
  const last = scenes[scenes.length - 1];
  if (!last || last.type !== 'outro') {
    const dur = Number(cfg.brand?.outro ?? 1.5) || 1.5;
    scenes = [...scenes, {
      id: 'outro',
      type: 'outro',
      start: r3(cursor),
      end: r3(cursor + dur),
      duration: r3(dur),
      auto: true,
      gags: [],
    }];
    cursor += dur;
  }

  scenes = scenes.map((s) => ({ ...s, gags: s.gags || [] }));
  const totalDuration = r3(cursor);

  return {
    schema: 1,
    style: STYLE_ID,
    width: cfg.output.width,
    height: cfg.output.height,
    fps: cfg.output.fps,
    duration: totalDuration,
    watermark: cfg.brand?.watermark || 'LPTech',
    safe: SAFE,
    punchlinePause: PUNCHLINE_PAUSE,
    scenes,
    notes,
  };
}

/** Storyboard demo 5 detik untuk `vigen test` dan `vigen still` tanpa project. */
export function demoStoryboard(cfg, duration = 5) {
  const d = Number(duration) || 5;
  return {
    schema: 1,
    style: STYLE_ID,
    width: cfg.output.width,
    height: cfg.output.height,
    fps: cfg.output.fps,
    duration: d,
    watermark: cfg.brand?.watermark || 'LPTech',
    safe: SAFE,
    punchlinePause: PUNCHLINE_PAUSE,
    scenes: [{
      id: 'demo',
      type: 'hook',
      start: 0,
      end: d,
      duration: d,
      kicker: 'SEJARAH · UJI MESIN',
      title: '40 HARI',
      subtitle: 'MALAKA · 1511',
      gags: [],
    }],
    notes: [],
  };
}
