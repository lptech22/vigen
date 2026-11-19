import { loadSceneFile, validateSceneData } from './storyboard.mjs';

/** Hitung kata; dipakai untuk pembagian durasi audio utuh dan estimasi TTS. */
export function countWords(text) {
  const s = String(text ?? '').trim();
  if (!s) return 0;
  return s.split(/\s+/).filter(Boolean).length;
}

/**
 * Ambil `narasi` per scene dari scene.js.
 * Mengembalikan null bila scene.js belum ada / tidak valid, supaya pemanggil
 * bisa memakai jalur estimasi lama.
 */
export async function loadNarration(projectDir) {
  let data;
  try {
    const raw = await loadSceneFile(projectDir);
    data = validateSceneData(raw);
  } catch {
    return null;
  }
  return data.scenes.map((s) => ({
    id: s.id,
    type: s.type,
    narasi: String(s.narasi ?? '').trim(),
    words: countWords(s.narasi),
  }));
}

/**
 * Bagi item berurutan menjadi `groups` blok contiguous, sedekat mungkin
 * dengan bobot kata yang sama. Deterministik dan tidak pernah menghasilkan
 * blok kosong selama groups <= items.length.
 */
export function splitByWords(items, groups, weightOf = (x) => x.words) {
  const n = items.length;
  if (!n) return [];
  const g = Math.max(1, Math.min(Math.floor(Number(groups) || 1), n));
  if (g === 1) return [items.slice()];

  const weights = items.map((x) => Math.max(0, Number(weightOf(x)) || 0));
  const total = weights.reduce((a, b) => a + b, 0) || n;
  const bounds = [0];
  let acc = 0;

  for (let i = 0; i < n; i++) {
    acc += weights[i] || 1;
    const remaining = g - bounds.length;
    if (remaining <= 0) break;
    const scenesAfter = n - (i + 1);
    const threshold = (total * bounds.length) / g;
    if (acc >= threshold && scenesAfter >= remaining) bounds.push(i + 1);
  }
  while (bounds.length < g) bounds.push(n - (g - bounds.length));

  const out = [];
  for (let i = 0; i < bounds.length; i++) {
    const start = bounds[i];
    const end = i + 1 < bounds.length ? bounds[i + 1] : n;
    if (end > start) out.push(items.slice(start, end));
  }
  return out;
}

/** Gabungkan narasi menjadi satu teks siap tempel ke TTS. */
export function narrationText(items) {
  const parts = items
    .map((x) => String(x.narasi ?? '').trim())
    .filter(Boolean);
  return parts.length ? `${parts.join('\n\n')}\n` : '';
}
