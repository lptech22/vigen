import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { exists } from '../core/util.mjs';
import { STYLE_IDS, DEFAULT_STYLE, LEGACY_STYLE } from './styles.mjs';

/** Area aman untuk teks konten (1080x1920). Bawah disisakan untuk UI platform. */
export const SAFE = { left: 84, right: 996, top: 210, bottom: 1580 };

/** Gaya lama; dipakai demo/test agar hasilnya tetap identik. */
export const STYLE_ID = LEGACY_STYLE;

export const SCENE_TYPES = [
  'hook', 'fact', 'timeline', 'quote', 'stat', 'deadpan', 'punchline', 'outro',
  'diorama', 'adegan',
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
  diorama: 4.4,
  adegan: 4.6,
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

const CAMERA_EASE = ['linear', 'inOut', 'out'];
const CAMERA_MAX_KEYS = 12;

function cameraNumber(value, fallback, where, key, min, max) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${where}: camera.${key} harus angka`);
  if (n < min || n > max) fail(`${where}: camera.${key} di luar batas ${min}..${max}`);
  return n;
}

function buildCamera(keys, opts, where, defaultContent = false) {
  if (!keys.length) fail(`${where}: camera butuh minimal 1 keyframe`);
  if (keys.length > CAMERA_MAX_KEYS) fail(`${where}: camera maksimal ${CAMERA_MAX_KEYS} keyframe`);
  const out = keys.map((raw, i) => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      fail(`${where}: camera keyframe #${i + 1} harus objek`);
    }
    const at = i === 0 && raw.at === undefined
      ? 0
      : i === keys.length - 1 && raw.at === undefined
        ? 1
        : cameraNumber(raw.at, 0, where, `keyframe #${i + 1}.at`, 0, 1);
    return {
      at,
      x: cameraNumber(raw.x, 0, where, `keyframe #${i + 1}.x`, -600, 600),
      y: cameraNumber(raw.y, 0, where, `keyframe #${i + 1}.y`, -900, 900),
      zoom: cameraNumber(raw.zoom, 1, where, `keyframe #${i + 1}.zoom`, 0.5, 2),
      rotate: cameraNumber(raw.rotate, 0, where, `keyframe #${i + 1}.rotate`, -15, 15),
    };
  }).sort((a, b) => a.at - b.at);

  if (out[0].at > 0) out.unshift({ ...out[0], at: 0 });
  if (out[out.length - 1].at < 1) out.push({ ...out[out.length - 1], at: 1 });

  const ease = CAMERA_EASE.includes(opts.ease) ? opts.ease : 'inOut';
  const content = opts.content === undefined ? Boolean(defaultContent) : Boolean(opts.content);
  return { keys: out, ease, content };
}

function normalizeCamera(raw, where, defaultContent = false) {
  if (raw === undefined || raw === null || raw === false) return null;
  if (Array.isArray(raw)) return buildCamera(raw, {}, where, defaultContent);
  if (typeof raw !== 'object') fail(`${where}: camera harus objek atau array keyframe`);

  if (Array.isArray(raw.keys)) return buildCamera(raw.keys, raw, where, defaultContent);
  if (raw.from || raw.to) {
    return buildCamera([
      { at: 0, ...(raw.from || {}) },
      { at: 1, ...(raw.to || {}) },
    ], raw, where, defaultContent);
  }
  fail(`${where}: camera butuh "from/to", "keys", atau array keyframe`);
}

const GROUND_TYPES = ['island', 'table', 'none'];
const PROP_MAX = 12;
const CAST_MAX = 6;
const CALLOUT_MAX = 4;
const CALLOUT_TEXT_MAX = 40;
const CHAPTER_TEXT_MAX = 70;
const CHAPTER_HIGHLIGHT_MAX = 40;
const ENTRY_ANIM = ['pop', 'drop', 'slide', 'rise'];
const CAST_POSE = ['idle', 'point', 'hold'];

