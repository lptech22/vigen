import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFile } from 'node:child_process';
import { once } from 'node:events';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function tail(s, n = 600) {
  s = String(s || '').trim();
  return s.length > n ? `…${s.slice(-n)}` : s;
}

export function openEncoder(cfg, outFile, { fps, width, height, input = 'image', crf = cfg.output.crf }) {
  const inputArgs = input === 'raw'
    ? ['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${width}x${height}`, '-framerate', String(fps)]
    : ['-f', 'image2pipe', '-framerate', String(fps)];

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    ...inputArgs,
    '-i', '-',
    '-an',
    '-c:v', 'libx264',
    '-preset', cfg.output.preset,
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-color_range', 'tv',
    '-g', String(fps * 2),
    '-color_primaries', 'bt709',
    '-color_trc', 'bt709',
    '-colorspace', 'bt709',
    '-s', `${width}x${height}`,
    outFile,
  ];

  const proc = spawn(cfg.paths.ffmpeg, args, { stdio: ['pipe', 'ignore', 'pipe'] });
  let stderr = '';
  proc.stderr.on('data', (d) => {
    stderr += d.toString('utf8');
    if (stderr.length > 12000) stderr = stderr.slice(-12000);
  });

  const done = new Promise((resolve, reject) => {
    proc.on('error', (err) => reject(new Error(`gagal menjalankan ffmpeg: ${err.message}`)));
    proc.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg berhenti (${signal || code})${stderr ? `: ${tail(stderr)}` : ''}`));
    });
  });

  let stdinError = null;
  proc.stdin.on('error', (err) => { stdinError = err; });

  return {
    async write(buf) {
      if (stdinError) throw new Error(`ffmpeg tidak menerima data: ${stdinError.message}`);
      if (!proc.stdin.write(buf)) await once(proc.stdin, 'drain');
    },
    async finish() {
      if (proc.stdin.writable) proc.stdin.end();
      await done;
    },
    async abort() {
      try { proc.stdin.destroy(); } catch { /* noop */ }
      try { proc.kill('SIGKILL'); } catch { /* noop */ }
      try { await done; } catch { /* memang dibatalkan */ }
    },
  };
}

export async function concatSegments(cfg, files, outFile) {
  if (!files.length) throw new Error('tidak ada segmen untuk digabung');
  const dir = path.dirname(outFile);
  const listFile = path.join(dir, 'segments.txt');
  const body = files.map((f) => `file '${f.replace(/'/g, "'\\''")}'`).join('\n') + '\n';
  fs.writeFileSync(listFile, body);

  const args = [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-f', 'concat', '-safe', '0', '-i', listFile,
    '-c', 'copy', '-an',
    '-movflags', '+faststart',
    outFile,
  ];
  try {
    await execFileAsync(cfg.paths.ffmpeg, args, { maxBuffer: 8 * 1024 * 1024 });
  } catch (err) {
    const msg = tail(err.stderr || err.message);
    throw new Error(`gagal menggabungkan segmen: ${msg}`);
  }
  return outFile;
}

export async function probeVideo(cfg, file) {
  const args = [
    '-v', 'error',
    '-count_frames',
    '-select_streams', 'v:0',
    '-show_entries', 'stream=codec_name,width,height,pix_fmt,r_frame_rate,nb_read_frames,duration',
    '-show_entries', 'format=duration,size',
    '-of', 'json',
    file,
  ];
  const { stdout } = await execFileAsync(cfg.paths.ffprobe, args, { maxBuffer: 4 * 1024 * 1024 });
  return JSON.parse(stdout);
}
