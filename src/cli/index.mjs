import { ENGINE_VERSION, ROOT } from '../core/config.mjs';
import { color, line, section } from '../core/util.mjs';

const HELP = `${color.bold('Vigen')} ${color.gray(`v${ENGINE_VERSION} — video generator by LPTech`)}

${color.bold('Pemakaian')}
  vigen <perintah> [opsi]

${color.bold('Perintah')}
  doctor            Periksa lingkungan (node, ffmpeg, chromium, font, storage)
  setup             Siapkan workspace Vigen + project pertama
  new <nama>        Buat project baru, contoh: vigen new "Konten 2"
  list              Daftar project + status
  still             Render satu frame jadi PNG
  test              Render video uji 5 detik + validasi
  version           Tampilkan versi
  help              Tampilkan bantuan ini

${color.bold('Contoh')}
  vigen setup
  vigen new "Konten 2"
  vigen list
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

  if (cmd === 'list') {
    const { listCommand } = await import('./list.mjs');
    return listCommand(rest);
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
