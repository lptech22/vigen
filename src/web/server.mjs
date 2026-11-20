import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ENGINE_VERSION, readJson } from '../core/config.mjs';
import {
  createProject, listProjects, projectFile, readWorkspace, resolveProject, shortDate, slugify,
} from '../core/workspace.mjs';
import { createJob, getJob, latestJobFor, snapshot, subscribe, cancelJob } from './jobs.mjs';
import { promptCommand } from '../cli/prompt.mjs';

const PUBLIC_DIR = path.resolve(fileURLToPath(new URL('./public', import.meta.url)));
const COOKIE_NAME = 'vigen_ui';

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.mov', 'video/quicktime'],
  ['.wav', 'audio/wav'],
  ['.mp3', 'audio/mpeg'],
  ['.m4a', 'audio/mp4'],
  ['.srt', 'text/plain; charset=utf-8'],
  ['.ass', 'text/plain; charset=utf-8'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.webmanifest', 'application/manifest+json'],
]);

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self'; connect-src 'self'; style-src 'self'; script-src 'self'",
};

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

function parseCookies(header) {
  const out = {};
  for (const part of String(header || '').split(';')) {
    const eq = part.indexOf('=');
    if (eq < 0) continue;
    out[part.slice(0, eq).trim()] = part.slice(eq + 1).trim();
  }
  return out;
}

function tokenFrom(req, url) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  const cookie = parseCookies(req.headers.cookie)[COOKIE_NAME];
  if (cookie) return cookie;
  return url.searchParams.get('t') || '';
}

function sendJson(res, code, data) {
  const body = Buffer.from(JSON.stringify(data, null, 2) + '\n');
  res.writeHead(code, {
    ...SECURITY_HEADERS,
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  res.end(body);
}

function sendText(res, code, text, headers = {}) {
  const body = Buffer.from(text);
  res.writeHead(code, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
    ...headers,
  });
  res.end(body);
}

function sendFile(res, file) {
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    sendText(res, 404, 'not found');
    return;
  }
  const body = fs.readFileSync(file);
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream',
    'Cache-Control': 'no-store',
    'Content-Length': body.length,
  });
  res.end(body);
}

function resolveStatic(pathname) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(PUBLIC_DIR, `.${rel}`);
  if (file !== PUBLIC_DIR && !file.startsWith(PUBLIC_DIR + path.sep)) return null;
  return file;
}

function projectView(p) {
  return {
    name: p.name,
    slug: p.slug,
    niche: p.niche,
    status: p.status,
    scenes: p.scenes,
    voices: p.voices,
    videos: p.videos,
    tts: p.tts,
    createdAt: p.createdAt,
    mtime: p.mtime,
    mtimeText: shortDate(p.mtime),
  };
}

function sessionView(cfg) {
  const ws = cfg.workspace;
  const marker = readWorkspace(ws);
  return {
    engine: ENGINE_VERSION,
    workspace: ws,
    workspaceName: path.basename(ws),
    workspaceReady: Boolean(marker),
    projectCount: marker ? listProjects(ws).length : 0,
  };
}

const TOKEN_PAGE = `<!doctype html>
<html lang="id"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Vigen — butuh token</title>
<link rel="stylesheet" href="/style.css">
</head><body class="gate">
<main class="gate-card">
  <h1>Butuh token</h1>
  <p>Buka URL lengkap yang tercetak di terminal, termasuk <code>?t=…</code>.
  Token hanya berlaku selama perintah <code>vigen ui</code> berjalan.</p>
</main>
</body></html>
`;

async function readJsonBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) {
      const err = new Error('body terlalu besar');
      err.status = 413;
      throw err;
    }
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    const err = new Error('JSON tidak valid');
    err.status = 400;
    throw err;
  }
}

function findProject(cfg, slug) {
  try {
    return resolveProject(cfg.workspace, decodeURIComponent(slug));
  } catch (err) {
    err.status = 404;
    throw err;
  }
}

function httpError(status, message) {
  const err = new Error(message);
  err.status = status;
  return err;
}

function numberIn(name, raw, def, [min, max]) {
  if (raw === undefined || raw === null || raw === '') return def;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < min || n > max) {
    throw httpError(400, `${name} harus angka ${min}–${max}`);
  }
  return Math.round(n);
}

