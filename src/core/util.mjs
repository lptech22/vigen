import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const TTY = Boolean(process.stdout.isTTY);
const wrap = (code) => (s) => (TTY ? `\x1b[${code}m${s}\x1b[0m` : s);

export const color = {
  dim: wrap('2'),
  bold: wrap('1'),
  red: wrap('31'),
  green: wrap('32'),
  yellow: wrap('33'),
  cyan: wrap('36'),
  gray: wrap('90'),
};

export function ok(msg) {
  process.stdout.write(`${color.green('✓')} ${msg}\n`);
}

export function warn(msg) {
  process.stdout.write(`${color.yellow('!')} ${msg}\n`);
}

export function bad(msg) {
  process.stdout.write(`${color.red('✗')} ${msg}\n`);
}

export function info(msg) {
  process.stdout.write(`${color.gray('·')} ${msg}\n`);
}

export function line(msg = '') {
  process.stdout.write(`${msg}\n`);
}

export function section(title) {
  process.stdout.write(`\n${color.bold(title)}\n`);
}

/** Parse `--flag value`, `--flag=value`, and `--bool`. */
export function parseArgs(argv) {
  const flags = {};
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const eq = a.indexOf('=');
      if (eq > 0) {
        flags[a.slice(2, eq)] = a.slice(eq + 1);
      } else {
        const key = a.slice(2);
        const next = argv[i + 1];
        if (next === undefined || next.startsWith('--')) flags[key] = true;
        else {
          flags[key] = next;
          i++;
        }
      }
    } else {
      rest.push(a);
    }
  }
  return { flags, rest };
}

export function expandHome(p) {
  if (!p) return p;
  if (p === '~') return os.homedir();
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2));
  return p;
}

export function expandTmp(p) {
  if (!p) return p;
  if (p.startsWith('$TMPDIR')) return path.join(process.env.TMPDIR || os.tmpdir(), p.slice(7));
  return p;
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function exists(p) {
  try {
    fs.accessSync(p);
    return true;
  } catch {
    return false;
  }
}

export function humanBytes(n) {
  const u = ['B', 'KB', 'MB', 'GB'];
  let i = 0;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i++;
  }
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${u[i]}`;
}

export function pad(s, n) {
  s = String(s);
  return s.length >= n ? s : s + ' '.repeat(n - s.length);
}

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function nowStamp() {
  const d = new Date();
  const p = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export function pngSize(buf) {
  if (buf.length < 24 || buf.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

export function jpegSize(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const marker = buf[i + 1];
    if (marker === 0xd8 || marker === 0xd9) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    i += 2 + len;
  }
  return null;
}

export function imageSize(buf) {
  return pngSize(buf) || jpegSize(buf);
}