/** Header bab: string, { text, highlight }, atau false untuk menghapus. */
function normalizeChapter(raw, where) {
  if (raw === false) return false;
  if (typeof raw === 'string') {
    const text = raw.trim();
    if (!text) fail(`${where}: chapter tidak boleh kosong`);
    if (text.length > CHAPTER_TEXT_MAX) {
      fail(`${where}: chapter maksimal ${CHAPTER_TEXT_MAX} karakter`);
    }
    return { text };
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    fail(`${where}: chapter harus string, { text, highlight }, atau false`);
  }
  const text = String(raw.text || '').trim();
  if (!text) fail(`${where}: chapter.text wajib diisi`);
  if (text.length > CHAPTER_TEXT_MAX) {
    fail(`${where}: chapter.text maksimal ${CHAPTER_TEXT_MAX} karakter`);
  }
  const out = { text };
  if (raw.highlight !== undefined && raw.highlight !== null) {
    const highlight = String(raw.highlight).trim();
    if (highlight) {
      if (highlight.length > CHAPTER_HIGHLIGHT_MAX) {
        fail(`${where}: chapter.highlight maksimal ${CHAPTER_HIGHLIGHT_MAX} karakter`);
      }
      if (!text.includes(highlight)) {
        fail(`${where}: chapter.highlight "${highlight}" harus bagian dari chapter.text`);
      }
      out.highlight = highlight;
    }
  }
  return out;
}

function propNumber(value, fallback, where, key, min, max) {
  if (value === undefined || value === null) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) fail(`${where}: ${key} harus angka`);
  if (n < min || n > max) fail(`${where}: ${key} di luar batas ${min}..${max}`);
  return n;
}

function normalizeAnim(value, where) {
  if (value === undefined || value === null) return undefined;
  const anim = String(value);
  if (!ENTRY_ANIM.includes(anim)) {
    fail(`${where}: anim "${anim}" tidak dikenal. Pilihan: ${ENTRY_ANIM.join(', ')}`);
  }
  return anim;
}

/** Prop untuk scene `diorama` / `adegan`. String = nama saja. */
function normalizeProps(raw, where) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(`${where}: props harus array`);
  if (raw.length > PROP_MAX) fail(`${where}: props maksimal ${PROP_MAX}`);

  return raw.map((item, i) => {
    const at = `${where} prop #${i + 1}`;
    if (typeof item === 'string') return { name: item };
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`${at} harus string atau objek { name, x, y, scale, rotate }`);
    }
    const name = String(item.name || item.prop || '');
    if (!name) fail(`${at}: name wajib diisi`);
    const out = { name };
    if (item.x !== undefined) out.x = propNumber(item.x, 0, at, 'x', -200, 1280);
    if (item.y !== undefined) out.y = propNumber(item.y, 0, at, 'y', 300, 1700);
    if (item.scale !== undefined) out.scale = propNumber(item.scale, 1, at, 'scale', 0.2, 2);
    if (item.rotate !== undefined) out.rotate = propNumber(item.rotate, 0, at, 'rotate', -30, 30);
    if (item.alpha !== undefined) out.alpha = propNumber(item.alpha, 1, at, 'alpha', 0, 1);
    if (item.delay !== undefined) out.delay = propNumber(item.delay, 0, at, 'delay', 0, 4);
    const anim = normalizeAnim(item.anim, at);
    if (anim) out.anim = anim;
    return out;
  });
}

/** Karakter untuk scene `adegan`. */
function normalizeCast(raw, where) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(`${where}: cast harus array`);
  if (raw.length > CAST_MAX) fail(`${where}: cast maksimal ${CAST_MAX}`);

  return raw.map((item, i) => {
    const at = `${where} cast #${i + 1}`;
    if (typeof item === 'string') return { who: item };
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`${at} harus string atau objek { who, x, y, scale, pose }`);
    }
    const who = String(item.who || item.name || '');
    if (!who) fail(`${at}: who wajib diisi`);
    const out = { who };
    if (item.x !== undefined) out.x = propNumber(item.x, 0, at, 'x', -200, 1280);
    if (item.y !== undefined) out.y = propNumber(item.y, 0, at, 'y', 300, 1700);
    if (item.scale !== undefined) out.scale = propNumber(item.scale, 1, at, 'scale', 0.3, 1.6);
    if (item.rotate !== undefined) out.rotate = propNumber(item.rotate, 0, at, 'rotate', -30, 30);
    if (item.alpha !== undefined) out.alpha = propNumber(item.alpha, 1, at, 'alpha', 0, 1);
    if (item.delay !== undefined) out.delay = propNumber(item.delay, 0, at, 'delay', 0, 4);
    if (item.flip !== undefined) out.flip = Boolean(item.flip);
    if (item.pose !== undefined) {
      const pose = String(item.pose);
      if (!CAST_POSE.includes(pose)) {
        fail(`${at}: pose "${pose}" tidak dikenal. Pilihan: ${CAST_POSE.join(', ')}`);
      }
      out.pose = pose;
    }
    const anim = normalizeAnim(item.anim, at);
    if (anim) out.anim = anim;
    return out;
  });
}