function uploadName(raw) {
  const base = path.basename(String(raw || '')).trim();
  const ext = path.extname(base).toLowerCase();
  if (!VOICE_EXT.has(ext)) {
    throw httpError(400, `tipe file tidak didukung: ${ext || '(tanpa ekstensi)'}`);
  }
  const stem = base.slice(0, base.length - ext.length)
    .replace(/[^\w\-. ]+/g, '-')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80);
  if (!stem) throw httpError(400, 'nama file tidak valid');
  return stem + ext;
}

function saveStream(req, dest, limit) {
  return new Promise((resolve, reject) => {
    const tmp = `${dest}.upload`;
    const out = fs.createWriteStream(tmp);
    let size = 0;
    let failed = false;

    const fail = (err) => {
      if (failed) return;
      failed = true;
      req.unpipe(out);
      out.destroy();
      fs.rm(tmp, { force: true }, () => reject(err));
    };

    const declared = Number(req.headers['content-length']);
    if (Number.isFinite(declared) && declared > limit) {
      return fail(httpError(413, `file terlalu besar (maks ${Math.round(limit / 1024 / 1024)} MB)`));
    }

    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > limit) fail(httpError(413, `file terlalu besar (maks ${Math.round(limit / 1024 / 1024)} MB)`));
    });
    req.on('aborted', () => fail(httpError(400, 'unggahan dibatalkan')));
    req.on('error', fail);
    out.on('error', fail);
    out.on('finish', () => {
      if (failed) return;
      if (!size) return fail(httpError(400, 'file kosong'));
      try {
        fs.renameSync(tmp, dest);
        resolve({ size });
      } catch (err) {
        fail(err);
      }
    });
    req.pipe(out);
  });
}

function openEvents(req, res, job) {
  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  const send = (event) => {
    if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
  };
  send({ type: 'snapshot', job: snapshot(job, { logs: true }) });
  const unsubscribe = subscribe(job, send);
  const ping = setInterval(() => {
    if (!res.writableEnded) res.write(': ping\n\n');
  }, 15000);
  ping.unref?.();
  const stop = () => {
    clearInterval(ping);
    unsubscribe();
  };
  req.on('close', stop);
  res.on('close', stop);
}

const EDITABLE = ['scene.js', 'script.json', 'sfx.json', 'brief.md', 'prompt.txt'];
const ASSET_DIRS = ['out', 'voice'];
const VOICE_EXT = new Set(['.mp3', '.wav', '.m4a', '.aac', '.ogg', '.flac']);
const VOICE_LIMIT = 50 * 1024 * 1024;

function statInfo(file) {
  try {
    const st = fs.statSync(file);
    return { size: st.size, mtime: st.mtimeMs, mtimeText: shortDate(st.mtimeMs) };
  } catch {
    return null;
  }
}

function listFiles(dir) {
  let names = [];
  try { names = fs.readdirSync(dir); } catch { return []; }
  return names
    .map((name) => {
      const info = statInfo(path.join(dir, name));
      return info ? { name, ...info } : null;
    })
    .filter(Boolean)
    .sort((a, b) => b.mtime - a.mtime);
}

function detailView(project) {
  const outDir = path.join(project.dir, 'out');
  const voiceDir = path.join(project.dir, 'voice');

  const files = EDITABLE.map((name) => {
    const info = statInfo(path.join(project.dir, name));
    return { path: name, exists: Boolean(info), size: info?.size || 0, mtime: info?.mtime || 0, mtimeText: info?.mtimeText || '' };
  });

  let caption = null;
  try {
    caption = fs.readFileSync(path.join(outDir, 'caption.txt'), 'utf8').trim();
  } catch { /* belum ada */ }

  return {
    name: project.name,
    slug: project.slug,
    niche: project.niche,
    status: project.status,
    createdAt: project.createdAt,
    scenes: project.scenes,
    voices: project.voices,
    videos: project.videos,
    meta: readJson(projectFile(project.dir), {}),
    files,
    voice: listFiles(voiceDir),
    out: listFiles(outDir),
    qc: readJson(path.join(outDir, 'qc.json'), null),
    publish: readJson(path.join(outDir, 'publish.json'), null),
    caption,
  };
}

