import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { CDP } from './cdp.mjs';
import { ensureDir, sleep } from '../core/util.mjs';
import { ROOT, runtimePaths } from '../core/config.mjs';

const CHROMIUM_ARGS = [
  '--headless=new',
  '--no-sandbox',
  '--disable-gpu',
  '--disable-dev-shm-usage',
  '--hide-scrollbars',
  '--mute-audio',
  '--no-first-run',
  '--no-default-browser-check',
  '--disable-extensions',
  '--disable-background-networking',
  '--disable-background-timer-throttling',
  '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows',
  '--disable-features=CalculateNativeWinOcclusion,Translate',
  '--force-device-scale-factor=1',
  '--log-level=3',
];

async function waitForPortFile(profileDir, timeoutMs = 20000) {
  const file = path.join(profileDir, 'DevToolsActivePort');
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (fs.existsSync(file)) {
      const txt = fs.readFileSync(file, 'utf8').trim().split('\n');
      if (txt[0] && Number(txt[0]) > 0) return Number(txt[0]);
    }
    await sleep(60);
  }
  throw new Error('Chromium tidak membuka port debugging. Coba jalankan: vigen doctor');
}

async function findPageTarget(port, timeoutMs = 15000) {
  const started = Date.now();
  let lastErr = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/list`);
      const list = await res.json();
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (err) {
      lastErr = err;
    }
    await sleep(80);
  }
  throw new Error(`target halaman Chromium tidak ditemukan${lastErr ? `: ${lastErr.message}` : ''}`);
}

function readFontDataUrl(file, label) {
  if (!fs.existsSync(file)) {
    throw new Error(`font ${label} tidak ditemukan: ${file}\nPerbaiki path di ~/.vigen/config.json (bagian "fonts")`);
  }
  const b64 = fs.readFileSync(file).toString('base64');
  const ext = path.extname(file).toLowerCase();
  const mime = ext === '.otf' ? 'font/otf' : ext === '.woff2' ? 'font/woff2' : ext === '.woff' ? 'font/woff' : 'font/ttf';
  return `data:${mime};base64,${b64}`;
}

export async function launchBrowser(cfg, { width, height, stageUrl = null, postUrl = null, storyboard = null }) {
  const paths = runtimePaths(cfg);
  const profileDir = fs.mkdtempSync(path.join(ensureDir(path.join(paths.tmp, 'profile')), 'run-'));
  const args = [
    ...CHROMIUM_ARGS,
    `--window-size=${width},${height}`,
    '--remote-debugging-port=0',
    `--user-data-dir=${profileDir}`,
    'about:blank',
  ];

  const proc = spawn(cfg.paths.chromium, args, { stdio: ['ignore', 'ignore', 'pipe'] });
  const stderrTail = [];
  proc.stderr.on('data', (buf) => {
    stderrTail.push(buf.toString('utf8'));
    if (stderrTail.length > 40) stderrTail.shift();
  });
  proc.on('error', () => { /* ditangani lewat waitForPortFile */ });

  let session;
  try {
    const port = await waitForPortFile(profileDir);
    const target = await findPageTarget(port);
    session = await CDP.connect(target.webSocketDebuggerUrl);

    await session.send('Page.enable');
    await session.send('Runtime.enable');
    await session.send('Emulation.setDeviceMetricsOverride', {
      width, height, deviceScaleFactor: 1, mobile: false,
      screenWidth: width, screenHeight: height,
    });

    const targetUrl = stageUrl || pathToFileURL(path.join(ROOT, 'src/runtime/stage.html')).href;
    await session.send('Page.navigate', { url: targetUrl });

    await waitFor(() => session.send('Runtime.evaluate', {
      expression: "typeof window.boot === 'function'", returnByValue: true,
    }).then((r) => r.result.value === true), 15000, 'stage.html gagal dimuat');

    const fonts = {
      VigenDisplay: readFontDataUrl(cfg.fonts.display, 'display'),
      VigenUI: readFontDataUrl(cfg.fonts.ui, 'ui'),
    };

    const bootCfg = {
      width,
      height,
      logicalWidth: storyboard?.width || cfg.output.width,
      logicalHeight: storyboard?.height || cfg.output.height,
      fps: cfg.output.fps,
      duration: storyboard?.duration ?? 5,
      watermark: cfg.brand?.watermark || 'LPTech',
      postUrl,
      fonts,
      storyboard,
    };

    const bootRes = await session.send('Runtime.evaluate', {
      expression: `window.boot(${JSON.stringify(bootCfg)})`,
      awaitPromise: true,
      returnByValue: true,
    }, 60000);
    if (bootRes.exceptionDetails) {
      throw new Error(`stage gagal boot: ${bootRes.exceptionDetails.text || 'unknown'}`);
    }
  } catch (err) {
    try { session?.close(); } catch { /* noop */ }
    try { proc.kill('SIGKILL'); } catch { /* noop */ }
    const tail = stderrTail.join('').split('\n').filter(Boolean).slice(-6).join('\n');
    throw new Error(`${err.message}${tail ? `\nchromium: ${tail}` : ''}`);
  }

  return {
    session,
    proc,
    profileDir,
    async close() {
      try { await session.send('Browser.close', {}, 3000); } catch { /* noop */ }
      session.close();
      await sleep(150);
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      try { fs.rmSync(profileDir, { recursive: true, force: true }); } catch { /* noop */ }
    },
  };
}

async function waitFor(fn, timeoutMs, errMsg) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (await fn()) return;
    await sleep(80);
  }
  throw new Error(errMsg);
}
