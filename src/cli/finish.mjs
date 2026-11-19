import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, writeJson, ENGINE_VERSION } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, line, section, color, ok, info, bad, humanBytes, nowStamp } from '../core/util.mjs';
import { hashFile, projectRelative } from '../core/media.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';
import { listVoiceFiles } from '../audio/timeline.mjs';
import { probeDuration } from '../audio/probe.mjs';
import { resolveSubtitleOption } from './subtitle-option.mjs';
import { subtitleOptionsFrom } from './subs.mjs';
import { runAudio } from './audio.mjs';
import { runRender } from './render.mjs';
import { runQc } from './qc.mjs';

export async function finishCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);
  const result = await runFinish({ cfg, project, flags });
  return result.code;
}

/**
 * Finalisasi: pastikan audio sinkron, render final + subtitle, lalu QC.
 * Dipakai juga oleh `make` supaya langkah final tidak diulang.
 */
export async function runFinish({ cfg, project, flags = {} }) {
  const quiet = Boolean(flags.quiet);
  const subOpt = await resolveSubtitleOption({ cfg, project, flags });
  const subsOptions = subtitleOptionsFrom(cfg, flags);
  const outDir = path.join(project.dir, 'out');
  fs.mkdirSync(outDir, { recursive: true });

  if (!quiet) {
    line(`${color.bold('Vigen finish')} ${color.gray(`— ${project.name}`)}`);
  }

  const { timeline } = await prepareStoryboard({
    cfg, project, retime: !flags['no-retime'], subs: subOpt.enabled, subsOptions,
  });

  const audioFile = path.join(outDir, 'audio.wav');
  const voices = listVoiceFiles(project.dir);
  let audioStatus = 'none';

  if (!flags['no-audio'] && !voices.length && !fs.existsSync(audioFile)) {
    throw new Error('voice/ kosong dan out/audio.wav belum ada. Isi voice/ dulu, atau jalankan dengan --no-audio.');
  }

  if (flags['no-audio']) {
    audioStatus = 'disabled';
  } else if (voices.length) {
    let needAudio = !fs.existsSync(audioFile);
    if (!needAudio && timeline) {
      try {
        const ad = await probeDuration(cfg, audioFile);
        const diff = Math.abs(ad - timeline.totalDuration);
        if (diff > 0.5) needAudio = true;
      } catch {
        needAudio = true;
      }
    }
    if (needAudio) {
      if (!quiet) info('audio belum sinkron — membangun ulang audio…');
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
      audioStatus = 'built';
    } else {
      audioStatus = 'ok';
    }
  } else if (fs.existsSync(audioFile)) {
    audioStatus = 'existing';
  }

  const render = await runRender({
    cfg, project, flags, subOpt, quiet,
  });

  let qc = null;
  if (!flags['no-qc']) {
    qc = await runQc({
      cfg, project, quiet,
      // `--out` milik render (video), jangan dipakai sebagai path laporan QC.
      flags: { ...flags, out: undefined, preview: false },
      videoArg: render.out,
      expectAudio: !flags['no-audio'],
    });
  }

  const report = {
    schema: 1,
    engine: ENGINE_VERSION,
    project: project.name,
    slug: project.slug,
    finishedAt: new Date().toISOString(),
    video: {
      path: projectRelative(project.dir, render.out),
      size: render.size,
      duration: render.duration,
      resolution: `${cfg.output.width}x${cfg.output.height}`,
      sha256: hashFile(render.out),
    },
    audio: render.hasAudio && fs.existsSync(audioFile)
      ? {
        path: projectRelative(project.dir, audioFile),
        size: fs.statSync(audioFile).size,
        sha256: hashFile(audioFile),
      }
      : null,
    subtitles: render.subtitleFiles
      ? {
        enabled: true,
        count: render.subStats.count,
        maxLines: render.subStats.maxLines,
        srt: projectRelative(project.dir, render.subtitleFiles.srt),
        ass: projectRelative(project.dir, render.subtitleFiles.ass),
      }
      : { enabled: false, count: 0 },
    render: {
      frames: render.framesRendered,
      totalFrames: render.totalFrames,
      fps: Number(render.fpsActual.toFixed(2)),
      ms: render.renderMs,
    },
    qc: qc
      ? {
        passed: qc.passed,
        file: projectRelative(project.dir, qc.reportFile || path.join(outDir, 'qc.json')),
      }
      : null,
    audioStatus,
  };

  const reportFile = path.join(outDir, 'finish.json');
  writeJson(reportFile, report);

  if (!quiet) {
    section('Ringkasan finish');
    ok(render.out);
    info(`${humanBytes(render.size)} · ${render.duration.toFixed(3)} dtk · ${render.hasAudio ? 'dengan audio' : 'tanpa audio'}`);
    if (render.subtitleFiles) info(`subtitle: ${render.subStats.count} potongan · maks ${render.subStats.maxLines} baris`);
    if (qc) {
      if (qc.passed) ok('QC lulus.');
      else bad('QC belum lulus — periksa out/qc.json.');
    }
    ok(reportFile);
    info(`selesai ${nowStamp()}`);
    if (qc?.passed) info(`berikutnya: vigen publish "${project.name}"`);
  }

  const passed = render.code === 0 && (!qc || qc.passed);
  return { code: passed ? 0 : 1, render, qc, report, out: render.out, reportFile };
}
