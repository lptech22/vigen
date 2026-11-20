import { SAFE, PUNCHLINE_PAUSE } from './storyboard.mjs';

const WPS = 2.4; // target kata/detik untuk narasi Bahasa Indonesia

/**
 * Rencana tipe scene. Untuk video sejarah, scene dunia (`diorama`/`adegan`)
 * disarankan sejak awal supaya AI tidak menumpuk kartu teks.
 */
function suggestedTypes(count) {
  if (count <= 1) return ['punchline'];
  const types = ['hook'];
  const middle = count - 2;
  if (middle === 1) {
    types.push('fact');
  } else if (middle >= 2) {
    types.push('diorama', 'fact');
    if (middle >= 3) types.push('adegan');
    const extra = ['timeline', 'diorama', 'stat', 'adegan', 'deadpan'];
    for (let i = 0; i < middle - 3; i++) types.push(extra[i % extra.length]);
  }
  types.push('punchline');
  return types;
}

const TYPE_HINT = {
  hook: 'kartu judul + chapter',
  diorama: '2–4 prop + kamera pelan',
  adegan: '1–2 karakter + 1 callout',
  fact: 'teks + sumber',
  timeline: '3 item + koreksi',
  stat: 'angka besar + label',
  quote: 'kutipan + nama',
  deadpan: 'satu kalimat + aside',
  punchline: 'setup + teks pendek',
};


function scenePlan({ duration, scenes, outro }) {
  const content = Math.max(3, duration - outro);
  const per = content / scenes;
  const words = Math.max(2, Math.round(per * WPS));
  const types = suggestedTypes(scenes);
  return types.map((type, i) => ({
    id: `s${String(i + 1).padStart(2, '0')}`,
    type,
    seconds: Math.round(per * 10) / 10,
    words,
  }));
}

/**
 * Prompt siap tempel ke AI. AI hanya perlu mengembalikan satu file:
 * scene.js dengan field `narasi` di tiap scene.
 */
