import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, readJson } from '../core/config.mjs';
import { resolveProject, projectFile } from '../core/workspace.mjs';
import { parseArgs, ensureDir, line, section, color, ok, info, warn } from '../core/util.mjs';
import { loadNarration, splitByWords, narrationText } from '../story/narration.mjs';

const WORDS_PER_SECOND = 2.4;

export async function voiceCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const project = resolveProject(cfg.workspace, rest[0]);

  const wps = Number(flags.wps ?? WORDS_PER_SECOND);
  if (!Number.isFinite(wps) || wps <= 0) throw new Error('--wps harus angka > 0');

  const narration = await loadNarration(project.dir);
  if (!narration) {
    throw new Error(`scene.js belum ada atau tidak valid di ${project.dir}. ` +
      'Simpan hasil AI sebagai scene.js, lalu ulangi.');
  }
  if (!narration.length) throw new Error('scene.js belum punya scene.');

  const missing = narration.filter((n) => !n.narasi);
  if (missing.length === narration.length) {
    throw new Error('tidak ada scene dengan field "narasi". Tambahkan narasi di scene.js ' +
      'atau buat prompt baru dengan: vigen prompt');
  }

  const meta = readJson(projectFile(project.dir), {}) || {};
  const voices = Math.max(1, Math.floor(Number(flags.voices ?? meta.audio?.voices ?? meta.spec?.voices ?? 1)) || 1);

  const totalWords = narration.reduce((a, n) => a + n.words, 0);
  const estimate = totalWords / wps;

  const outFile = flags.out
    ? path.resolve(String(flags.out))
    : path.join(project.dir, 'voice.txt');
  const text = narrationText(narration);
  fs.writeFileSync(outFile, text);

  line(`${color.bold('Vigen voice')} ${color.gray(`— ${project.name}`)}`);
  ok(outFile);
  info(`${narration.length} scene · ${totalWords} kata · ${text.length} karakter`);
  info(`estimasi ${estimate.toFixed(1)} dtk @ ${wps} kata/dtk`);

  const target = meta.spec?.duration
    ? Number(meta.spec.duration) - (Number(cfg.brand?.outro ?? 1.5) || 1.5)
    : null;
  if (target) {
    const diff = estimate - target;
    if (diff > target * 0.15) {
      warn(`narasi ± ${diff.toFixed(1)} dtk lebih panjang dari target ${target.toFixed(1)} dtk; ringkas beberapa kalimat.`);
    } else if (diff < -target * 0.25) {
      info(`narasi ± ${Math.abs(diff).toFixed(1)} dtk lebih pendek dari target; masih aman.`);
    }
  }

  if (missing.length) {
    warn(`scene tanpa narasi: ${missing.map((n) => n.id).join(', ')} (dilewati)`);
  }

  if (voices > 1) {
    const ttsDir = ensureDir(path.join(project.dir, 'tts'));
    const blocks = splitByWords(narration, voices);
    section(`Blok voice (${blocks.length})`);
    blocks.forEach((block, i) => {
      const file = path.join(ttsDir, `voice-${i + 1}.txt`);
      fs.writeFileSync(file, narrationText(block));
      const words = block.reduce((a, n) => a + n.words, 0);
      ok(file);
      info(`${block[0].id}–${block[block.length - 1].id} · ${words} kata · ${(words / wps).toFixed(1)} dtk`);
    });
  }

  section('Berikutnya');
  if (voices === 1) {
    line(`  1. copy isi ${color.cyan(path.basename(outFile))} ke ElevenLabs (sekali generate)`);
    line('  2. simpan hasilnya sebagai voice/narasi.mp3');
    line(`  3. ${color.cyan(`vigen timing "${project.name}"`)} lalu ${color.cyan(`vigen audio "${project.name}"`)}`);
  } else {
    line(`  1. generate tiap file tts/voice-N.txt secara terpisah (${voices} kali)`);
    line(`  2. simpan sebagai voice/voice-1.mp3 … voice/voice-${voices}.mp3 (urutan natural)`);
    line(`  3. ${color.cyan(`vigen timing "${project.name}"`)} lalu ${color.cyan(`vigen audio "${project.name}"`)}`);
  }
  return 0;
}
