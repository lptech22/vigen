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
  return `export default {
  schema: 1,
  style: 'sejarah/sepia-archive',
  brand: { watermark: 'LPTech' },
  scenes: [],
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