function resolveRel(projectDir, rel) {
  if (!rel || typeof rel !== 'string' || rel.includes('\0')) return null;
  if (path.isAbsolute(rel)) return null;
  const full = path.resolve(projectDir, rel);
  if (full !== projectDir && !full.startsWith(projectDir + path.sep)) return null;
  return full;
}

function sendMedia(req, res, file) {
  let st;
  try { st = fs.statSync(file); } catch { return sendText(res, 404, 'not found'); }
  if (!st.isFile()) return sendText(res, 404, 'not found');

  const type = MIME.get(path.extname(file).toLowerCase()) || 'application/octet-stream';
  const size = st.size;
  const range = req.headers.range;

  if (range) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(String(range).trim());
    if (!match) return sendText(res, 416, 'range tidak valid');
    let start = match[1] === '' ? null : Number(match[1]);
    let end = match[2] === '' ? null : Number(match[2]);
    if (start === null && end === null) return sendText(res, 416, 'range tidak valid');
    if (start === null) { start = Math.max(0, size - end); end = size - 1; }
    else if (end === null || end >= size) { end = size - 1; }
    if (start > end || start >= size) {
      res.writeHead(416, { ...SECURITY_HEADERS, 'Content-Range': `bytes */${size}` });
      return res.end();
    }
    res.writeHead(206, {
      ...SECURITY_HEADERS,
      'Content-Type': type,
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${start}-${end}/${size}`,
      'Content-Length': end - start + 1,
      'Cache-Control': 'no-store',
    });
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }

  res.writeHead(200, {
    ...SECURITY_HEADERS,
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Content-Length': size,
    'Cache-Control': 'no-store',
  });
  if (req.method === 'HEAD') return res.end();
  return fs.createReadStream(file).pipe(res);
}

async function handleApi(req, res, cfg, pathname, url) {
  if (pathname === '/api/session') {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'metode tidak didukung' });
    return sendJson(res, 200, sessionView(cfg));
  }

  if (pathname === '/api/projects') {
    if (req.method === 'GET') {
      if (!fs.existsSync(cfg.workspace)) {
        return sendJson(res, 200, { workspace: cfg.workspace, projects: [] });
      }
      const projects = listProjects(cfg.workspace).map(projectView);
      return sendJson(res, 200, { workspace: cfg.workspace, projects });
    }

    if (req.method !== 'POST') return sendJson(res, 405, { error: 'metode tidak didukung' });
    if (!readWorkspace(cfg.workspace)) {
      return sendJson(res, 409, { error: `workspace belum siap: ${cfg.workspace}. Jalankan "vigen setup" dulu.` });
    }

    const body = await readJsonBody(req);
    const mode = body.mode === 'prompt' ? 'prompt' : 'template';
    const name = String(body.name ?? '').trim();
    if (!name) return sendJson(res, 400, { error: 'nama project wajib diisi' });

    const niche = body.niche === undefined || body.niche === '' ? undefined : String(body.niche).trim();
    if (niche && !/^[\w-]{1,30}$/.test(niche)) {
      return sendJson(res, 400, { error: 'niche hanya huruf, angka, "-" atau "_" (maks 30)' });
    }

    let created;
    try {
      if (mode === 'prompt') {
        const duration = numberIn('durasi', body.duration, 45, [10, 300]);
        const voices = numberIn('jumlah voice', body.voices, 1, [1, 12]);
        const scenes = numberIn('jumlah scene', body.scenes, 8, [3, 24]);
        const argv = [name, '--yes', '--duration', String(duration), '--voices', String(voices), '--scenes', String(scenes)];
        if (niche) argv.push('--niche', niche);
        const before = new Set(listProjects(cfg.workspace).map((p) => p.dir));
        await promptCommand(argv);
        const project = listProjects(cfg.workspace).find((p) => !before.has(p.dir));
        if (!project) throw httpError(500, 'project prompt tidak ditemukan setelah dibuat');
        created = project;
      } else {
        const clash = listProjects(cfg.workspace).find(
          (p) => p.name === name || p.slug === slugify(name),
        );
        if (clash) return sendJson(res, 409, { error: `project "${clash.name}" sudah ada` });
        const { dir } = createProject(cfg.workspace, name, cfg, { niche });
        created = resolveProject(cfg.workspace, dir);
      }
    } catch (err) {
      if (err.status) throw err;
      if (/sudah ada/i.test(err.message)) return sendJson(res, 409, { error: err.message });
      if (/nama project|tidak valid|tidak boleh/i.test(err.message)) return sendJson(res, 400, { error: err.message });
      throw err;
    }

    return sendJson(res, 201, {
      project: projectView(created),
      detail: detailView(created),
      prompt: mode === 'prompt'
        ? fs.readFileSync(path.join(created.dir, 'prompt.txt'), 'utf8')
        : null,
    });
  }

  let match = pathname.match(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'metode tidak didukung' });
    return sendJson(res, 200, { project: detailView(findProject(cfg, match[1])) });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/file$/);
  if (match) {
    const project = findProject(cfg, match[1]);
    const rel = url.searchParams.get('p') || '';
    if (!EDITABLE.includes(rel)) {
      return sendJson(res, 400, { error: `file tidak boleh diedit lewat UI: ${rel}` });
    }
    const file = path.join(project.dir, rel);

    if (req.method === 'GET') {
      const info = statInfo(file);
      if (!info) return sendJson(res, 404, { error: 'file belum ada' });
      if (info.size > 2 * 1024 * 1024) return sendJson(res, 413, { error: 'file terlalu besar untuk editor' });
      const text = fs.readFileSync(file, 'utf8');
      return sendJson(res, 200, { path: rel, text, ...info });
    }

    if (req.method === 'PUT') {
      const body = await readJsonBody(req, 4 * 1024 * 1024);
      if (typeof body.text !== 'string') return sendJson(res, 400, { error: 'field "text" wajib string' });
      const info = statInfo(file);
      if (!info) return sendJson(res, 404, { error: 'file belum ada' });
      if (rel.endsWith('.json')) {
        try {
          JSON.parse(body.text);
        } catch (err) {
          return sendJson(res, 400, { error: `JSON tidak valid: ${err.message}` });
        }
      }
      const backup = `${file}.bak`;
      fs.copyFileSync(file, backup);
      const tmp = `${file}.tmp`;
      fs.writeFileSync(tmp, body.text);
      fs.renameSync(tmp, file);
      return sendJson(res, 200, {
        ok: true, path: rel, backup: path.basename(backup), ...statInfo(file),
      });
    }

    return sendJson(res, 405, { error: 'metode tidak didukung' });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/voice$/);
  if (match) {
    if (req.method !== 'PUT') return sendJson(res, 405, { error: 'metode tidak didukung' });
    const project = findProject(cfg, match[1]);
    const name = uploadName(url.searchParams.get('name'));
    const dir = path.join(project.dir, 'voice');
    fs.mkdirSync(dir, { recursive: true });
    const dest = path.join(dir, name);
    const { size } = await saveStream(req, dest, VOICE_LIMIT);
    return sendJson(res, 201, {
      ok: true, name, ...statInfo(dest), voice: listFiles(dir),
    });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/asset$/);
  if (match) {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return sendJson(res, 405, { error: 'metode tidak didukung' });
    }
    const project = findProject(cfg, match[1]);
    const rel = url.searchParams.get('p') || '';
    const file = resolveRel(project.dir, rel);
    if (!file) return sendJson(res, 400, { error: 'path tidak valid' });
    const inside = path.relative(project.dir, file);
    if (!ASSET_DIRS.some((dir) => inside === dir || inside.startsWith(dir + path.sep))) {
      return sendJson(res, 400, { error: 'aset hanya dari out/ atau voice/' });
    }
    return sendMedia(req, res, file);
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/jobs$/);
  if (match) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'metode tidak didukung' });
    const project = findProject(cfg, match[1]);
    const body = await readJsonBody(req);
    const flags = {
      force: Boolean(body.flags?.force),
      preview: Boolean(body.flags?.preview),
      at: body.flags?.at,
    };
    const job = createJob({ project, action: String(body.action || ''), flags });
    return sendJson(res, 201, { job: snapshot(job, { logs: true }) });
  }

  match = pathname.match(/^\/api\/projects\/([^/]+)\/job$/);
  if (match) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'metode tidak didukung' });
    const project = findProject(cfg, match[1]);
    const job = latestJobFor(project.slug);
    return sendJson(res, 200, { job: job ? snapshot(job, { logs: true }) : null });
  }

  match = pathname.match(/^\/api\/jobs\/([a-f0-9]+)$/);
  if (match) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'metode tidak didukung' });
    const job = getJob(match[1]);
    if (!job) return sendJson(res, 404, { error: 'job tidak ditemukan' });
    return sendJson(res, 200, { job: snapshot(job, { logs: true }) });
  }

  match = pathname.match(/^\/api\/jobs\/([a-f0-9]+)\/events$/);
  if (match) {
    if (req.method !== 'GET') return sendJson(res, 405, { error: 'metode tidak didukung' });
    const job = getJob(match[1]);
    if (!job) return sendJson(res, 404, { error: 'job tidak ditemukan' });
    openEvents(req, res, job);
    return;
  }

  match = pathname.match(/^\/api\/jobs\/([a-f0-9]+)\/cancel$/);
  if (match) {
    if (req.method !== 'POST') return sendJson(res, 405, { error: 'metode tidak didukung' });
    const job = cancelJob(match[1]);
    if (!job) return sendJson(res, 404, { error: 'job tidak ditemukan' });
    return sendJson(res, 200, { job: snapshot(job) });
  }

  return sendJson(res, 404, { error: 'endpoint tidak ditemukan' });
}

function makeServer(cfg, token) {
  return http.createServer((req, res) => {
    let url;
    try {
      url = new URL(req.url, 'http://127.0.0.1');
    } catch {
      sendText(res, 400, 'bad request');
      return;
    }

    const pathname = url.pathname;
    const isApi = pathname.startsWith('/api/');
    const authorized = safeEqual(tokenFrom(req, url), token);

    try {
      if (isApi && !authorized) {
        sendJson(res, 401, { error: 'token tidak valid', hint: 'buka URL dari terminal: vigen ui' });
        return;
      }

      if (isApi) {
        handleApi(req, res, cfg, pathname, url).catch((err) => {
          if (!res.headersSent) sendJson(res, err.status || 500, { error: err.message });
          else res.end();
        });
        return;
      }

      if (req.method !== 'GET' && req.method !== 'HEAD') {
        sendText(res, 405, 'method not allowed');
        return;
      }

      if (pathname === '/' || pathname === '/index.html') {
        if (url.searchParams.get('t')) {
          if (!authorized) {
            sendText(res, 401, 'token tidak valid');
            return;
          }
          res.setHeader('Set-Cookie', `${COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Strict`);
        } else if (!authorized) {
          const body = Buffer.from(TOKEN_PAGE);
          res.writeHead(401, {
            ...SECURITY_HEADERS,
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Content-Length': body.length,
          });
          res.end(body);
          return;
        }
      }

      const file = resolveStatic(pathname);
      if (!file) {
        sendText(res, 404, 'not found');
        return;
      }
      sendFile(res, file);
    } catch (err) {
      sendText(res, 500, `kesalahan server: ${err.message}`);
    }
  });
}

export async function startUiServer({ cfg, port = 7788, onListen } = {}) {
  const token = crypto.randomBytes(16).toString('hex');
  const server = makeServer(cfg, token);

  const listen = (p) => new Promise((resolve, reject) => {
    const onError = (err) => {
      server.off('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.off('error', onError);
      resolve(server.address().port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(p, '127.0.0.1');
  });

  let actual = Number(port);
  if (!Number.isFinite(actual) || actual < 0) actual = 7788;

  if (actual > 0) {
    for (let attempt = 0; attempt < 10; attempt++) {
      try {
        actual = await listen(actual + attempt);
        break;
      } catch (err) {
        if (err.code !== 'EADDRINUSE' || attempt === 9) {
          throw new Error(err.code === 'EADDRINUSE'
            ? `port ${port}..${port + 9} sedang dipakai. Coba: vigen ui --port 0`
            : `gagal membuka server: ${err.message}`);
        }
      }
    }
  } else {
    actual = await listen(0);
  }

  const base = `http://127.0.0.1:${actual}`;
  const ui = {
    port: actual,
    token,
    base,
    url: `${base}/?t=${token}`,
    close: () => new Promise((resolve) => {
      server.closeAllConnections?.();
      server.close(() => resolve());
    }),
  };
  if (onListen) onListen(ui);
  return ui;
}
