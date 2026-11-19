import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureDir } from '../core/util.mjs';

const execFileAsync = promisify(execFile);

/**
 * SFX dibuat prosedural dengan ffmpeg (bukan file berlisensi).
 * Semua resep deterministik: parameter tetap, tanpa sumber acak eksternal.
 */
const RECIPES = {
  whoosh: [
    '-f', 'lavfi', '-i', 'anoisesrc=color=pink:sample_rate=48000:duration=0.55:amplitude=0.6:seed=7',
    '-af', 'highpass=f=280,lowpass=f=4200,afade=t=in:st=0:d=0.06,afade=t=out:st=0.32:d=0.23,volume=0.85',
  ],
  boom: [
    '-f', 'lavfi', '-i', 'sine=frequency=64:sample_rate=48000:duration=0.9',
    '-af', 'afade=t=in:st=0:d=0.01,afade=t=out:st=0.05:d=0.85,volume=1.0',
  ],
  scratch: [
    '-f', 'lavfi', '-i', 'anoisesrc=color=white:sample_rate=48000:duration=0.32:amplitude=0.7:seed=11',
    '-af', 'highpass=f=1200,lowpass=f=7200,afade=t=in:st=0:d=0.02,afade=t=out:st=0.18:d=0.14,volume=0.7',
  ],
  pop: [
    '-f', 'lavfi', '-i', 'sine=frequency=430:sample_rate=48000:duration=0.14',
    '-af', 'afade=t=out:st=0.02:d=0.12,volume=0.9',
  ],
  tick: [
    '-f', 'lavfi', '-i', 'anoisesrc=color=white:sample_rate=48000:duration=0.06:amplitude=0.5:seed=13',
    '-af', 'highpass=f=2500,afade=t=out:st=0.01:d=0.05,volume=0.5',
  ],
};

export const SFX_IDS = Object.keys(RECIPES);

export async function ensureSfx(cfg, workDir, id) {
  const recipe = RECIPES[id];
  if (!recipe) {
    throw new Error(`SFX "${id}" tidak dikenal. Pilihan: ${SFX_IDS.join(', ')}`);
  }
  const dir = ensureDir(path.join(workDir, 'sfx'));
  const out = path.join(dir, `${id}.wav`);
  if (fs.existsSync(out)) return out;

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...recipe,
    '-ac', '1', '-ar', '48000', '-c:a', 'pcm_s16le',
    out,
  ];
  try {
    await execFileAsync(cfg.paths.ffmpeg, args, { maxBuffer: 4 * 1024 * 1024 });
  } catch (err) {
    throw new Error(`gagal membuat SFX "${id}": ${err.stderr || err.message}`);
  }
  return out;
}
