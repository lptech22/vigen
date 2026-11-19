import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { loadConfig, CONFIG_PATH, ROOT, ENGINE_VERSION } from '../core/config.mjs';
import { readWorkspace } from '../core/workspace.mjs';
import { ensureDir, exists, pad, line, section, color, ok, warn, bad, info, humanBytes } from '../core/util.mjs';

function tryExec(cmd, args, timeout = 12000) {
  try {
    const out = execFileSync(cmd, args, { encoding: 'utf8', timeout, stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, out: out.trim() };
  } catch (err) {
    return { ok: false, out: String(err.stdout || '').trim(), err: String(err.stderr || err.message || '').trim() };
  }
}

function nodeMajor(v) {
  return Number(String(v).replace(/^v/, '').split('.')[0] || 0);
}

function memAvailableMB() {
  try {
    const txt = fs.readFileSync('/proc/meminfo', 'utf8');
    const m = txt.match(/MemAvailable:\s+(\d+)\s+kB/);
    return m ? Math.round(Number(m[1]) / 1024) : null;
  } catch {
    return null;
  }
}

function writable(dir) {
  try {
    ensureDir(dir);
    const probe = path.join(dir, `.vigen-probe-${process.pid}`);
    fs.writeFileSync(probe, 'ok');
    fs.rmSync(probe, { force: true });
    return true;
  } catch {
    return false;
  }
}

export async function doctorCommand() {
  const cfg = loadConfig();
  const rows = [];
  let critical = 0;

  const add = (label, status, detail, hint) => {
    rows.push({ label, status, detail, hint });
    if (status === 'bad') critical++;
  };

  line(`${color.bold('Vigen')} ${color.gray(`v${ENGINE_VERSION} — by LPTech`)}`);
  line(color.gray(`engine: ${ROOT}`));
  line(color.gray(`config: ${CONFIG_PATH}`));

  // Node
  const major = nodeMajor(process.version);
  add('node', major >= 20 ? 'ok' : 'bad', process.version, 'Butuh Node >= 20. Jalankan: pkg install nodejs');

  // ffmpeg
  const ff = tryExec(cfg.paths.ffmpeg, ['-version']);
  if (!ff.ok) {
    add('ffmpeg', 'bad', 'tidak ditemukan', 'Jalankan: pkg install ffmpeg');
  } else {
    const ver = (ff.out.split('\n')[0] || '').replace(/^ffmpeg version\s*/i, '').split(' ')[0];
    const enc = tryExec(cfg.paths.ffmpeg, ['-hide_banner', '-encoders']);
    const has264 = enc.ok && /libx264/.test(enc.out);
    const hasAss = tryExec(cfg.paths.ffmpeg, ['-hide_banner', '-filters']).out.includes(' ass ');
    add('ffmpeg', has264 ? 'ok' : 'bad', `${ver}${has264 ? ' · libx264' : ' · libx264 TIDAK ADA'}${hasAss ? ' · libass' : ''}`,
      has264 ? null : 'Pasang ffmpeg build penuh: pkg install ffmpeg');
  }

  // ffprobe
  const fp = tryExec(cfg.paths.ffprobe, ['-version']);
  add('ffprobe', fp.ok ? 'ok' : 'bad', fp.ok ? (fp.out.split('\n')[0] || '').split(' ')[2] || 'ok' : 'tidak ditemukan',
    'Jalankan: pkg install ffmpeg');

  // Chromium
  const ch = tryExec(cfg.paths.chromium, ['--version']);
  add('chromium', ch.ok ? 'ok' : 'bad', ch.ok ? (ch.out || ch.err || '').split('\n')[0] : 'tidak ditemukan',
    'Jalankan: pkg install chromium');

  // Fonts
  const displayOk = exists(cfg.fonts.display);
  const uiOk = exists(cfg.fonts.ui);
  add('font display', displayOk ? 'ok' : 'bad', path.basename(cfg.fonts.display), 'Pasang font atau ubah "fonts.display" di config');
  add('font ui', uiOk ? 'ok' : 'bad', path.basename(cfg.fonts.ui), 'Pasang font atau ubah "fonts.ui" di config');

  // Storage
  const wsParent = path.dirname(cfg.workspace);
  if (writable(wsParent)) {
    add('storage', 'ok', `${cfg.workspace} (bisa ditulis)`);
  } else {
    add('storage', 'warn', `${wsParent} tidak bisa ditulis`, 'Jalankan: termux-setup-storage lalu izinkan akses');
  }

  // Workspace
  const marker = readWorkspace(cfg.workspace);
  add('workspace', marker ? 'ok' : 'warn',
    marker ? `${cfg.workspace} (v${marker.workspaceVersion})` : 'belum di-setup',
    'Jalankan: vigen setup');

  // Temp
  if (writable(cfg.render.tempDir)) {
    add('temp', 'ok', cfg.render.tempDir);
  } else {
    add('temp', 'bad', `${cfg.render.tempDir} tidak bisa ditulis`, 'Periksa "render.tempDir" di config');
  }

  // Memory
  const mem = memAvailableMB();
  add('memori', mem === null ? 'warn' : mem >= 800 ? 'ok' : 'warn', mem === null ? 'tidak diketahui' : `${mem} MB tersedia`,
    mem !== null && mem < 800 ? 'Tutup aplikasi lain sebelum render' : null);

  // Fontconfig (informasi)
  const fc = tryExec('sh', ['-c', 'command -v fc-list']);
  add('fontconfig', 'info', fc.ok ? 'ada' : 'tidak ada (normal di Termux; font dipakai via path absolut)', null);

  section('Pemeriksaan');
  for (const r of rows) {
    const symbol = r.status === 'ok' ? color.green('✓') : r.status === 'warn' ? color.yellow('!') : r.status === 'info' ? color.gray('·') : color.red('✗');
    line(`${symbol} ${pad(r.label, 14)} ${r.detail}`);
    if (r.hint && r.status !== 'ok') line(`  ${color.gray('→ ' + r.hint)}`);
  }

  section('Ringkasan');
  if (critical === 0) {
    ok('lingkungan siap. Berikutnya: vigen still --at 2.5');
    info(`workspace: ${cfg.workspace}`);
    info(`output   : ${cfg.output.width}x${cfg.output.height} @${cfg.output.fps}fps · crf ${cfg.output.crf}`);
    return 0;
  }
  bad(`${critical} masalah kritis harus diperbaiki dulu.`);
  return 1;
}