/** Label penunjuk ke objek di dunia. */
function normalizeCallouts(raw, where) {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) fail(`${where}: callouts harus array`);
  if (raw.length > CALLOUT_MAX) fail(`${where}: callouts maksimal ${CALLOUT_MAX}`);

  return raw.map((item, i) => {
    const at = `${where} callout #${i + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      fail(`${at} harus objek { text, x, y, dx, dy }`);
    }
    const text = String(item.text || '');
    if (!text) fail(`${at}: text wajib diisi`);
    if (text.length > CALLOUT_TEXT_MAX) {
      fail(`${at}: text maksimal ${CALLOUT_TEXT_MAX} karakter (sekarang ${text.length})`);
    }
    return {
      text,
      x: propNumber(item.x, 540, at, 'x', 0, 1080),
      y: propNumber(item.y, 1100, at, 'y', 200, 1700),
      dx: propNumber(item.dx, 70, at, 'dx', -420, 420),
      dy: propNumber(item.dy, -90, at, 'dy', -420, 420),
    };
  });
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

  const scene = { ...raw, id, type, gags };
  const world = type === 'diorama' || type === 'adegan';
  if (raw.chapter !== undefined) {
    scene.chapter = normalizeChapter(raw.chapter, `scene "${id}"`);
  }
  // Field dunia hanya masuk akal di tipe yang memakainya. Gagal jelas lebih
  // baik daripada diam-diam diabaikan (sering terjadi pada hasil AI).
  if (!world) {
    if (raw.ground !== undefined) fail(`scene "${id}": ground hanya untuk diorama/adegan`);
    if (raw.props !== undefined) fail(`scene "${id}": props hanya untuk diorama/adegan`);
  }
  if (type !== 'adegan') {
    if (raw.cast !== undefined) fail(`scene "${id}": cast hanya untuk adegan`);
    if (raw.callouts !== undefined) fail(`scene "${id}": callouts hanya untuk adegan`);
  }
  if (raw.camera !== undefined) {
    // Scene dunia: kamera menggerakkan dunia, jadi default content = true.
    scene.camera = normalizeCamera(raw.camera, `scene "${id}"`, world);
  }
  if (world) {
    const ground = raw.ground === undefined ? 'island' : String(raw.ground);
    if (!GROUND_TYPES.includes(ground)) {
      fail(`scene "${id}": ground "${ground}" tidak dikenal. Pilihan: ${GROUND_TYPES.join(', ')}`);
    }
    scene.ground = ground;
    scene.props = normalizeProps(raw.props, `scene "${id}"`);
  }
  if (type === 'adegan') {
    scene.cast = normalizeCast(raw.cast, `scene "${id}"`);
    scene.callouts = normalizeCallouts(raw.callouts, `scene "${id}"`);
    if (!scene.cast.length) fail(`scene "${id}": adegan butuh minimal 1 cast`);
  }
  return scene;
}

export function validateSceneData(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('harus objek');
  if (Number(raw.schema) !== 1) fail(`schema harus 1 (sekarang ${raw.schema})`);
  // Project lama yang tidak menulis style tetap memakai sepia; project baru
  // (template/prompt) menulis 'sejarah/diorama' secara eksplisit.
  const style = raw.style || LEGACY_STYLE;
  if (!STYLE_IDS.includes(style)) {
    fail(`style "${style}" belum didukung. Pilihan: ${STYLE_IDS.join(', ')}`);
  }
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
    style: data.style || DEFAULT_STYLE,
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
