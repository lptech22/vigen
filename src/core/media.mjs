import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

/** Ekstensi video yang dianggap hasil render/final. */
export const VIDEO_EXT = new Set(['.mp4', '.mov', '.webm']);

export function isPreviewVideo(name) {
  return /_preview\.(mp4|mov|webm)$/i.test(String(name || ''));
}

/** Daftar video di folder, terbaru lebih dulu. */
export function listVideos(dir) {
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => VIDEO_EXT.has(path.extname(name).toLowerCase()))
    .map((name) => {
      const file = path.join(dir, name);
      let size = 0;
      let mtimeMs = 0;
      try {
        const st = fs.statSync(file);
        size = st.size;
        mtimeMs = st.mtimeMs;
      } catch { /* file hilang di tengah scan: abaikan */ }
      return { name, file, size, mtimeMs };
    })
    .sort((a, b) => b.mtimeMs - a.mtimeMs);
}

/**
 * Pilih video final atau preview di `out/`.
 * Default selalu final `<slug>_<width>x<height>.mp4`, bukan `_preview`,
 * `_audio`, atau file uji seperti `black_defect.mp4`.
 */
export function pickVideo(dir, { slug = null, width = null, height = null, preview = false } = {}) {
  const videos = listVideos(dir);
  if (!videos.length) return null;

  if (slug) {
    const expected = preview
      ? `${slug}_preview.mp4`
      : (width && height ? `${slug}_${width}x${height}.mp4` : null);
    if (expected) {
      const hit = videos.find((v) => v.name === expected);
      if (hit) return hit.file;
    }
  }

  const filtered = videos.filter((v) => {
    if (preview) return isPreviewVideo(v.name);
    if (isPreviewVideo(v.name)) return false;
    if (/_audio\.(mp4|mov|webm)$/i.test(v.name)) return false;
    if (/^black[_-]?/i.test(v.name)) return false;
    return true;
  });

  return filtered.length ? filtered[0].file : null;
}

export function hashText(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

export function hashJson(value) {
  return hashText(JSON.stringify(value));
}

/** Hash isi file dengan buffer 1 MB, aman untuk video/audio. */
export function hashFile(file) {
  const h = crypto.createHash('sha256');
  const fd = fs.openSync(file, 'r');
  const buf = Buffer.allocUnsafe(1024 * 1024);
  try {
    let n;
    while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) {
      h.update(buf.subarray(0, n));
    }
  } finally {
    fs.closeSync(fd);
  }
  return h.digest('hex');
}

/** Fingerprint ringan untuk file besar: ukuran + mtime (bukan isi). */
export function statFingerprint(file) {
  try {
    const st = fs.statSync(file);
    return { size: st.size, mtimeMs: st.mtimeMs };
  } catch {
    return null;
  }
}

/** Path relatif terhadap project, selalu dengan pemisah `/`. */
export function projectRelative(projectDir, file) {
  if (!file) return null;
  const rel = path.relative(projectDir, file);
  return rel.split(path.sep).join('/');
}
