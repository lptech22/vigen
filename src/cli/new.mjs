import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { parseArgs, line, section, color, ok, info, humanBytes } from '../core/util.mjs';
import { ensureWorkspace, createProject } from '../core/workspace.mjs';

export async function newCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const name = rest.join(' ').trim();
  if (!name) throw new Error('sebutkan nama project, contoh: vigen new "Konten 2"');

  const cfg = loadConfig();
  const ws = cfg.workspace;

  const before = ensureWorkspace(ws);
  if (before.created) info(`workspace baru dibuat: ${ws}`);

  const { dir, meta } = createProject(ws, name, cfg, {
    niche: flags.niche ? String(flags.niche) : undefined,
    tone: flags.tone ? String(flags.tone) : undefined,
  });

  line(`${color.bold('Project dibuat')}`);
  ok(meta.name);
  info(`slug     : ${meta.slug}`);
  info(`folder   : ${dir}`);
  info(`niche    : ${meta.niche} · tone: ${meta.tone}`);
  info(`format   : ${meta.format.width}x${meta.format.height} @${meta.format.fps}fps`);

  section('Isi folder');
  for (const item of ['brief.md', 'script.json', 'scene.js', 'tts/', 'voice/', 'assets/', 'out/']) {
    line(`  ${color.gray('·')} ${item}`);
  }

  section('Berikutnya');
  line(`  1. isi ${color.cyan(path.join(dir, 'brief.md'))}`);
  line(`  2. ${color.cyan('vigen list')} untuk melihat status`);
  return 0;
}
