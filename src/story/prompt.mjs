import { SAFE, PUNCHLINE_PAUSE } from './storyboard.mjs';

const WPS = 2.4; // target kata/detik untuk narasi Bahasa Indonesia

const MID_TYPES = ['fact', 'timeline', 'stat', 'quote', 'deadpan'];

function suggestedTypes(count) {
  if (count <= 1) return ['punchline'];
  const types = ['hook'];
  for (let i = 1; i < count - 1; i++) types.push(MID_TYPES[(i - 1) % MID_TYPES.length]);
  types.push('punchline');
  return types;
}

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
    .map((p) => `  ${p.id}  ${p.type.padEnd(9)} ± ${p.seconds.toFixed(1)} dtk  ± ${p.words} kata`)
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
  style: 'sejarah/sepia-archive',
  brand: { watermark: 'LPTech' },
  scenes: [ ...tepat ${scenes} scene... ],
};

Tiap scene wajib punya: id, type, narasi.
- id berurutan: s01, s02, ... s${String(scenes).padStart(2, '0')}
- type hanya: hook, fact, timeline, quote, stat, deadpan, punchline
- narasi: teks yang DIUCAPKAN (1–3 kalimat). Boleh berbeda dari teks di layar.
- Teks layar ditulis singkat, padat, tanpa emoji.

## RENCANA SCENE YANG DISARANKAN
${planLines}

Aturan:
- Scene pertama WAJIB type "hook".
- Scene terakhir WAJIB type "punchline".
- Boleh mengubah tipe scene tengah, tetapi minimal ada 1 "fact".
- Total kata seluruh narasi mendekati ${totalWords} kata. Lebih baik sedikit pendek daripada kepanjangan.

## FIELD PER TIPE
- hook       : kicker, title, subtitle, source
- fact       : kicker, title, body, source
- timeline   : kicker, title, items: [{ year, text }] (maks 4), correction: { was, year, text } (opsional)
- quote      : quote, by
- stat       : kicker, value, unit, label, source
- deadpan    : kicker, text, aside (opsional)
- punchline  : setup, text, pause: ${PUNCHLINE_PAUSE}

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

## CHECKLIST SEBELUM MENJAWAB
1. Tepat ${scenes} scene, id berurutan, scene pertama hook, terakhir punchline.
2. Setiap scene punya narasi yang enak diucapkan dan nyambung dengan scene sebelumnya.
3. Tidak ada scene outro, tidak ada field duration, tidak ada markdown.
4. Semua teks layar di bawah batas karakter.
5. Total kata narasi mendekati ${totalWords}.
6. Hanya kode JavaScript yang dikirim.
`;
}
