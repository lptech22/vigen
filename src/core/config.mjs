import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ensureDir, exists, expandTmp } from './util.mjs';

export const ENGINE_VERSION = '0.7.0';
export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
export const CONFIG_DIR = path.join(os.homedir(), '.vigen');
export const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

const PREFIX = process.env.PREFIX || '/data/data/com.termux/files/usr';
const FONT_DIR = path.join(PREFIX, 'share/fonts/TTF');

export const WORKSPACE_CANDIDATES = [
  '/storage/emulated/0/Vigen',
  path.join(os.homedir(), 'Vigen'),
];

export function pickWorkspace() {
  for (const p of WORKSPACE_CANDIDATES) {
    try {
      fs.accessSync(path.dirname(p), fs.constants.W_OK);
      return p;
    } catch {
      /* coba kandidat berikutnya */
    }
  }
  return path.join(os.homedir(), 'Vigen');
}

export function defaultConfig() {
  return {
    configVersion: 1,
    engine: { version: ENGINE_VERSION, name: 'Vigen', vendor: 'LPTech' },
    paths: {
      ffmpeg: 'ffmpeg',
      ffprobe: 'ffprobe',
      chromium: 'chromium-browser',
    },
    workspace: pickWorkspace(),
    fonts: {
      display: path.join(FONT_DIR, 'DejaVuSerif-Bold.ttf'),
      ui: path.join(FONT_DIR, 'DejaVuSans.ttf'),
    },
    output: {
      width: 1080,
      height: 1920,
      fps: 30,
      crf: 20,
      preset: 'veryfast',
    },
    render: {
      chunk: 300,
      tempDir: '$TMPDIR/vigen',
    },
    subs: {
      enabled: true,
      maxChars: 38,
      maxLines: 2,
      minDuration: 0.55,
    },
    preview: {
      scale: 0.5,
      crf: 30,
      capture: 'jpeg:0.92',
    },
    brand: {
      watermark: 'LPTech',
      outro: 1.5,
    },
  };
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return patch ?? base;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const [k, v] of Object.entries(patch)) {
    out[k] = v && typeof v === 'object' && !Array.isArray(v) ? deepMerge(base?.[k] ?? {}, v) : v;
  }
  return out;
}

export function loadConfig({ create = true } = {}) {
  let cfg = defaultConfig();
  if (exists(CONFIG_PATH)) {
    try {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
      cfg = deepMerge(cfg, raw);
    } catch (err) {
      throw new Error(`config rusak di ${CONFIG_PATH}: ${err.message}\nPerbaiki atau hapus file itu, lalu jalankan: vigen doctor`);
    }
  } else if (create) {
    ensureDir(CONFIG_DIR);
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(defaultConfig(), null, 2) + '\n');
  }
  cfg.render.tempDir = expandTmp(cfg.render.tempDir);
  cfg.workspace = path.resolve(cfg.workspace);

  // simpan versi engine terbaru ke config (migrasi ringan)
  if (cfg.engine?.version !== ENGINE_VERSION && create) {
    cfg.engine = { ...(cfg.engine || {}), version: ENGINE_VERSION };
    try {
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2) + '\n');
    } catch { /* config read-only: abaikan */ }
  }

  return cfg;
}

/** Simpan patch ke config tanpa menyentuh nilai lain (path tetap portabel). */
export function updateConfig(patch) {
  const raw = exists(CONFIG_PATH) ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) : defaultConfig();
  const merged = deepMerge(raw, patch);
  ensureDir(path.dirname(CONFIG_PATH));
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(merged, null, 2) + '\n');
  return merged;
}

export function runtimePaths(cfg) {
  const tmp = ensureDir(path.join(cfg.render.tempDir, 'run'));
  return {
    tmp,
    profile: ensureDir(path.join(tmp, 'chromium-profile')),
    stage: path.join(ROOT, 'src/runtime/stage.html'),
  };
}

export function projectWorkDir(base) {
  return ensureDir(path.join(base, '.work'));
}

export function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file));
  const tmp = `${file}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n');
  fs.renameSync(tmp, file);
}
