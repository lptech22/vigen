import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, readJson, writeJson, ENGINE_VERSION } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, ensureDir, line, section, color, ok, info, warn, bad, humanBytes, nowStamp } from '../core/util.mjs';
import { hashFile, hashJson, projectRelative, statFingerprint } from '../core/media.mjs';
import { listVoiceFiles } from '../audio/timeline.mjs';
import { findMusic } from '../audio/mix.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';
import { buildSubtitles, subtitleStats, writeSubtitleFiles } from '../story/subs.mjs';
import { resolveSubtitleOption } from './subtitle-option.mjs';
import { subtitleOptionsFrom } from './subs.mjs';
import { runAudio } from './audio.mjs';
import { runRender } from './render.mjs';
import { runQc } from './qc.mjs';
import { publishProject } from './publish.mjs';

function fileHash(file) {
  return fs.existsSync(file) ? hashFile(file) : null;
}

function configFingerprint(cfg) {
  return hashJson({
    engine: ENGINE_VERSION,
    output: cfg.output,
    subs: cfg.subs,
    brand: cfg.brand,
    render: { chunk: cfg.render.chunk },
  });
}

function inputState(cfg, project) {
  const scene = path.join(project.dir, 'scene.js');
  const script = path.join(project.dir, 'script.json');
  const sfx = path.join(project.dir, 'sfx.json');
  const voices = listVoiceFiles(project.dir).map((name) => {
    const file = path.join(project.dir, 'voice', name);
    return { name, ...statFingerprint(file), hash: fileHash(file) };
  });
  const music = findMusic(project.dir);
  return {
    config: configFingerprint(cfg),
    scene: fileHash(scene),
    script: fileHash(script),
    sfx: fileHash(sfx),
    voices,
    music: music ? { name: path.basename(music), ...statFingerprint(music) } : null,
  };
}

function qcFingerprint(cfg, flags) {
  return hashJson({
    lufs: Number(flags.lufs ?? -14),
    tol: Number(flags.tol ?? 1),
    peak: Number(flags['peak-max'] ?? -1),
    black: Number(flags['black-max'] ?? 0.2),
    silence: Number(flags['silence-max'] ?? 2),
    outro: Number(cfg.brand?.outro ?? 1.5),
  });
}

/** Abaikan createdAt/engine supaya timeline yang dihitung ulang tetap sama. */
function timelineFingerprint(timeline) {
  if (!timeline) return null;
  return hashJson({
    source: timeline.source,
    mode: timeline.mode,
    totalDuration: timeline.totalDuration,
    scenes: timeline.scenes,
    groups: timeline.groups,
  });
}

export async function makeCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);
  const result = await runMake({ cfg, project, flags });
  return result.code;
}

/**
 * Pipeline idempoten: audio → subtitle → render final → QC → publish.
 * Bila input dan output belum berubah, langkah mahal dilewati.
 */
