import os from 'node:os';
import path from 'node:path';
import { loadConfig, updateConfig, ENGINE_VERSION } from '../core/config.mjs';
import { parseArgs, expandHome, line, section, color, ok, warn, info, bad } from '../core/util.mjs';
import {
  ensureWorkspace, scanAdoptable, adoptProject, createProject, listProjects, shortDate,
} from '../core/workspace.mjs';

const FALLBACK_CODES = new Set(['EACCES', 'EPERM', 'EROFS', 'ENOENT']);

function openWorkspace(preferred, { allowFallback = true } = {}) {
  try {
    return { ws: preferred, created: ensureWorkspace(preferred).created, fellBack: false };
  } catch (err) {
    const hint = ['EACCES', 'EPERM', 'EROFS'].includes(err.code)
      ? '\nJalankan: termux-setup-storage lalu izinkan akses'
      : '';
    if (!allowFallback || !FALLBACK_CODES.has(err.code)) {
      throw new Error(`tidak bisa menyiapkan workspace di ${preferred} (${err.code || err.message})${hint}`);
    }
    const alt = path.join(os.homedir(), 'Vigen');
    warn(`tidak bisa menulis ke ${preferred} (${err.code}). Memakai ${alt}`);
    const r = ensureWorkspace(alt);
    return { ws: alt, created: r.created, fellBack: true };
  }
}

export async function setupCommand(argv) {
  const { flags } = parseArgs(argv);
  const cfg = loadConfig();

  const wanted = flags.workspace ? path.resolve(expandHome(String(flags.workspace))) : cfg.workspace;
  const { ws, created, fellBack } = openWorkspace(wanted, { allowFallback: !flags.workspace });

  line(`${color.bold('Vigen setup')} ${color.gray(`— v${ENGINE_VERSION} by LPTech`)}`);

  // adopsi folder lama yang belum punya vigen.project.json
  const adopted = [];
  for (const name of scanAdoptable(ws)) {
    const r = adoptProject(ws, name, cfg);
    if (r) adopted.push(r.meta.name);
  }

  let projects = listProjects(ws);
  let firstProject = null;
  if (projects.length === 0) {
    firstProject = createProject(ws, 'Konten 1', cfg).meta;
    projects = listProjects(ws);
  }

  if (ws !== cfg.workspace) {
    updateConfig({ workspace: ws });
  }

  section('Workspace');
  ok(`${ws} ${color.gray(created ? '(baru diinisialisasi)' : '(aktif)')}`);
  if (fellBack) warn('lokasi asli tidak bisa ditulis; memakai folder di home Termux');
  if (adopted.length) info(`diadopsi jadi project: ${adopted.join(', ')}`);
  if (firstProject) info(`project pertama dibuat: ${firstProject.name}`);
  if (ws !== cfg.workspace) info(`config diperbarui: workspace → ${ws}`);

  section('Project');
  if (!projects.length) {
    warn('belum ada project.');
  } else {
    for (const p of projects) {
      line(`  ${p.name.padEnd(20)} ${color.gray(p.slug.padEnd(16))} ${p.status.padEnd(12)} ${color.gray(shortDate(p.mtime))}`);
    }
  }

  section('Berikutnya');
  line(`  ${color.cyan('vigen new "Konten 2"')}   ${color.gray('buat project baru')}`);
  line(`  ${color.cyan('vigen list')}            ${color.gray('lihat semua project')}`);
  line(`  ${color.cyan('vigen doctor')}          ${color.gray('periksa lingkungan')}`);

  return 0;
}
