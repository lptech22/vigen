import { loadConfig } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, line, section, color, ok, info, warn, bad, pad } from '../core/util.mjs';
import { prepareStoryboard } from '../story/prepare.mjs';
import { subtitleStats, validateWordTimes } from '../story/subs.mjs';
import { resolveSubtitleOption } from './subtitle-option.mjs';
import { subtitleOptionsFrom, validateSubtitles } from './subs.mjs';
import { launchBrowser } from '../render/browser.mjs';

function sceneAt(storyboard, t) {
  const s = storyboard.scenes.find((sc) => t >= sc.start && t < sc.end);
  return s || storyboard.scenes[storyboard.scenes.length - 1];
}

export async function checkCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);

  const subOpt = await resolveSubtitleOption({ cfg, project, flags, persist: false, ask: false });
  const { storyboard } = await prepareStoryboard({
    cfg, project, retime: !flags['no-retime'], subs: subOpt.enabled,
    subsOptions: subtitleOptionsFrom(cfg, flags),
  });

  const subProblems = subOpt.enabled
    ? [
      ...validateSubtitles(storyboard.subs || [], subtitleOptionsFrom(cfg, flags)),
      ...validateWordTimes(storyboard.subs || []),
    ]
    : [];
  const worldScenes = storyboard.scenes.filter((s) => s.type === 'diorama' || s.type === 'adegan');
  const world = {
    scenes: worldScenes.length,
    diorama: worldScenes.filter((s) => s.type === 'diorama').length,
    adegan: worldScenes.filter((s) => s.type === 'adegan').length,
    props: worldScenes.reduce((a, s) => a + (s.props?.length || 0), 0),
    cast: worldScenes.reduce((a, s) => a + (s.cast?.length || 0), 0),
    callouts: worldScenes.reduce((a, s) => a + (s.callouts?.length || 0), 0),
  };

  const step = Math.max(1, Number(flags.step || 1));
  const totalFrames = Math.max(1, Math.round(storyboard.duration * cfg.output.fps));
  const safe = storyboard.safe;

  if (!flags.json) {
    line(`${color.bold('Vigen check')} ${color.gray(`— ${project.name}`)}`);
    info(`safe area: x ${safe.left}–${safe.right} · y ${safe.top}–${safe.bottom}`);
    info(`audit ${totalFrames} frame (step ${step}) · ${storyboard.duration.toFixed(3)} dtk`);
    if (subOpt.enabled && storyboard.subs?.length) {
      const st = subtitleStats(storyboard.subs);
      ok(`subtitle ikut diaudit: ${st.count} potongan · maks ${st.maxLines} baris`);
    }
    if (world.scenes) {
      info(`scene dunia: ${world.scenes} (${world.diorama} diorama · ${world.adegan} adegan) `
        + `· ${world.props} prop · ${world.cast} cast · ${world.callouts} callout`);
    }
    if (subProblems.length) {
      bad(`subtitle/timing: ${subProblems.length} masalah`);
      for (const p of subProblems.slice(0, 8)) line(`  ${p}`);
      if (subProblems.length > 8) info(`… dan ${subProblems.length - 8} masalah lain`);
    } else if (subOpt.enabled && storyboard.subs?.length) {
      ok('timing kata konsisten (wordTimes)');
    }
  }

  const browser = await launchBrowser(cfg, {
    width: cfg.output.width,
    height: cfg.output.height,
    storyboard,
  });

  const groups = new Map();
  let audited = 0;
  let boxCount = 0;

  try {
    for (let f = 0; f < totalFrames; f += step) {
      const t = f / cfg.output.fps;
      const res = await browser.session.send('Runtime.evaluate', {
        expression: `window.__auditFrame(${Number(t.toFixed(6))})`,
        returnByValue: true,
      }, 30000);
      if (res.exceptionDetails) {
        throw new Error(`audit frame ${f} gagal: ${res.exceptionDetails.text || 'unknown'}`);
      }
      const value = res.result?.value || {};
      audited++;
      boxCount += Array.isArray(value.boxes) ? value.boxes.length : 0;
      for (const b of value.violations || []) {
        if (!groups.has(b.id)) {
          const sc = sceneAt(storyboard, t);
          groups.set(b.id, {
            id: b.id,
            scene: sc.id,
            type: sc.type,
            first: t,
            over: b.over,
            box: b,
          });
        }
      }
    }
  } finally {
    await browser.close();
  }

  const list = [...groups.values()];
  if (flags.json) {
    process.stdout.write(JSON.stringify({
      project: project.name,
      duration: storyboard.duration,
      framesAudited: audited,
      boxes: boxCount,
      safe,
      world,
      validation: subProblems,
      violations: list,
    }, null, 2) + '\n');
    return list.length || subProblems.length ? 1 : 0;
  }

  section('Audit teks');
  ok(`${audited} frame diperiksa · ${boxCount} kotak teks`);

  if (!list.length) {
    ok('semua teks berada di dalam safe area.');
    return subProblems.length ? 1 : 0;
  }

  bad(`${list.length} elemen keluar safe area`);
  const wId = Math.min(34, Math.max(12, ...list.map((v) => v.id.length))) + 2;
  const wSc = Math.max(8, ...list.map((v) => `${v.scene}:${v.type}`.length)) + 2;
  for (const v of list.slice(0, 24)) {
    line(`  ${pad(v.id, wId)}${color.gray(pad(`${v.scene}:${v.type}`, wSc))} t=${v.first.toFixed(2)}s  ${color.red(v.over.join(', '))}`);
    line(`  ${' '.repeat(wId)}${color.gray(`box x ${v.box.x0.toFixed(0)}–${v.box.x1.toFixed(0)} · y ${v.box.y0.toFixed(0)}–${v.box.y1.toFixed(0)}`)}`);
  }
  if (list.length > 24) warn(`… dan ${list.length - 24} elemen lain`);
  info('ringkas teks atau perkecil ukuran font di scene.js, lalu ulangi: vigen check');
  return 1;
}
