import { ENGINE_VERSION, ROOT } from '../core/config.mjs';
import { color, line, section } from '../core/util.mjs';

const HELP = `${color.bold('Vigen')} ${color.gray(`v${ENGINE_VERSION} — video generator by LPTech`)}

${color.bold('Pemakaian')}
  vigen <perintah> [opsi]

${color.bold('Perintah')}
  doctor            Periksa lingkungan (node, ffmpeg, chromium, font, storage)
  setup             Siapkan workspace Vigen + project pertama
  new <nama>        Buat project baru, contoh: vigen new "Konten 2"
  prompt [judul]    Wizard prompt AI + buat project otomatis
  voice [project]   Ekstrak narasi scene.js jadi voice.txt untuk TTS
  list              Daftar project + status
  timing [project]  Hitung timeline dari durasi voice (atau estimasi)
  audio [project]   Rangkai voice + musik + SFX, loudnorm, opsional mux
  subs [project]    Hitung subtitle narasi + ekspor out/subtitle.srt + .ass
  render [project]  Render storyboard scene.js jadi video (+ audio + subtitle)
  preview [project] Render draf cepat 540x960 CRF30 untuk review
  finish [project]  Render final + subtitle + mux audio + QC
  qc [project]      Periksa mutu file final (codec, loudness, hitam, senyap)
  publish [project] Siapkan caption + metadata upload (out/caption.txt)
  make [project]    Pipeline idempoten: audio → subs → finish → qc → publish
  check [project]   Audit teks agar 100% di dalam safe area
  still             Render satu frame jadi PNG
  test              Render video uji 5 detik + validasi
  version           Tampilkan versi
  help              Tampilkan bantuan ini

${color.bold('Contoh')}
  vigen setup
  vigen new "Konten 2"
  vigen prompt
  vigen prompt "Konten 2" --duration 45 --voices 1 --scenes 8 --yes
  vigen voice "Konten 2"
  vigen list
  vigen timing "Konten 2"
  vigen audio "Konten 2"
  vigen subs "Konten 2"
  vigen render "Konten 2"
  vigen preview "Konten 2"
  vigen finish "Konten 2"
  vigen qc "Konten 2"
  vigen publish "Konten 2"
  vigen make "Konten 2"
  vigen check "Konten 2"
  vigen still "Konten 2" --scene s03
  vigen audio "Konten 2" --mux
  vigen doctor
  vigen still --at 2.5 --out ./frame.png
  vigen still --at 2.5 --format jpeg:0.95 --out ./frame.jpg
  vigen test
  vigen test --capture jpeg:0.95
  vigen test --chunk 50 --stop-at 60 --hash-file ./hashes1.json
  vigen test --force --quiet

${color.bold('Opsi test')}
  --out <file>        Path video hasil (default: tmp/smoke.mp4)
  --work <dir>        Folder kerja & state resume
  --chunk <n>         Frame per segmen (default: 300)
  --duration <dtk>    Durasi uji (default: 5)
  --capture <format>  png (kualitas) atau jpeg:0.95 (cepat)
  --stop-at <n>       Berhenti setelah n frame (uji resume)
  --hash-every <n>    Simpan hash tiap n frame (uji determinisme)
  --hash-file <file>  Tulis hash ke file JSON
  --force             Abaikan state lama, render dari awal
  --quiet             Tanpa progres per frame

${color.bold('Opsi prompt / voice')}
  --duration <dtk>    prompt: durasi target (default: 45)
  --voices <n>        prompt/voice: jumlah audio (default: 1)
  --scenes <n>        prompt: jumlah scene cerita (default: 8)
  --yes               prompt: pakai default tanpa tanya
  --out <file>        voice: path voice.txt (default: root project)
  --wps <n>           voice: estimasi kata/detik (default: 2.4)

${color.bold('Opsi timing / audio')}
  --gap <dtk>         Jeda antar scene (default: 0.35)
  --wps <n>           Estimasi kata/detik bila voice belum ada (default: 2.4)
  --no-retime         Pakai .work/timeline.json yang sudah ada
  --music <file>      Override musik (default: assets/music.*)
  --sfx <file>        Override cue SFX (default: sfx.json)
  --mux               Gabungkan audio ke video terbaru di out/
  --video <file>      Video sumber untuk --mux
  --out <file>        Path hasil mux

${color.bold('Opsi render / check')}
  --out <file>        Path video hasil render
  --capture <format>  png (kualitas) atau jpeg:0.95 (cepat)
  --chunk <n>         Frame per segmen (default: 300)
  --no-retime         Pakai .work/timeline.json yang sudah ada
  --no-audio          Jangan gabungkan out/audio.wav
  --subs              Paksa subtitle aktif (tanpa tanya)
  --no-subs           Paksa subtitle nonaktif (tanpa tanya)
  --subs-max-chars <n> Batas karakter per baris subtitle (default: 38)
  --step <n>          check: periksa tiap n frame (default: 1)
  --json              check: keluaran JSON
  --force             render/make: abaikan state resume
  --quiet             Tanpa progres per frame

${color.bold('Opsi subs / preview / finish')}
  --max-chars <n>     subs: alias --subs-max-chars
  --out <file>        preview/render/finish/make: path video hasil
  --scale <n>         preview: skala resolusi (default: 0.5)
  --crf <n>           preview: kualitas (default: 30)
  --no-audio          finish/make: jangan pakai out/audio.wav
  --no-qc             finish/make: lewati QC
  --no-publish        make: lewati pembuatan caption
  --check             make: audit safe area sebelum render

${color.bold('Opsi qc / publish')}
  --preview           qc: periksa file draf 540x960
  --video <file>      qc/publish: periksa/pakai file tertentu
  --lufs <n>          qc: target loudness (default: -14)
  --tol <n>           qc: toleransi LUFS (default: 1)
  --peak-max <n>      qc: batas true peak dBTP (default: -1)
  --black-max <n>     qc: ambang frame hitam dtk (default: 0.2)
  --silence-max <n>   qc: ambang audio senyap dtk (default: 2)
  --title <teks>      publish: override judul
  --description <teks> publish: override deskripsi
  --hashtags <teks>   publish: override hashtag, contoh "#sejarah #malaka"
  --strict            publish: gagal bila QC belum lulus
  --publish-out <dir> make: folder caption/metadata (default: out/)
  --no-retime         subs/qc/make: pakai .work/timeline.json yang ada
`;

