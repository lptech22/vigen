import fs from 'node:fs';
import { loadConfig, ENGINE_VERSION, readJson } from '../core/config.mjs';
import { parseArgs, line, section, color, ok, info, warn, bad, pad } from '../core/util.mjs';
import { listProjects, readWorkspace, scanAdoptable, shortDate } from '../core/workspace.mjs';

const STATUS_COLOR = {
  selesai: color.green,
  'siap render': color.cyan,
  naskah: color.yellow,
  baru: color.gray,
};

export async function listCommand(argv) {
  const { flags } = parseArgs(argv);
  const cfg = loadConfig();
  const ws = cfg.workspace;

  if (!fs.existsSync(ws)) {
    bad(`workspace belum ada: ${ws}`);
    info('Jalankan: vigen setup');
    return 1;
  }

  const marker = readWorkspace(ws);
  if (!marker) {
    warn(`folder ${ws} belum ditandai sebagai workspace Vigen`);
    info('Jalankan: vigen setup');
  }

  const projects = listProjects(ws);

  if (flags.json) {
    process.stdout.write(JSON.stringify({
      workspace: ws,
      engine: ENGINE_VERSION,
      projects,
    }, null, 2) + '\n');
    return 0;
  }

  line(`${color.bold('Vigen')} ${color.gray(`— ${projects.length} project · v${ENGINE_VERSION}`)}`);
  info(`workspace: ${ws}`);

  section('Project');
  if (!projects.length) {
    warn('belum ada project.');
    line(`  buat yang pertama: ${color.cyan('vigen new "Konten 1"')}`);
    return 0;
  }

  const wName = Math.max(7, ...projects.map((p) => p.name.length)) + 2;
  const wSlug = Math.max(6, ...projects.map((p) => p.slug.length)) + 2;

  line(`  ${color.gray(pad('PROJECT', wName) + pad('SLUG', wSlug) + pad('STATUS', 14) + pad('VOICE', 7) + pad('OUT', 5) + 'DIUBAH')}`);
  for (const p of projects) {
    const col = STATUS_COLOR[p.status] || color.gray;
    const voice = p.voices ? `${p.voices}` : '-';
    const out = p.videos ? `${p.videos}` : '-';
    line(`  ${pad(p.name, wName)}${color.gray(pad(p.slug, wSlug))}${col(pad(p.status, 14))}${pad(voice, 7)}${pad(out, 5)}${color.gray(shortDate(p.mtime))}`);
  }

  const adoptable = scanAdoptable(ws);
  if (adoptable.length) {
    warn(`${adoptable.length} folder belum jadi project: ${adoptable.join(', ')}`);
    info('Jalankan: vigen setup untuk mengadopsinya');
  }

  const done = projects.filter((p) => p.status === 'selesai').length;
  section('Ringkasan');
  ok(`${projects.length} project · ${done} selesai`);
  info('keterangan status: baru → naskah → siap render → selesai');
  return 0;
}
