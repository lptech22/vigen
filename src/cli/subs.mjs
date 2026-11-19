import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import {
  parseArgs, ensureDir, line, section, color, ok, info, warn, humanBytes,
} from '../core/util.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';
import { buildSubtitles, subtitleStats, writeSubtitleFiles, DEFAULT_SUBS } from '../story/subs.mjs';

/**
 * `vigen subs "<proyek>"` — hitung subtitle narasi dan tulis out/subtitle.srt + .ass
 * tanpa harus render video. Berguna untuk mengecek potongan kalimat lebih cepat.
 */
export async function subsCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);

  const outDir = ensureDir(path.join(project.dir, 'out'));
  const { storyboard, timeline } = await prepareStoryboard({
    cfg, project, retime: !flags['no-retime'], subs: false,
  });

  const opts = subtitleOptionsFrom(cfg, flags);
  const subs = buildSubtitles(storyboard, opts);
  const stats = subtitleStats(subs);

  line(`${color.bold('Vigen subs')} ${color.gray(`— ${project.name}`)}`);
  if (timeline) info(`timeline: ${timeline.scenes.length} scene · ${timeline.totalDuration.toFixed(3)} dtk`);
  info(`subtitle: ${stats.count} potongan · maks ${opts.maxLines} baris · ≤${opts.maxChars} karakter`);

  if (!subs.length) {
    warn('tidak ada narasi di scene.js — isi field `narasi` pada tiap scene.');
    return 1;
  }

  const files = writeSubtitleFiles(project.dir, subs, { dir: outDir });

  section('Contoh subtitle');
  for (const s of subs.slice(0, 5)) {
    line(`  ${color.gray(`${s.start.toFixed(2)}–${s.end.toFixed(2)}s`)}  ${s.lines.join(' / ')}`);
  }
  if (subs.length > 5) info(`… dan ${subs.length - 5} potongan lain`);

  section('Ringkasan');
  ok(files.srt);
  ok(files.ass);
  info(`${humanBytes(fs.statSync(files.srt).size)} SRT · ${humanBytes(fs.statSync(files.ass).size)} ASS · ${stats.words} kata`);
  info(`subtitle ini dipakai otomatis saat render (bila aktif).`);
  return 0;
}

/** Ambil opsi subtitle untuk render dari config + flag, tanpa menyentuh file project. */
export function subtitleOptionsFrom(cfg, flags = {}) {
  const opts = { ...DEFAULT_SUBS, ...(cfg.subs || {}) };
  const raw = flags['subs-max-chars'] ?? flags['max-chars'];
  if (raw !== undefined) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 10) throw new Error('--subs-max-chars harus angka minimal 10');
    opts.maxChars = n;
  }
  return opts;
}

/** Validasi ringan: pastikan subtitle tidak melebihi batas baris/karakter. */
export function validateSubtitles(subs, opts = {}) {
  const maxLines = Number(opts.maxLines || DEFAULT_SUBS.maxLines);
  const maxChars = Number(opts.maxChars || DEFAULT_SUBS.maxChars);
  const problems = [];
  for (const s of subs) {
    const lines = s.lines || [];
    if (lines.length > maxLines) problems.push(`${s.id}: ${lines.length} baris`);
    for (const l of lines) {
      if (l.length > maxChars + 6) problems.push(`${s.id}: baris ${l.length} karakter`);
    }
  }
  return problems;
}
