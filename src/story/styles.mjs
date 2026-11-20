/**
 * Daftar gaya visual yang didukung engine.
 *
 * `sejarah/sepia-archive` : gaya lama (kertas tua gelap, serif) — dipertahankan
 *                           agar project lama tetap identik.
 * `sejarah/diorama`       : gaya baru (kertas hangat, sans bold, header bab,
 *                           panggung isometrik) — default project baru.
 */
export const STYLE_IDS = ['sejarah/sepia-archive', 'sejarah/diorama'];

export const LEGACY_STYLE = 'sejarah/sepia-archive';

export const DEFAULT_STYLE = 'sejarah/diorama';

export function isStyle(value) {
  return STYLE_IDS.includes(value);
}
