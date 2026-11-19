import readline from 'node:readline/promises';
import { readJson, writeJson } from '../core/config.mjs';
import { projectFile } from '../core/workspace.mjs';
import { line } from '../core/util.mjs';

function boolValue(value) {
  if (value === true || value === false) return value;
  const s = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'on', 'aktif'].includes(s)) return true;
  if (['false', '0', 'no', 'n', 'off', 'nonaktif'].includes(s)) return false;
  return undefined;
}

function saveChoice(project, enabled) {
  const file = projectFile(project.dir);
  const meta = readJson(file, {}) || {};
  if (meta.subs === enabled) return false;
  meta.subs = enabled;
  writeJson(file, meta);
  return true;
}

async function askYesNo(rl, def) {
  for (;;) {
    const raw = (await rl.question(`Aktifkan subtitle narasi? (y/n) [${def ? 'y' : 'n'}]: `))
      .trim()
      .toLowerCase();
    if (!raw) return def;
    if (['y', 'ya', 'yes'].includes(raw)) return true;
    if (['n', 'tidak', 'no'].includes(raw)) return false;
    line('  jawab y atau n.');
  }
}

/**
 * Tentukan subtitle aktif/nonaktif.
 * - pilihan disimpan di vigen.project.json (`subs`) agar diingat per project
 * - `--subs` / `--no-subs` menang dan ikut disimpan
 * - `--yes` / non-TTY memakai pilihan tersimpan atau config `subs.enabled`
 */
export async function resolveSubtitleOption({
  cfg, project, flags = {}, ask = true, persist = true,
}) {
  const file = projectFile(project.dir);
  const meta = readJson(file, {}) || {};
  const stored = typeof meta.subs === 'boolean' ? meta.subs : undefined;
  const fallback = typeof cfg.subs?.enabled === 'boolean' ? cfg.subs.enabled : true;

  const subsFlag = flags.subs !== undefined ? boolValue(flags.subs) : undefined;
  const noSubsFlag = flags['no-subs'] !== undefined ? boolValue(flags['no-subs']) : undefined;

  if (subsFlag === true && noSubsFlag === true) {
    throw new Error('pilih salah satu: --subs atau --no-subs');
  }

  let enabled;
  let source;

  if (subsFlag === true || noSubsFlag === true) {
    enabled = subsFlag === true;
    source = 'flag';
  } else if (ask && process.stdin.isTTY && process.stdout.isTTY && !flags.yes) {
    const def = stored ?? fallback;
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try {
      enabled = await askYesNo(rl, def);
    } finally {
      rl.close();
    }
    source = 'asked';
  } else {
    enabled = stored ?? fallback;
    source = stored !== undefined ? 'project' : 'config';
  }

  const changed = persist && source !== 'project' ? saveChoice(project, enabled) : false;
  return { enabled, source, changed, stored };
}