export function buildPrompt({ title, duration, voices, scenes, cfg, niche, tone }) {
  const outro = Number(cfg.brand?.outro ?? 1.5) || 1.5;
  const content = Math.max(3, duration - outro);
  const totalWords = Math.round(content * WPS);
  const plan = scenePlan({ duration, scenes, outro });
  const safe = SAFE;
  const lastId = `s${String(scenes).padStart(2, '0')}`;
  const nicheName = niche || 'sejarah';
  const toneName = tone || 'deadpan-sarkas';

  const planLines = plan
    .map((p) => `  ${p.id}  ${p.type.padEnd(9)} ± ${p.seconds.toFixed(1)} dtk  ± ${p.words} kata  · ${TYPE_HINT[p.type] || ''}`)
    .join('\n');

  const voiceRule = voices === 1
    ? `Narasi akan diubah menjadi SATU audio utuh (sekali generate TTS).
Semua narasi harus menyambung mulus menjadi satu paragraf cerita dari awal sampai akhir.`
    : `Narasi akan diubah menjadi ${voices} audio (dibagi per blok scene berurutan).
Tiap blok harus terdengar utuh, dan sambungan antar blok tetap nyambung.`;

  return `Kamu adalah penulis naskah dan sutradara visual untuk kanal sejarah vertikal 9:16.
Tugasmu: menulis SATU file storyboard Vigen yang valid.

## PARAMETER (JANGAN DIUBAH)
- Judul konten   : ${title}
- Durasi target  : ${duration} detik (termasuk outro ${outro} dtk yang dibuat mesin)
- Scene cerita   : ${scenes} scene (outro TIDAK dihitung, TIDAK perlu ditulis)
- Audio narasi   : ${voices} file
- Target narasi  : ± ${totalWords} kata total (± ${WPS} kata/detik)
- Bahasa        : Indonesia
- Nada          : ${toneName}. Fakta dingin, kalimat pendek, punchline datar. Tanpa emoji, tanpa "Halo guys", tanpa clickbait berlebihan.
- Niche         : ${nicheName}

${voiceRule}

## FORMAT JAWABAN
Balas HANYA kode JavaScript yang bisa langsung disimpan sebagai scene.js.
- Tanpa penjelasan, tanpa markdown, tanpa blok \`\`\`.
- Mulai dengan: export default {
- Akhiri dengan: };
- Jangan memakai import, require, fungsi, atau variabel di luar objek.
- Jangan memakai field "duration" dan jangan menulis scene "outro".

## STRUKTUR
export default {
  schema: 1,
  style: 'sejarah/diorama',
  brand: { watermark: 'LPTech' },
  scenes: [ ...tepat ${scenes} scene... ],
};

Tiap scene wajib punya: id, type, narasi.
- id berurutan: s01, s02, ... s${String(scenes).padStart(2, '0')}
- type hanya: hook, fact, timeline, quote, stat, deadpan, punchline, diorama, adegan
- narasi: teks yang DIUCAPKAN (1–3 kalimat). Boleh berbeda dari teks di layar.
- Teks layar ditulis singkat, padat, tanpa emoji.
- chapter (opsional): { text, highlight } untuk header bab. Tulis di scene pertama
  sebuah bab; header bertahan sampai scene berikutnya mengganti nilainya.
  chapter.text ≤ 70 karakter dan highlight harus bagian dari text. Maksimal
  ± 6 bab untuk video 30–45 dtk.
- camera (opsional): { from: {x,y,zoom,rotate}, to: {...}, content: false }.
  zoom 1..1.2, rotate -3..3 derajat. content: false agar teks tidak ikut bergerak.
  Di scene diorama/adegan, content default true: dunia bergerak, teks tetap diam.
  Pakai gerakan kecil (zoom 1.02 → 1.08), jangan zoom mendadak.
- props (khusus diorama/adegan): array objek dunia, maksimal 12.
- cast (khusus adegan): array karakter, maksimal 6, minimal 1.
- callouts (khusus adegan): array label penunjuk, maksimal 4.

## RENCANA SCENE YANG DISARANKAN
${planLines}

Aturan:
- Scene pertama WAJIB type "hook".
- Scene terakhir WAJIB type "punchline".
- Boleh mengubah tipe scene tengah, tetapi minimal ada 1 "fact".
- Sisipkan 1–3 scene "diorama" bila topik punya objek konkret (peta, kapal,
  rempah, koin, benteng). Jangan dipaksakan bila topiknya abstrak.
- Pakai 1–2 scene "adegan" untuk momen yang butuh tokoh/aksi (tawar-menawar,
  penjaga benteng, raja menerima utusan). Adegan tanpa tokoh lebih baik
  memakai "diorama".
- Total kata seluruh narasi mendekati ${totalWords} kata. Lebih baik sedikit pendek daripada kepanjangan.

## FIELD PER TIPE
- hook       : kicker, title, subtitle, source
- fact       : kicker, title, body, source
- timeline   : kicker, title, items: [{ year, text }] (maks 4), correction: { was, year, text } (opsional)
- quote      : quote, by
- stat       : kicker, value, unit, label, source
- deadpan    : kicker, text, aside (opsional)
- punchline  : setup, text, pause: ${PUNCHLINE_PAUSE}
- diorama    : kicker, title, body, source, ground, props
- adegan     : kicker, title, body, source, ground, props, cast, callouts

## SCENE DUNIA (diorama / adegan)
- ground: 'island' untuk pulau/dermaga/pasar terbuka, 'table' untuk meja/ruang
  dalam, 'none' untuk latar polos. Default 'island'.
- Prop yang tersedia: map, book, scroll, ship, coins, scale, lantern, crate,
  spice, compass, fort, flag. Karakter: pedagang, pelaut, serdadu, raja, petani.
  Nama di luar daftar = render gagal.
- props: [{ name, x, y, scale, rotate, delay, anim }]. Maks 12.
  x 200–880, y 900–1250, scale 0.3–1, rotate -20..20, delay 0–1.5.
  anim: 'pop' | 'drop' | 'slide' | 'rise'. Tanpa x/y, prop disusun otomatis.
- cast: [{ who, x, y, scale, pose, flip, delay, anim }]. Maks 6, minimal 1.
  x 160–920, y 1100–1280, scale 0.7–1, pose 'idle' | 'point' | 'hold'.
  flip: true membalik arah hadap. Jangan menaruh lebih dari 2 karakter
  berdekatan; biarkan auto-layout bila ragu.
- callouts: [{ text, x, y, dx, dy }]. Maks 4, text ≤ 40 karakter.
  (x,y) = titik di objek, chip digeser (dx,dy) dengan dx/dy -220..220.
  Satu callout per objek; jangan menunjuk teks judul.
- Urutan masuk diatur \`delay\`; beri jeda 0.15–0.25 dtk antar objek.
- Kamera scene dunia hanya menggerakkan dunia; teks dan subtitle tetap diam.
- Jangan memakai props/ground di tipe non-dunia, atau cast/callouts di luar
  adegan: validasi akan menolak.

## GAG (OPSIONAL, MAKSIMAL 3 UNTUK SELURUH VIDEO)
Letakkan di field gags (array). Jangan pakai di scene hook.
- { type: 'stamp', text: 'FAKTA', sub: 'terverifikasi' }
- { type: 'record-scratch' }
- { type: 'freeze-zoom', to: 1.05 }
- { type: 'timeline-corrected' }
- { type: 'receipt', title: 'TOTAL KERUGIAN', rows: [['Peta', '0']], total: '0' }
- { type: 'chat-bubble', name: 'Penonton', text: '...', side: 'left' }
Gag "receipt" dan "chat-bubble" menambah teks; jaga tetap pendek.

## BATAS TEKS (WAJIB, agar lolos audit safe area)
Area aman: x ${safe.left}–${safe.right}, y ${safe.top}–${safe.bottom} dari 1080×1920.
- kicker        ≤ 26 karakter
- title         ≤ 52 karakter (hook ≤ 46)
- subtitle      ≤ 60 karakter
- body          ≤ 220 karakter
- item.text     ≤ 70 karakter · item.year ≤ 6 karakter
- quote         ≤ 160 karakter · by ≤ 50 karakter
- stat.value    ≤ 6 karakter · unit ≤ 24 · label ≤ 110
- deadpan.text  ≤ 200 karakter · aside ≤ 80
- punchline.setup ≤ 110 karakter
- punchline.text  ≤ 28 karakter (huruf besar, singkat, datar)
- source        ≤ 70 karakter

## CONTOH BENTUK (jangan disalin isinya)
{
  id: 's01',
  type: 'hook',
  narasi: 'Pada 1511, Malaka jatuh ke tangan Portugis. Tapi catatan resminya lebih rapi daripada kenyataannya.',
  kicker: 'SEJARAH · EP 07',
  title: '40 HARI',
  subtitle: 'MALAKA · 1511',
}

{
  id: '${lastId}',
  type: 'punchline',
  narasi: 'Rencananya sempurna. Sayangnya, tidak ada yang membawa peta.',
  setup: 'Dan bagian yang paling masuk akal:',
  text: 'TIDAK ADA.',
  pause: 0.4,
  gags: [{ type: 'record-scratch' }],
}

{
  id: 's03',
  type: 'adegan',
  narasi: 'Pedagang menimbang cengkih, pelaut menawar dengan koin.',
  kicker: 'ADEGAN',
  title: 'Tawar-menawar di dermaga',
  body: 'Timbangan tidak pernah berbohong. Pedagangnya bisa.',
  ground: 'island',
  props: [
    { name: 'scale', x: 540, y: 1090, scale: 0.62, delay: 0.1 },
    { name: 'crate', x: 800, y: 1150, scale: 0.44, anim: 'drop', delay: 0.3 },
  ],
  cast: [
    { who: 'pedagang', x: 320, y: 1180, scale: 0.9, pose: 'point', delay: 0.2 },
    { who: 'pelaut', x: 760, y: 1190, scale: 0.9, pose: 'hold', flip: true, delay: 0.4 },
  ],
  callouts: [
    { text: 'Timbangan', x: 540, y: 1040, dx: 150, dy: -110 },
  ],
  camera: { from: { zoom: 1.02 }, to: { zoom: 1.08, x: -12 }, content: true },
}

## CHECKLIST SEBELUM MENJAWAB
1. Tepat ${scenes} scene, id berurutan, scene pertama hook, terakhir punchline.
2. Setiap scene punya narasi yang enak diucapkan dan nyambung dengan scene sebelumnya.
3. Tidak ada scene outro, tidak ada field duration, tidak ada markdown.
4. Semua teks layar di bawah batas karakter.
5. Total kata narasi mendekati ${totalWords}.
6. Scene dunia: nama prop/karakter dari daftar, adegan punya minimal 1 cast,
   callout ≤ 40 karakter, koordinat di rentang yang dianjurkan.
7. chapter.highlight harus bagian dari chapter.text.
8. Hanya kode JavaScript yang dikirim.
`;
}
