import { loadConfig } from '../core/config.mjs';
import { resolveProject } from '../core/workspace.mjs';
import { parseArgs, line, section, color, ok, info, warn } from '../core/util.mjs';
import { buildTimeline, DEFAULT_GAP, WORDS_PER_SECOND } from '../audio/timeline.mjs';

export async function timingCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);

  const gap = flags.gap !== undefined ? Number(flags.gap) : DEFAULT_GAP;
  if (!Number.isFinite(gap) || gap < 0) throw new Error('--gap harus angka detik >= 0');

  const wps = flags.wps !== undefined ? Number(flags.wps) : WORDS_PER_SECOND;
  if (!Number.isFinite(wps) || wps <= 0) throw new Error('--wps harus angka > 0');

  const timeline = await buildTimeline({ cfg, project, gap, wps });

  line(`${color.bold('Vigen timing')} ${color.gray(`— ${project.name}`)}`);
  ok(`timeline: ${timeline.scenes.length} scene · total ${timeline.totalDuration.toFixed(3)} dtk`);
  info(`sumber: ${timeline.source === 'voice' ? 'durasi voice asli' : `estimasi ${wps} kata/dtk (voice belum ada)`}`);
  info(`jeda antar scene: ${gap} dtk`);

  section('Scene');
  for (const s of timeline.scenes) {
    const src = s.file ? s.file : `estimasi ${s.words} kata`;
    line(`  ${color.gray(s.id.padEnd(8))} ${String(s.start.toFixed(3)).padStart(8)} → ${String(s.end.toFixed(3)).padStart(8)}  ${color.gray(src)}`);
  }

  section('Tersimpan');
  ok(`${project.dir}/.work/timeline.json`);
  if (timeline.source === 'estimate') {
    warn('masih estimasi. Setelah voice/ terisi, jalankan vigen timing lagi.');
  } else {
    info('berikutnya: vigen audio "' + project.name + '"');
  }
  return 0;
}
