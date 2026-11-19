import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { loadConfig } from '../core/config.mjs';
import { ensureWorkspace, createProject } from '../core/workspace.mjs';
import { parseArgs, line, section, color, ok, info, warn } from '../core/util.mjs';
import { buildPrompt } from '../story/prompt.mjs';

const DEFAULTS = { duration: 45, voices: 1, scenes: 8 };
const LIMITS = { duration: [10, 300], voices: [1, 12], scenes: [3, 24] };

function numeric(value) {
  if (value === undefined || value === null || value === true) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function askNumber(rl, label, def, [min, max]) {
  for (;;) {
    const raw = (await rl.question(`${label} [${def}]: `)).trim();
    if (!raw) return def;
    const n = Number(raw);
    if (Number.isFinite(n) && n >= min && n <= max) return n;
    line(`  masukkan angka ${min}–${max}.`);
  }
}

function checkRange(name, value, [min, max]) {
  if (!Number.isFinite(value) || value < min || value > max) {
    throw new Error(`${name} harus angka ${min}–${max} (sekarang: ${value})`);
  }
  return value;
}

export async function promptCommand(argv) {
  const { flags, rest } = parseArgs(argv);
  const cfg = loadConfig();
  const ws = cfg.workspace;
  const outro = Number(cfg.brand?.outro ?? 1.5) || 1.5;

  let title = rest.join(' ').trim();
  let duration = numeric(flags.duration);
  let voices = numeric(flags.voices);
  let scenes = numeric(flags.scenes);

  const incomplete = () => !title || duration === undefined || voices === undefined || scenes === undefined;
  const canAsk = Boolean(process.stdin.isTTY && process.stdout.isTTY) && !flags.yes;
  const useDefaults = Boolean(flags.yes);

  if (!title && !canAsk) {
    throw new Error('judul wajib diisi. Contoh: vigen prompt "Judul Konten" --yes');
  }
  if (incomplete() && !canAsk && !useDefaults) {
    throw new Error('parameter belum lengkap. Contoh: ' +
      'vigen prompt "Judul" --duration 45 --voices 1 --scenes 8 --yes');
  }

  const rl = canAsk && incomplete()
    ? readline.createInterface({ input: process.stdin, output: process.stdout })
    : null;

  try {
    while (!title) {
      const answer = (await rl.question('Judul konten: ')).trim();
      if (answer) title = answer;
      else line('  judul tidak boleh kosong.');
    }
    if (duration === undefined) {
      duration = rl ? await askNumber(rl, 'Durasi target (detik)', DEFAULTS.duration, LIMITS.duration) : DEFAULTS.duration;
    }
    if (voices === undefined) {
      voices = rl ? await askNumber(rl, 'Jumlah voice', DEFAULTS.voices, LIMITS.voices) : DEFAULTS.voices;
    }
    if (scenes === undefined) {
      scenes = rl ? await askNumber(rl, 'Jumlah scene', DEFAULTS.scenes, LIMITS.scenes) : DEFAULTS.scenes;
    }
  } finally {
    rl?.close();
  }

  checkRange('durasi', duration, LIMITS.duration);
  checkRange('jumlah voice', voices, LIMITS.voices);
  checkRange('jumlah scene', scenes, LIMITS.scenes);
  if (duration <= outro + 2) {
    throw new Error(`durasi terlalu pendek: minimal ${Math.ceil(outro + 3)} dtk (outro ${outro} dtk).`);
  }

  const before = ensureWorkspace(ws);
  if (before.created) info(`workspace baru dibuat: ${ws}`);

  const { dir, meta } = createProject(ws, title, cfg, {
    niche: flags.niche ? String(flags.niche) : undefined,
    tone: flags.tone ? String(flags.tone) : undefined,
    spec: { duration, voices, scenes },
    audio: { mode: voices === 1 ? 'single' : 'blocks', voices },
  });

  const promptText = buildPrompt({
    title: meta.name, duration, voices, scenes, cfg,
    niche: meta.niche, tone: meta.tone,
  });
  const promptFile = path.join(dir, 'prompt.txt');
  fs.writeFileSync(promptFile, promptText);
  meta.spec = { duration, voices, scenes };
  meta.audio = { mode: voices === 1 ? 'single' : 'blocks', voices };
  fs.writeFileSync(path.join(dir, 'vigen.project.json'), JSON.stringify(meta, null, 2) + '\n');

  line(`${color.bold('Prompt siap')}`);
  ok(promptFile);
  info(`judul   : ${meta.name}`);
  info(`durasi  : ${duration} dtk (outro ${outro} dtk otomatis)`);
  info(`scene   : ${scenes} + outro`);
  info(`voice   : ${voices === 1 ? '1 audio utuh' : `${voices} blok audio`}`);
  info(`narasi  : ± ${Math.round((duration - outro) * 2.4)} kata`);

  const voiceHint = voices === 1
    ? '   copy voice.txt ke ElevenLabs, simpan sebagai voice/narasi.mp3'
    : `   copy tts/voice-1.txt … tts/voice-${voices}.txt, simpan sebagai voice/voice-1.mp3 … voice/voice-${voices}.mp3`;

  section('Langkah');
  line(`  1. buka ${color.cyan(promptFile)}`);
  line('  2. copy SELURUH isinya ke AI (ChatGPT/Claude/Gemini), kirim sekali saja');
  line(`  3. simpan jawaban AI sebagai ${color.cyan(path.join(dir, 'scene.js'))} (timpa template)`);
  line(`  4. ${color.cyan(`vigen voice "${meta.name}"`)} → menghasilkan voice.txt`);
  line(voiceHint);
  line(`  5. ${color.cyan(`vigen check "${meta.name}"`)}`);
  line(`  6. ${color.cyan(`vigen audio "${meta.name}"`)}`);
  line(`  7. ${color.cyan(`vigen preview "${meta.name}"`)} → review cepat 540x960`);
  line(`  8. ${color.cyan(`vigen finish "${meta.name}"`)} → final + subtitle + QC`);
  line(`  9. ${color.cyan(`vigen publish "${meta.name}"`)} → caption + metadata upload`);
  line(`     atau sekali jalan: ${color.cyan(`vigen make "${meta.name}"`)}`);

  if (voices === 1) {
    section('Catatan');
    warn('mode 1 audio: durasi scene dihitung proporsional dari jumlah kata narasi.');
    info('butuh presisi per scene? taruh voice/s01.mp3, s02.mp3, … seperti biasa.');
  }

  return 0;
}