export async function main(argv) {
  const [cmd, ...rest] = argv;

  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    process.stdout.write(HELP);
    return 0;
  }

  if (cmd === 'version' || cmd === '--version' || cmd === '-v') {
    line(`${color.bold('vigen')} ${ENGINE_VERSION} ${color.gray('— by LPTech')}`);
    line(color.gray(ROOT));
    return 0;
  }

  if (cmd === 'doctor') {
    const { doctorCommand } = await import('./doctor.mjs');
    return doctorCommand(rest);
  }

  if (cmd === 'setup') {
    const { setupCommand } = await import('./setup.mjs');
    return setupCommand(rest);
  }

  if (cmd === 'new') {
    const { newCommand } = await import('./new.mjs');
    return newCommand(rest);
  }

  if (cmd === 'prompt') {
    const { promptCommand } = await import('./prompt.mjs');
    return promptCommand(rest);
  }

  if (cmd === 'voice') {
    const { voiceCommand } = await import('./voice.mjs');
    return voiceCommand(rest);
  }

  if (cmd === 'list') {
    const { listCommand } = await import('./list.mjs');
    return listCommand(rest);
  }

  if (cmd === 'timing') {
    const { timingCommand } = await import('./timing.mjs');
    return timingCommand(rest);
  }

  if (cmd === 'audio') {
    const { audioCommand } = await import('./audio.mjs');
    return audioCommand(rest);
  }

  if (cmd === 'render') {
    const { renderCommand } = await import('./render.mjs');
    return renderCommand(rest);
  }

  if (cmd === 'subs' || cmd === 'subtitle') {
    const { subsCommand } = await import('./subs.mjs');
    return subsCommand(rest);
  }

  if (cmd === 'preview') {
    const { previewCommand } = await import('./preview.mjs');
    return previewCommand(rest);
  }

  if (cmd === 'finish') {
    const { finishCommand } = await import('./finish.mjs');
    return finishCommand(rest);
  }

  if (cmd === 'qc') {
    const { qcCommand } = await import('./qc.mjs');
    return qcCommand(rest);
  }

  if (cmd === 'publish') {
    const { publishCommand } = await import('./publish.mjs');
    return publishCommand(rest);
  }

  if (cmd === 'make') {
    const { makeCommand } = await import('./make.mjs');
    return makeCommand(rest);
  }

  if (cmd === 'check') {
    const { checkCommand } = await import('./check.mjs');
    return checkCommand(rest);
  }

  if (cmd === 'still') {
    const { stillCommand } = await import('./still.mjs');
    return stillCommand(rest);
  }

  if (cmd === 'test') {
    const { testCommand } = await import('./test.mjs');
    return testCommand(rest);
  }

  process.stderr.write(`${color.red('✗')} perintah tidak dikenal: ${cmd}\n\n`);
  process.stdout.write(HELP);
  return 1;
}
