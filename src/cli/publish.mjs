import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, readJson, writeJson, ENGINE_VERSION } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, ensureDir, line, color, ok, info, warn, bad, humanBytes, nowStamp } from '../core/util.mjs';
import { pickVideo, hashFile, projectRelative } from '../core/media.mjs';
import { loadSceneFile } from '../story/storyboard.mjs';
import { probeVideo } from '../render/encode.mjs';

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function parseTags(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value;
  return String(value).split(/[\s,]+/);
}

function normalizeTags(value) {
  const tags = parseTags(value)
    .map((t) => clean(t))
    .filter(Boolean)
    .map((t) => (t.startsWith('#') ? t : `#${t}`));
  return [...new Set(tags)];
}

function buildCaption({ title, description, hashtags }) {
  const parts = [];
  if (title) parts.push(title);
  if (description) parts.push(description);
  if (hashtags.length) parts.push(hashtags.join(' '));
  return `${parts.join('\n\n')}\n`;
}

export async function publishCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);
  const result = await publishProject({ cfg, project, flags });
  return result.code;
}

/**
 * Siapkan paket publikasi offline: caption + metadata. Tidak mengunggah
 * ke platform mana pun, jadi aman dipakai tanpa API key.
 */
export async function publishProject({ cfg, project, flags = {}, quiet = false }) {
  const outRoot = path.join(project.dir, 'out');
  const outDir = ensureDir(flags.out ? path.resolve(String(flags.out)) : outRoot);

  const video = flags.video
    ? path.resolve(String(flags.video))
    : pickVideo(outRoot, {
      slug: project.slug,
      width: cfg.output.width,
      height: cfg.output.height,
    });

  if (!video || !fs.existsSync(video)) {
    throw new Error(`video final belum ada. Render dulu: vigen finish "${project.name}"`);
  }

  const script = readJson(path.join(project.dir, 'script.json'), {}) || {};
  const pub = script.publish || {};
  let sceneData = null;
  try {
    sceneData = await loadSceneFile(project.dir);
  } catch { /* publish tetap bisa memakai nama project */ }
  const hook = sceneData?.scenes?.find((s) => s.type === 'hook') || sceneData?.scenes?.[0] || {};

  const title = clean(flags.title)
    || clean(pub.judul)
    || clean(hook.title)
    || clean(hook.subtitle)
    || project.name;
  const description = flags.description !== undefined
    ? String(flags.description).trim()
    : String(pub.deskripsi ?? '').trim();
  const hashtags = normalizeTags(
    flags.hashtags !== undefined ? flags.hashtags : (pub.hashtag ?? pub.hashtags ?? []),
  );

  const probe = await probeVideo(cfg, video);
  const st = probe.streams?.[0] || {};
  const fmt = probe.format || {};
  const size = Number(fmt.size || fs.statSync(video).size);
  const duration = Number(fmt.duration || st.duration || 0);

  const qcFile = path.join(outRoot, 'qc.json');
  const qc = flags['ignore-qc'] ? null : readJson(qcFile, null);
  const videoRel = projectRelative(project.dir, video);
  const qcMatchesVideo = qc
    ? (qc.path ? qc.path === videoRel : qc.file === path.basename(video))
    : false;
  const qcPassed = qc?.passed === true && !qc.preview && qcMatchesVideo;
  if (flags['ignore-qc'] && !quiet) {
    warn('QC dilewati karena --no-qc.');
  }
  if (qc && !qcMatchesVideo) {
    warn('out/qc.json berasal dari file lain — jalankan vigen qc pada video ini.');
  }
  if (!qcPassed && !flags['ignore-qc']) {
    warn(qc ? 'QC terakhir belum lulus — file tetap disiapkan, periksa out/qc.json.'
      : 'out/qc.json belum ada — jalankan vigen qc sebelum upload.');
    if (flags.strict) {
      bad('publish dibatalkan karena --strict dan QC belum lulus.');
      return { code: 1, video, qc, report: null };
    }
  }

  const srt = path.join(outRoot, 'subtitle.srt');
  const ass = path.join(outRoot, 'subtitle.ass');
  const subtitles = fs.existsSync(srt) || fs.existsSync(ass)
    ? {
      srt: fs.existsSync(srt) ? projectRelative(project.dir, srt) : null,
      ass: fs.existsSync(ass) ? projectRelative(project.dir, ass) : null,
    }
    : null;

  const caption = buildCaption({ title, description, hashtags });
  const report = {
    schema: 1,
    engine: ENGINE_VERSION,
    project: project.name,
    slug: project.slug,
    title,
    description,
    hashtags,
    caption,
    video: {
      path: projectRelative(project.dir, video),
      size,
      duration,
      resolution: `${st.width}x${st.height}`,
      sha256: hashFile(video),
    },
    subtitles,
    qc: qc
      ? {
        passed: qcPassed,
        file: projectRelative(project.dir, qcFile),
      }
      : null,
    createdAt: new Date().toISOString(),
  };

  const publishFile = path.join(outDir, 'publish.json');
  const captionFile = path.join(outDir, 'caption.txt');
  writeJson(publishFile, report);
  fs.writeFileSync(captionFile, caption);

  if (!quiet) {
    line(`${color.bold('Vigen publish')} ${color.gray(`— ${project.name}`)}`);
    ok(captionFile);
    ok(publishFile);
    info(`${humanBytes(size)} · ${duration.toFixed(3)} dtk · ${st.width}x${st.height}`);
    if (hashtags.length) info(`hashtag: ${hashtags.join(' ')}`);
    info(`selesai ${nowStamp()}`);
  }

  return {
    code: 0,
    video,
    qc,
    report,
    publishFile,
    captionFile,
  };
}
