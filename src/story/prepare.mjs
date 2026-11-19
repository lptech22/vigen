import { buildTimeline, readTimeline, listVoiceFiles } from '../audio/timeline.mjs';
import { loadSceneFile, buildStoryboard } from './storyboard.mjs';
import { buildSubtitles, DEFAULT_SUBS } from './subs.mjs';

/**
 * Muat scene.js, sinkronkan dengan durasi voice, dan hasilkan storyboard siap render.
 * Bila voice sudah ada, timeline selalu dihitung ulang kecuali retime=false.
 * `subs: true` menambahkan array subtitle narasi ke storyboard.
 */
export async function prepareStoryboard({
  cfg, project, retime = true, subs = false, subsOptions = {},
}) {
  const sceneData = await loadSceneFile(project.dir);
  const voices = listVoiceFiles(project.dir);
  let timeline = readTimeline(project.dir);

  if (voices.length) {
    if (retime || !timeline) {
      timeline = await buildTimeline({ cfg, project });
    }
  } else if (!timeline) {
    try {
      timeline = await buildTimeline({ cfg, project });
    } catch {
      timeline = null;
    }
  }

  const storyboard = buildStoryboard({ cfg, sceneData, timeline });
  storyboard.subs = subs
    ? buildSubtitles(storyboard, { ...DEFAULT_SUBS, ...(cfg.subs || {}), ...(subsOptions || {}) })
    : [];
  return { sceneData, storyboard, timeline };
}
