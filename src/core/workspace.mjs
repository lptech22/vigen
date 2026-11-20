import fs from 'node:fs';
import path from 'node:path';
import { ENGINE_VERSION, readJson, writeJson } from './config.mjs';
import { ensureDir } from './util.mjs';

export const WORKSPACE_VERSION = 1;
export const PROJECT_VERSION = 1;

const VOICE_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);

export const PROJECT_FIELDS = ['tts', 'voice', 'assets', 'out', '.work'];

export function markerPath(ws) {
  return path.join(ws, '.vigen-workspace.json');
}

export function projectFile(dir) {
  return path.join(dir, 'vigen.project.json');
}

export function readWorkspace(ws) {
  return readJson(markerPath(ws), null);
}

export function slugify(name) {
  return String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

export function sanitizeFolderName(name) {
  let s = String(name).trim();
  if (!s) throw new Error('nama project tidak boleh kosong');
  if (s === '.' || s === '..') throw new Error('nama project tidak valid');
  if (/[/\\]/.test(s)) throw new Error('nama project tidak boleh mengandung "/" atau "\\"');
  s = s.replace(/[<>:"|?*\x00-\x1f]/g, '-').replace(/\s+/g, ' ').trim();
  s = s.replace(/[. ]+$/g, '');
  if (!s) throw new Error('nama project tidak valid');
  if (s.startsWith('.')) throw new Error('nama project tidak boleh diawali titik (disembunyikan Android)');
  if (s.length > 80) throw new Error('nama project maksimal 80 karakter');
  return s;
}

export function ensureWorkspace(ws) {
  try {
    fs.mkdirSync(ws, { recursive: true });
    const probe = path.join(ws, `.vigen-write-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
  } catch (err) {
    const e = new Error(`workspace tidak bisa ditulis: ${ws} (${err.code || err.message})`);
    e.code = err.code;
    throw e;
  }

  const existing = readWorkspace(ws);
  if (existing) {
    if (Number(existing.workspaceVersion) > WORKSPACE_VERSION) {
      throw new Error(`workspace versi ${existing.workspaceVersion} lebih baru dari engine (dukung v${WORKSPACE_VERSION}). Perbarui Vigen.`);
    }
    return { ws, created: false, marker: existing };
  }

  const marker = {
    workspaceVersion: WORKSPACE_VERSION,
    name: path.basename(ws),
    engine: ENGINE_VERSION,
    createdAt: new Date().toISOString(),
  };
  writeJson(markerPath(ws), marker);
  ensureDir(path.join(ws, '.cache'));
  return { ws, created: true, marker };
}

function writeIfMissing(file, content) {
  if (fs.existsSync(file)) return false;
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, content);
  fs.renameSync(tmp, file);
  return true;
}

function briefTemplate(name) {
  return `# ${name}

## Ide
-

## Target penonton
-

## 3 fakta yang wajib akurat
1.
2.
3.

## Angle humor (deadpan)
-

## Referensi
-

## Catatan
`;
}

function scriptTemplate(slug) {
  return JSON.stringify({
    schema: 1,
    episode: slug,
    judul: '',
    hook: '',
    scenes: [],
    publish: { judul: '', deskripsi: '', hashtag: ['#sejarah'] },
  }, null, 2) + '\n';
}

function sceneTemplate() {
  return `// Storyboard Vigen. Semua teks wajib berada di safe area:
// x 84..996, y 210..1580. Cek dengan: vigen check "<nama project>"
// Gaya: 'sejarah/diorama' (default) atau 'sejarah/sepia-archive' (lama).
export default {
  schema: 1,
  style: 'sejarah/diorama',
  brand: { watermark: 'LPTech' },
  scenes: [
    {
      id: 's01',
      type: 'hook',
      // Header bab: tampil di atas dan bertahan sampai scene berikutnya
      // mengganti nilainya. highlight = kata yang diberi warna aksen.
      chapter: {
        text: 'Kenapa rempah Nusantara diperebutkan dunia?',
        highlight: 'dunia?',
      },
      // Kamera virtual: from/to (atau array keyframe {at,x,y,zoom,rotate}).
      // content: false = hanya latar yang bergerak, teks tetap diam.
      camera: {
        from: { zoom: 1, y: 0 },
        to: { zoom: 1.06, y: -14 },
        content: false,
      },
      narasi: 'Pada 1511, Malaka jatuh ke tangan Portugis. Setidaknya begitu kata catatan resmi.',
      kicker: 'SEJARAH · EP 01',
      title: 'JUDUL EPISODE',
      subtitle: 'SUBJUDUL · TAHUN',
    },
    {
      id: 's02',
      // Scene diorama: dunia isometrik (alas + prop) dengan kamera.
      // Prop: map, book, scroll, ship, coins, scale, lantern, crate,
      //       spice, compass, fort, flag.
      // ground: 'island' | 'table' | 'none'. Teks tetap diam saat kamera bergerak.
      type: 'diorama',
      narasi: 'Peta lama menunjukkan jalur yang tidak pernah ada di catatan pelaut.',
      kicker: 'PETA',
      title: 'Jalur yang tidak pernah ada',
      body: 'Garis di peta sering ditambal tangan yang berbeda zaman.',
      ground: 'island',
      props: [
        { name: 'map', x: 540, y: 1030, scale: 0.60 },
        { name: 'ship', x: 838, y: 1150, scale: 0.40 },
        { name: 'compass', x: 268, y: 1160, scale: 0.72 },
      ],
      camera: {
        from: { zoom: 1.02, x: 0 },
        to: { zoom: 1.10, x: -18 },
        content: true,
      },
      source: 'sumber: peta arsip · koleksi',
    },
    {
      id: 's03',
      // Scene adegan: prop + karakter yang bergerak masuk mengikuti narasi.
      // Karakter: pedagang, pelaut, serdadu, raja, petani.
      // pose: 'idle' | 'point' | 'hold'. anim: 'pop' | 'drop' | 'slide' | 'rise'.
      type: 'adegan',
      narasi: 'Penjaga benteng menghitung peti, sementara raja menunggu di depan gerbang.',
      kicker: 'ADEGAN',
      title: 'Menghitung sebelum fajar',
      body: 'Peti dibuka satu per satu. Angkanya tidak pernah cocok.',
      ground: 'island',
      props: [
        { name: 'fort', x: 470, y: 980, scale: 0.55, anim: 'drop' },
        { name: 'crate', x: 700, y: 1120, scale: 0.42 },
      ],
      cast: [
        { who: 'serdadu', x: 350, y: 1170, scale: 0.9, pose: 'point', delay: 0.3 },
        { who: 'raja', x: 770, y: 1190, scale: 0.9, pose: 'idle', flip: true, delay: 0.5 },
      ],
      callouts: [
        { text: 'Benteng', x: 470, y: 940, dx: -130, dy: -120 },
      ],
      camera: {
        from: { zoom: 1.02, x: 0 },
        to: { zoom: 1.08, x: 14 },
        content: true,
      },
    },
    {
      id: 's04',
      type: 'fact',
      narasi: 'Konon armada hanya menunggu empat puluh hari sebelum angin berubah arah.',
      kicker: 'FAKTA',
      title: 'Judul fakta yang bikin penasaran',
      body: 'Satu paragraf singkat. Tulis apa adanya, jangan bertele-tele. '
        + 'Angka dan tahun boleh ditonjolkan di scene lain.',
      source: 'sumber: arsip · catatan',
    },
    {
      id: 's05',
      type: 'timeline',
      narasi: 'Urutan kejadiannya sering tertukar, dan setiap versi punya pembelanya.',
      kicker: 'GARIS WAKTU',
      title: 'Urutan kejadian',
      items: [
        { year: '1511', text: 'Kejadian pertama.' },
        { year: '1641', text: 'Kejadian kedua.' },
        { year: '1824', text: 'Kejadian ketiga.' },
      ],
      correction: { was: '1512', year: '1511', text: 'Tahun yang benar.' },
    },
    {
      id: 's06',
      type: 'punchline',
      narasi: 'Rencananya sempurna. Sayangnya, tidak ada yang membawa peta.',
      setup: 'Dan bagian yang paling masuk akal:',
      text: 'TIDAK ADA.',
      pause: 0.4,
      gag: { type: 'record-scratch', at: 0.2 },
    },
    {
      id: 's07',
      type: 'outro',
    },
  ],
};
`;
}

function projectMeta(name, slug, cfg, extra = {}) {
  return {
    projectVersion: PROJECT_VERSION,
    name,
    slug,
    createdAt: new Date().toISOString(),
    engine: ENGINE_VERSION,
    niche: extra.niche || 'sejarah',
    tone: extra.tone || 'deadpan-sarkas',
    format: {
      width: cfg.output.width,
      height: cfg.output.height,
      fps: cfg.output.fps,
    },
    ...(extra.spec ? { spec: extra.spec } : {}),
    ...(extra.audio ? { audio: extra.audio } : {}),
  };
}

function scaffold(dir, meta) {
  for (const sub of PROJECT_FIELDS) ensureDir(path.join(dir, sub));
  writeIfMissing(projectFile(dir), JSON.stringify(meta, null, 2) + '\n');
  writeIfMissing(path.join(dir, 'brief.md'), briefTemplate(meta.name));
  writeIfMissing(path.join(dir, 'script.json'), scriptTemplate(meta.slug));
  writeIfMissing(path.join(dir, 'scene.js'), sceneTemplate());
}

export function createProject(ws, rawName, cfg, extra = {}) {
  const name = sanitizeFolderName(rawName);
  const slug = slugify(name) || 'konten';

  const existing = listProjects(ws);
  const clash = existing.find((p) => p.slug === slug || p.name === name);
  if (clash) {
    throw new Error(`project "${clash.name}" sudah ada di ${clash.dir} — pilih nama lain`);
  }

  const dir = path.join(ws, name);
  if (fs.existsSync(dir)) {
    throw new Error(`folder "${name}" sudah ada tetapi bukan project Vigen. Ganti nama atau hapus foldernya.`);
  }

  fs.mkdirSync(dir);
  try {
    const meta = projectMeta(name, slug, cfg, extra);
    scaffold(dir, meta);
    return { dir, meta };
  } catch (err) {
    try { fs.rmSync(dir, { recursive: true, force: true }); } catch { /* noop */ }
    throw err;
  }
}

/** Adopsi folder lama jadi project Vigen tanpa menimpa file yang sudah ada. */
export function adoptProject(ws, dirName, cfg) {
  const dir = path.join(ws, dirName);
  if (!fs.existsSync(dir)) return null;
  const existing = readJson(projectFile(dir), null);
  if (existing) return null;

  const name = dirName;
  const slug = slugify(name) || 'konten';
  const meta = projectMeta(name, slug, cfg);
  scaffold(dir, meta);
  return { dir, meta };
}

function listFiles(dir, exts) {
  try {
    return fs.readdirSync(dir).filter((f) => exts.has(path.extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

function countScenes(dir) {
  const script = readJson(path.join(dir, 'script.json'), null);
  if (script && Array.isArray(script.scenes)) return script.scenes.length;
  return 0;
}

export function projectStatus(dir) {
  const videos = listFiles(path.join(dir, 'out'), VIDEO_EXT);
  const voices = listFiles(path.join(dir, 'voice'), VOICE_EXT);
  const tts = listFiles(path.join(dir, 'tts'), new Set(['.txt', '.md']));
  const scenes = countScenes(dir);

  let status = 'baru';
  if (videos.length) status = 'selesai';
  else if (voices.length) status = 'siap render';
  else if (scenes > 0 || tts.length) status = 'naskah';

  return { status, videos: videos.length, voices: voices.length, tts: tts.length, scenes };
}

export function listProjects(ws) {
  let entries;
  try {
    entries = fs.readdirSync(ws, { withFileTypes: true });
  } catch {
    return [];
  }

  const out = [];
  for (const e of entries) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue;
    const dir = path.join(ws, e.name);
    const meta = readJson(projectFile(dir), null);
    if (!meta) continue;
    const st = projectStatus(dir);
    let mtime = 0;
    try { mtime = fs.statSync(projectFile(dir)).mtimeMs; } catch { /* noop */ }
    out.push({
      name: meta.name || e.name,
      slug: meta.slug || slugify(e.name),
      dir,
      niche: meta.niche || 'sejarah',
      createdAt: meta.createdAt || null,
      mtime,
      ...st,
    });
  }
  out.sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || a.name.localeCompare(b.name));
  return out;
}

export function scanAdoptable(ws) {
  try {
    return fs.readdirSync(ws, { withFileTypes: true })
      .filter((e) => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
      .map((e) => e.name)
      .filter((name) => !fs.existsSync(projectFile(path.join(ws, name))));
  } catch {
    return [];
  }
}

export function shortDate(ms) {
  if (!ms) return '-';
  const d = new Date(ms);
  const bulan = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())} ${bulan[d.getMonth()]} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Cari project dari nama, slug, atau path. Tanpa argumen: hanya jika ada tepat 1 project. */
export function resolveProject(ws, query) {
  const projects = listProjects(ws);
  if (!projects.length) {
    throw new Error('belum ada project. Buat dulu: vigen new "Konten 1"');
  }
  if (!query) {
    if (projects.length === 1) return projects[0];
    throw new Error(`sebutkan nama project. Pilihan: ${projects.map((p) => `"${p.name}"`).join(', ')}`);
  }
  const q = String(query).trim().toLowerCase();
  const hit = projects.find((p) => p.name.toLowerCase() === q || p.slug.toLowerCase() === q || p.dir === query);
  if (!hit) throw new Error(`project "${query}" tidak ditemukan. Coba: vigen list`);
  return hit;
}