export async function runMake({ cfg, project, flags = {} }) {
  const quiet = Boolean(flags.quiet);
  const subOpt = await resolveSubtitleOption({ cfg, project, flags });
  const subsOptions = subtitleOptionsFrom(cfg, flags);
  const outDir = ensureDir(path.join(project.dir, 'out'));
  const workDir = ensureDir(path.join(project.dir, '.work'));
  const manifestFile = path.join(workDir, 'make.json');
  const previous = readJson(manifestFile, {}) || {};

  const finalFile = flags.out
    ? path.resolve(String(flags.out))
    : path.join(outDir, `${project.slug}_${cfg.output.width}x${cfg.output.height}.mp4`);

  const steps = { audio: 'skip', subtitle: 'skip', render: 'skip', qc: 'skip', publish: 'skip' };
  const state = inputState(cfg, project);

  if (!quiet) {
    line(`${color.bold('Vigen make')} ${color.gray(`— ${project.name}`)}`);
    info(`${project.slug} · ${finalFile}`);
  }

  if (flags.check) {
    if (!quiet) info('check: audit safe area…');
    const { checkCommand } = await import('./check.mjs');
    const code = await checkCommand([project.name, ...(flags.step ? ['--step', String(flags.step)] : [])]);
    if (code !== 0) {
      bad('make berhenti: check gagal.');
      return { code: 1, steps, out: null };
    }
    steps.check = 'pass';
  }

  let { storyboard, timeline } = await prepareStoryboard({
    cfg, project, retime: !flags['no-retime'], subs: subOpt.enabled, subsOptions,
  });

  const voices = listVoiceFiles(project.dir);
  const audioFile = path.join(outDir, 'audio.wav');
  const audioEnabled = !flags['no-audio'];
  if (audioEnabled && !voices.length && !fs.existsSync(audioFile)) {
    throw new Error('voice/ kosong dan out/audio.wav belum ada. Isi voice/ dulu, atau jalankan dengan --no-audio.');
  }
  const audioKey = hashJson({
    state: { voices: state.voices, music: state.music, sfx: state.sfx, config: state.config },
    timeline: timelineFingerprint(timeline),
    gap: flags.gap ?? null,
    wps: flags.wps ?? null,
  });
  const audioHashNow = fileHash(audioFile);

  const audioCanSkip = audioEnabled
    && !flags.force
    && voices.length > 0
    && previous.audioKey === audioKey
    && previous.audioHash
    && previous.audioHash === audioHashNow;

  let audioHash = audioEnabled ? audioHashNow : null;
  if (!audioEnabled) {
    steps.audio = 'disabled';
  } else if (audioCanSkip) {
    steps.audio = 'skip';
  } else if (voices.length) {
    if (!quiet) info('audio: membangun ulang…');
    await runAudio({
      cfg, project, quiet,
      flags: {
        'no-retime': flags['no-retime'],
        gap: flags.gap,
        wps: flags.wps,
        music: flags.music,
        sfx: flags.sfx,
      },
    });
    steps.audio = 'built';
    audioHash = fileHash(audioFile);
    ({ storyboard, timeline } = await prepareStoryboard({
      cfg, project, retime: false, subs: subOpt.enabled, subsOptions,
    }));
  } else if (audioHashNow) {
    steps.audio = 'keep';
  } else {
    steps.audio = 'none';
    if (!quiet) warn('voice/ kosong — make lanjut tanpa audio narasi.');
  }

  // Subtitle narasi ditulis sebelum render supaya file SRT/ASS selalu segar.
  const subs = subOpt.enabled ? buildSubtitles(storyboard, subsOptions) : [];
  storyboard.subs = subs;
  if (subOpt.enabled) {
    if (subs.length) {
      writeSubtitleFiles(project.dir, subs, { dir: outDir });
      steps.subtitle = 'written';
    } else {
      steps.subtitle = 'empty';
    }
  } else {
    steps.subtitle = 'disabled';
  }
  const subStats = subtitleStats(subs);

  const renderKey = hashJson({
    storyboard,
    width: cfg.output.width,
    height: cfg.output.height,
    fps: cfg.output.fps,
    crf: cfg.output.crf,
    preset: cfg.output.preset,
    capture: flags.capture || 'png',
    subs: subOpt.enabled,
    audio: Boolean(audioHash),
  });
  const finalHashNow = fileHash(finalFile);
  const renderCanSkip = !flags.force
    && previous.renderKey === renderKey
    && previous.audioHash === audioHash
    && previous.finalHash
    && previous.finalHash === finalHashNow;

  let renderResult;
  let finalHash = finalHashNow;
  if (renderCanSkip) {
    steps.render = 'skip';
    const st = statFingerprint(finalFile);
    renderResult = {
      code: 0,
      out: finalFile,
      storyboard,
      timeline,
      duration: storyboard.duration,
      totalFrames: Math.max(1, Math.round(storyboard.duration * cfg.output.fps)),
      framesRendered: 0,
      renderMs: 0,
      fpsActual: 0,
      hasAudio: Boolean(audioHash),
      size: st ? st.size : 0,
      subStats,
      subtitleFiles: subOpt.enabled && subs.length
        ? { srt: path.join(outDir, 'subtitle.srt'), ass: path.join(outDir, 'subtitle.ass') }
        : null,
    };
  } else {
    if (!quiet) info('render: merender video final…');
    renderResult = await runRender({ cfg, project, flags, subOpt, quiet });
    steps.render = renderResult.code === 0 ? 'rendered' : 'rendered-with-warning';
    finalHash = fileHash(finalFile);
  }

  const qcKey = qcFingerprint(cfg, flags);
  const qcFile = path.join(outDir, 'qc.json');
  const previousQc = readJson(qcFile, null);
  const finalRel = projectRelative(project.dir, finalFile);
  const qcMatchesFinal = previousQc
    ? (previousQc.path ? previousQc.path === finalRel : previousQc.file === path.basename(finalFile))
    : false;
  const qcCanSkip = !flags.force
    && !flags['no-qc']
    && steps.render === 'skip'
    && previous.qcKey === qcKey
    && previous.finalHash === finalHash
    && previousQc?.passed === true
    && qcMatchesFinal;

  let qc = previousQc;
  if (flags['no-qc']) {
    steps.qc = 'disabled';
    qc = null;
  } else if (qcCanSkip) {
    steps.qc = 'skip';
  } else {
    if (!quiet) info('qc: memeriksa file final…');
    qc = await runQc({
      cfg, project, quiet,
      // `--out` milik render (video), bukan path laporan QC.
      flags: { ...flags, out: undefined, preview: false },
      videoArg: finalFile,
      expectAudio: !flags['no-audio'],
    });
    steps.qc = qc.passed ? 'pass' : 'fail';
  }

  let publish = null;
  if (flags['no-publish']) {
    steps.publish = 'disabled';
  } else if (qc && !qc.passed) {
    steps.publish = 'skipped-qc';
    warn('publish dilewati karena QC belum lulus. Perbaiki dulu atau pakai --no-qc.');
  } else {
    if (!quiet) info('publish: menyiapkan caption + metadata…');
    publish = await publishProject({
      cfg,
      project,
      quiet,
      flags: { ...flags, video: finalFile, out: flags['publish-out'], 'ignore-qc': Boolean(flags['no-qc']) },
    });
    steps.publish = publish.code === 0 ? 'written' : 'failed';
  }

  const manifest = {
    schema: 1,
    engine: ENGINE_VERSION,
    project: project.name,
    slug: project.slug,
    updatedAt: new Date().toISOString(),
    input: {
      hash: hashJson(state),
      scene: state.scene,
      script: state.script,
      voices: state.voices.length,
    },
    audioKey,
    audioHash,
    renderKey,
    finalHash,
    finalPath: projectRelative(project.dir, finalFile),
    qcKey,
    qc: qc ? { passed: qc.passed, file: projectRelative(project.dir, qcFile) } : null,
    steps,
  };
  writeJson(manifestFile, manifest);

  const size = fs.existsSync(finalFile) ? fs.statSync(finalFile).size : 0;
  const passed = renderResult.code === 0 && (!qc || qc.passed) && steps.publish !== 'failed';

  if (!quiet) {
    section('Ringkasan make');
    line(`  ${color.gray('audio    ')} ${steps.audio}`);
    line(`  ${color.gray('subtitle ')} ${steps.subtitle}${subStats.count ? ` · ${subStats.count} potongan · maks ${subStats.maxLines} baris` : ''}`);
    line(`  ${color.gray('render   ')} ${steps.render}`);
    line(`  ${color.gray('qc       ')} ${steps.qc}`);
    line(`  ${color.gray('publish  ')} ${steps.publish}`);
    ok(finalFile);
    info(`${humanBytes(size)} · ${storyboard.duration.toFixed(3)} dtk`);
    if (publish?.captionFile) info(`caption: ${publish.captionFile}`);
    info(`manifest: ${manifestFile}`);
    info(`selesai ${nowStamp()}`);
    if (!steps.audio.startsWith('build') && steps.render === 'skip' && steps.qc === 'skip') {
      ok('tidak ada perubahan — hasil sebelumnya dipakai (idempoten).');
    }
  }

  if (!passed) bad('make selesai dengan masalah. Periksa ringkasan di atas.');
  return { code: passed ? 0 : 1, steps, out: finalFile, render: renderResult, qc, publish, manifest };
}
