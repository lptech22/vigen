import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function probeDuration(cfg, file) {
  try {
    const { stdout } = await execFileAsync(cfg.paths.ffprobe, [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', file,
    ], { maxBuffer: 2 * 1024 * 1024 });
    const d = Number(JSON.parse(stdout).format?.duration);
    if (!Number.isFinite(d) || d <= 0) throw new Error('durasi tidak terbaca');
    return d;
  } catch (err) {
    throw new Error(`gagal membaca durasi ${file}: ${err.message}`);
  }
}

export async function probeAudio(cfg, file) {
  const { stdout } = await execFileAsync(cfg.paths.ffprobe, [
    '-v', 'error', '-select_streams', 'a:0',
    '-show_entries', 'stream=sample_rate,channels,codec_name',
    '-show_entries', 'format=duration',
    '-of', 'json', file,
  ], { maxBuffer: 2 * 1024 * 1024 });
  const j = JSON.parse(stdout);
  const st = j.streams?.[0] || {};
  return {
    duration: Number(j.format?.duration || 0),
    sampleRate: Number(st.sample_rate || 0),
    channels: Number(st.channels || 0),
    codec: st.codec_name || null,
  };
}
