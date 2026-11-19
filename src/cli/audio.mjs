import fs from 'node:fs';
import path from 'node:path';
import { loadConfig } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, line, section, color, ok, info, warn, bad, humanBytes } from '../core/util.mjs';
import { pickVideo } from '../core/media.mjs';
import { buildTimeline, readTimeline, DEFAULT_GAP, WORDS_PER_SECOND } from '../audio/timeline.mjs';
import { buildAudio, muxAudio } from '../audio/mix.mjs';
import { probeDuration, probeAudio } from '../audio/probe.mjs';

export async function audioCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);
  const result = await runAudio({ cfg, project, flags });
  return result.code;
}

/**
 * Bangun audio episode. Dipakai juga oleh `finish` dan `make` supaya
 * pipeline tidak memanggil CLI sebagai subprocess.
 */
export async function runAudio({ cfg, project, flags = {}, quiet = false }) {
  const gap = flags.gap !== undefined ? Number(flags.gap) : DEFAULT_GAP;
  const wps = flags.wps !== undefined ? Number(flags.wps) : WORDS_PER_SECOND;

  const existing = readTimeline(project.dir);
  const retime = !flags['no-retime'];
  const timeline = retime || !existing
    ? await buildTimeline({ cfg, project, gap, wps })
    : existing;

  if (!quiet) line(`${color.bold('Vigen audio')} ${color.gray(`— ${project.name}`)}`);
  const modeLabel = {
    voice: 'per scene',
    'voice-single': '1 audio utuh',
    'voice-blocks': `${timeline.groups?.length || 0} blok audio`,
    estimate: 'estimasi naskah',
  }[timeline.source] || timeline.source;
  if (!quiet) ok(`timeline: ${timeline.scenes.length} scene · ${timeline.totalDuration.toFixed(3)} dtk (${modeLabel})`);

  const started = Date.now();
  const result = await buildAudio({ cfg, project, timeline, options: {
    music: flags.music ? String(flags.music) : undefined,
    sfx: flags.sfx ? String(flags.sfx) : undefined,
  } });

  const secs = (Date.now() - started) / 1000;
  const size = fs.statSync(result.audioFile).size;
  const measuredDur = await probeDuration(cfg, result.audioFile);
  const fmt = await probeAudio(cfg, result.audioFile);

  if (!quiet) {
    section('Hasil audio');
    ok(`${result.audioFile}`);
    info(`${humanBytes(size)} · ${measuredDur.toFixed(3)} dtk · ${fmt.sampleRate} Hz ${fmt.channels === 1 ? 'mono' : 'stereo'} · diproses ${secs.toFixed(1)} dtk`);
    if (result.musicFile) {
      info(`musik: ${path.basename(result.musicFile)} (ducking aktif, stem: .work/audio/music-duck.wav)`);
    } else {
      info('musik: tidak ada (letakkan assets/music.mp3 untuk mengaktifkan)');
    }
    if (result.sfxCount) info(`SFX: ${result.sfxCount} cue`);
  }

  const lufs = result.measured.lufs;
  const tp = result.measured.truePeak;
  if (!quiet) {
    if (lufs !== null && Math.abs(lufs + 14) <= 0.5) ok(`loudness: ${lufs.toFixed(1)} LUFS`);
    else warn(`loudness: ${lufs === null ? 'tidak terukur' : `${lufs.toFixed(1)} LUFS`} (target -14)`);
    if (tp !== null) info(`true peak: ${tp.toFixed(1)} dB`);
  }

  // mux opsional
  let muxed = null;
  if (flags.mux) {
    const video = flags.video
      ? path.resolve(String(flags.video))
      : pickVideo(path.join(project.dir, 'out'), {
        slug: project.slug,
        width: cfg.output.width,
        height: cfg.output.height,
      });
    if (!video || !fs.existsSync(video)) {
      bad('tidak ada video untuk di-mux. Render dulu, atau pakai --video <file>.');
      return { code: 1, result, timeline, muxed };
    }
    const base = path.basename(video, path.extname(video));
    const out = flags.out ? path.resolve(String(flags.out)) : path.join(project.dir, 'out', `${base}_audio.mp4`);
    await muxAudio(cfg, { video, audio: result.audioFile, out });
    muxed = out;
    if (!quiet) {
      section('Mux');
      ok(`${out}`);
      info(`sumber video: ${path.basename(video)}`);
    }
  }

  if (!quiet) {
    section('Ringkasan');
    info(muxed ? 'audio siap dan sudah digabung ke video.' : `berikutnya: vigen audio "${project.name}" --mux`);
  }
  return { code: 0, result, timeline, muxed };
}
