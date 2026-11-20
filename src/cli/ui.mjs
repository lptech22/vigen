import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { loadConfig, ENGINE_VERSION } from '../core/config.mjs';
import { parseArgs, color, line, section, ok, info, warn, bad } from '../core/util.mjs';
import { listProjects, readWorkspace } from '../core/workspace.mjs';
import { startUiServer } from '../web/server.mjs';
import { shutdownJobs } from '../web/jobs.mjs';

function openBrowser(url) {
  try {
    const child = spawn('termux-open-url', [url], { detached: true, stdio: 'ignore' });
    child.on('error', () => {});
    child.unref();
    return true;
  } catch {
    return false;
  }
}

export async function uiCommand(argv) {
  const { flags } = parseArgs(argv);
  const cfg = loadConfig();

  if (!fs.existsSync(cfg.workspace)) {
    bad(`workspace belum ada: ${cfg.workspace}`);
    info('Jalankan dulu: vigen setup');
    return 1;
  }
  if (!readWorkspace(cfg.workspace)) {
    warn(`folder ${cfg.workspace} belum ditandai sebagai workspace Vigen`);
    info('Jalankan: vigen setup');
  }

  const port = flags.port === undefined ? 7788 : Number(flags.port);
  const ui = await startUiServer({ cfg, port });
  const projects = listProjects(cfg.workspace);

  section(`Vigen UI ${color.gray(`v${ENGINE_VERSION}`)}`);
  info(`workspace: ${cfg.workspace}`);
  info(`${projects.length} project · hanya 127.0.0.1 (token aktif)`);
  line();
  ok(color.cyan(ui.url));
  line();
  info('buka URL di browser HP ini. Tekan Ctrl+C untuk berhenti.');
  info('token berganti setiap kali `vigen ui` dijalankan.');

  if (flags.open) {
    if (!openBrowser(ui.url)) warn('tidak bisa membuka browser otomatis — salin URL di atas.');
  }

  let closing = false;
  const shutdown = async () => {
    if (closing) return;
    closing = true;
    info('menutup server…');
    shutdownJobs();
    await ui.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);

  // Server menahan event loop; perintah selesai saat Ctrl+C.
  return 0;
}
