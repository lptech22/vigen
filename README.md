# Vigen

**video generator by LPTech** — engine code-to-video untuk konten vertikal (1080×1920), dijalankan sepenuhnya di Termux Android.

> *Tulis naskah. Vigen bikin videonya.*

Status: **v0.6.0** — subtitle narasi (SRT/ASS), `preview`, `finish`, `qc`, `publish`, dan `make` idempoten, di atas storyboard 8 scene + 6 gag, audio deterministik, dan audit safe area.

---

## Kenapa Vigen

Konten pendek (sejarah, cerita, edukasi) butuh visual berulang dengan biaya produksi rendah. Vigen memisahkan tiga hal supaya bisa diskalakan:

| Lapisan | Isi | Siapa yang mengerjakan |
|---|---|---|
| **Konten** | `script.json`, `scene.js` | AI / penulis |
| **Mesin** | renderer, encoder, validasi | sekali tulis, dipakai selamanya |
| **Suara** | narasi per scene | kamu (ElevenLabs dll.) |

AI cukup menghasilkan data. Mesin tidak pernah menebak kreatif, sehingga gaya dan hasil antar episode konsisten.

## Kebutuhan

- Termux (Android)
- Node.js ≥ 20
- FFmpeg (dengan libx264)
- Chromium (headless)

```bash
pkg install nodejs ffmpeg chromium git
```

## Instalasi (lokal, sebelum rilis GitHub)

```bash
git clone https://github.com/lptech22/vigen ~/.vigen
ln -sf "$HOME/.vigen/bin/vigen.mjs" "$PREFIX/bin/vigen"
vigen doctor
```

Catatan: clone ke `~/.vigen` mensyaratkan folder itu belum ada. Kalau sudah ada, gunakan `git -C ~/.vigen pull` untuk memperbarui.

Engine sengaja disimpan di `~/.vigen` (tersembunyi dari file manager/Galeri Android) dan memakai filesystem cepat, bukan FUSE di `/storage`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `vigen doctor` | Periksa node, ffmpeg, chromium, font, storage, workspace, memori |
| `vigen setup` | Siapkan workspace `Vigen/` + `Konten 1` (idempoten, mengadopsi folder lama) |
| `vigen new "Konten 2"` | Buat project baru lengkap dengan template |
| `vigen prompt` | Wizard: judul, durasi, voice, scene → project + `prompt.txt` |
| `vigen voice "Konten 2"` | Ekstrak `narasi` dari `scene.js` → `voice.txt` |
| `vigen list` | Daftar project + status (`baru → naskah → siap render → selesai`) |
| `vigen timing "Konten 2"` | Hitung timeline dari durasi voice (atau estimasi kata/detik) |
| `vigen audio "Konten 2"` | Rangkai voice + musik + SFX, loudnorm, tulis `out/audio.wav` |
| `vigen audio "Konten 2" --mux` | Gabungkan audio ke video terbaru di `out/` |
| `vigen subs "Konten 2"` | Hitung subtitle dari `narasi`, tulis `out/subtitle.srt` + `.ass` |
| `vigen render "Konten 2"` | Render `scene.js` jadi video (+ audio + subtitle otomatis) |
| `vigen preview "Konten 2"` | Render draf cepat 540×960 CRF 30 untuk review |
| `vigen finish "Konten 2"` | Render final + subtitle + mux audio + QC |
| `vigen qc "Konten 2"` | Periksa codec, loudness, frame hitam, audio senyap, subtitle |
| `vigen publish "Konten 2"` | Siapkan `out/caption.txt` + `out/publish.json` |
| `vigen make "Konten 2"` | Pipeline idempoten: audio → subtitle → finish → QC → publish |
| `vigen check "Konten 2"` | Audit semua teks agar 100% di dalam safe area |
| `vigen still "Konten 2" --scene s03` | Render satu frame / satu scene jadi PNG |
| `vigen test` | Render video uji 5 detik + validasi otomatis |
| `vigen version` | Versi engine |

Contoh cepat:

```bash
vigen setup
vigen new "Konten 2"
vigen prompt
vigen prompt "Konten 3" --duration 45 --voices 1 --scenes 8 --yes
vigen voice "Konten 3"
vigen list

vigen timing "Konten 2"
vigen audio "Konten 2"
vigen audio "Konten 2" --mux
vigen subs "Konten 2"
vigen check "Konten 2"
vigen preview "Konten 2"              # draf 540x960
vigen finish "Konten 2"               # final 1080x1920 + QC
vigen qc "Konten 2"
vigen qc "Konten 2" --preview         # QC draf
vigen publish "Konten 2"              # caption + metadata
vigen make "Konten 2"                 # semua langkah, idempoten

vigen doctor
vigen still --at 2.5 --out ./frame.png
vigen still "Konten 2" --scene s03 --out ./s03.png
vigen test
vigen test --capture jpeg:0.95          # draf cepat
vigen test --chunk 50 --stop-at 60      # uji resume
vigen test --force --quiet              # render bersih tanpa progres
```

## Workspace

`vigen setup` membuat:

```
/storage/emulated/0/Vigen/
├─ .vigen-workspace.json     penanda + versi workspace
├─ .cache/                   sementara (diabaikan galeri)
├─ Konten 1/
│  ├─ vigen.project.json     nama, slug, niche, tone, format
│  ├─ brief.md               ide & arahan
│  ├─ script.json            naskah + niat visual
│  ├─ scene.js               timeline (ditulis AI)
│  ├─ tts/                   teks siap tempel ke ElevenLabs
│  ├─ voice/                 hasil suara (mp3/wav/m4a)
│  ├─ assets/  out/  .work/
└─ Konten 2/ ...
```

- Nama folder boleh ber-spasi; slug internal otomatis (`Konten 2` → `konten-2`).
- `setup` **tidak menimpa** file yang sudah ada dan mengadopsi folder lama jadi project.
- Bila storage belum diizinkan, workspace jatuh ke `~/Vigen` dengan peringatan jelas.
- Status project dihitung dari isi folder, bukan disimpan — tidak pernah basi.

## Audio

Voice dibuat di luar (ElevenLabs, dsb.), Vigen hanya merangkainya.

```bash
# 1. taruh hasil suara di voice/  → s01.mp3, s02.mp3, ...
# 2. opsional: assets/music.mp3 dan sfx.json
vigen timing "Konten 2"          # baca durasi asli, tulis .work/timeline.json
vigen audio "Konten 2"           # tulis out/audio.wav
vigen audio "Konten 2" --mux     # tulis <video>_audio.mp4
```

`sfx.json` (opsional, di root project):

```json
{
  "cues": [
    { "id": "whoosh", "at": 0.2, "volume": 0.5 },
    { "id": "boom", "at": 3.4 },
    { "id": "scratch", "at": 8.0 }
  ]
}
```

SFX yang tersedia: `whoosh`, `boom`, `scratch`, `pop`, `tick`. Semuanya dibuat prosedural dengan ffmpeg dan seed tetap, jadi tidak butuh file berlisensi dan hasilnya deterministik.

Perilaku penting:

- Mode `scenes`: `voice/s01.mp3 …`; urutan natural = urutan scene, jeda **0,35 dtk** (`--gap`).
- Mode `single`: satu file `voice/narasi.mp3`; durasi dibagi proporsional dari jumlah kata `narasi`, tanpa jeda buatan.
- Mode `blocks`: `voice/voice-1.mp3 …`; tiap blok dibagi proporsional, jeda hanya di antara blok.
- Bila `voice/` kosong, timeline memakai estimasi **2,4 kata/detik** dari `narasi` di `script.json` (`--wps`) supaya visual bisa disiapkan lebih dulu.
- Musik di-*ducking* **−9 dB** selama voice aktif, dengan ramp 60 ms masuk dan 250 ms keluar. Ducking dihitung dari timeline, bukan `sidechaincompress`, supaya hasilnya deterministik.
- `loudnorm` 2-pass ke **−14 LUFS**, ceiling true peak −1,5 dB, output 48 kHz stereo.
- `--mux` menyalin stream video apa adanya dan menambahkan AAC 192 kbps; audio dipad ke durasi video.
- `--no-retime` memakai `.work/timeline.json` yang sudah ada (mis. setelah cue SFX disesuaikan manual).

Hasil uji audio (project 3 scene, 7,800 dtk):

| Uji | Hasil |
|---|---|
| Offset voice vs timeline | **−1,2 ms** (target ≤ ±30 ms) |
| Loudness | **−13,9 LUFS** (target −14 ± 0,5) |
| Ducking saat voice | **9,1 dB** (target ≥ 6 dB) |
| SFX di luar cue | selisih **−180 dBFS** (benar-benar tidak bocor) |
| Reflow durasi | satu MP3 2,1 → 4,2 dtk, total 5,7 → 7,8 dtk, offset tetap |
| Determinisme | 3 build bersih → sha256 `513a23…b6c7` identik |
| Mux | 1080×1920 30fps H.264 + AAC 192k, 7,800 dtk |

## Subtitle, preview, QC, dan publikasi

Subtitle dibuat dari field `narasi` di `scene.js`, **bukan** dari Whisper. Tidak ada model tambahan, tidak ada API, dan hasilnya deterministik.

```bash
vigen subs "Konten 2"                 # out/subtitle.srt + out/subtitle.ass
vigen subs "Konten 2" --subs-max-chars 34
```

Aturan subtitle:

- dipotong per kalimat, lalu dibungkus maksimal **2 baris**;
- default **38 karakter** per baris (`subs.maxChars`);
- timing proporsional dari jumlah kata di dalam scene;
- scene `outro` dan scene tanpa `narasi` dilewati;
- subtitle juga digambar di canvas saat render, jadi video dan file SRT/ASS selalu sama.

Alur review dan final:

```bash
vigen preview "Konten 2"              # 540x960, CRF 30, jpeg:0.92
vigen preview "Konten 2" --force      # render ulang draf
vigen qc "Konten 2" --preview         # periksa draf (qc-preview.json)

vigen finish "Konten 2"               # final 1080x1920 + subtitle + audio + QC
vigen finish "Konten 2" --no-qc       # lewati QC
vigen finish "Konten 2" --no-audio    # final tanpa audio
vigen qc "Konten 2"                   # periksa final (qc.json)
vigen publish "Konten 2"              # out/caption.txt + out/publish.json
vigen publish "Konten 2" --strict     # gagal bila QC belum lulus
```

`finish` akan:

1. memakai `out/audio.wav` bila sudah sinkron;
2. membangun ulang audio bila voice berubah atau durasinya beda > 0,5 dtk;
3. render final `<slug>_1080x1920.mp4` + subtitle;
4. menjalankan QC;
5. menulis `out/finish.json` berisi hash video/audio dan status QC.

`publish` membaca `script.json` → `publish.judul`, `publish.deskripsi`, `publish.hashtag`, lalu menulis:

- `out/caption.txt` — siap copy-paste ke platform;
- `out/publish.json` — metadata + path video/subtitle + status QC.

Tidak ada upload otomatis. Semua tetap offline.

### `make` idempoten

Satu perintah untuk seluruh pipeline:

```bash
vigen make "Konten 2"
vigen make "Konten 2" --check          # audit safe area dulu
vigen make "Konten 2" --force          # paksa audio + render + QC
vigen make "Konten 2" --no-publish     # tanpa caption
vigen make "Konten 2" --no-qc          # tanpa QC
vigen make "Konten 2" --no-audio       # video tanpa audio
vigen make "Konten 2" --no-subs        # video tanpa subtitle
```

Fingerprint disimpan di `.work/make.json` (`scene.js`, voice, musik, SFX, config, timeline, hash audio/video). Bila tidak ada perubahan:

- audio tidak dibangun ulang;
- render tidak dijalankan ulang;
- QC memakai hasil sebelumnya;
- caption/metadata tetap ditulis ulang (murah).

`--no-audio` membuat QC memperlakukan audio sebagai nonaktif (bukan gagal), dan `renderKey` membedakan video beraudio dari video senyap supaya hasil lama tidak salah dipakai ulang.

Hasil uji v0.6.0 (project 4 scene + outro, 14,500 dtk):

| Uji | Hasil |
|---|---|
| `make` run 1 | audio built · render 435 frame · QC pass · publish written |
| `make` run 2–3 | audio skip · render skip · QC skip · publish written |
| Determinisme `--force` | sha256 video **identik** (`4d77feab…c808f08`) |
| Render PNG | 435 frame · **5,75 fps** · 75,7 dtk · 1,9 MB |
| Preview 540×960 | 435 frame · **26,14 fps** · 16,6 dtk |
| QC final | `-14,0 LUFS` · `-12,7 dBTP` · 0 frame hitam · 0 audio senyap |
| Subtitle | 5 potongan · maks **2 baris** · maks 37 karakter |
| Publish | `caption.txt` + `publish.json` · video 1080×1920 |

## Alur AI: prompt → scene.js → voice

Sejak v0.5.1, AI hanya perlu mengembalikan **satu file** (`scene.js`). Token lebih hemat dan tidak ada duplikasi teks.

```bash
vigen prompt
# Judul konten      : 40 Hari Malaka
# Durasi target (dtk): 45
# Jumlah voice      : 1
# Jumlah scene      : 8
```

Perintah itu:
- membuat project `Vigen/40 Hari Malaka/`
- menulis `prompt.txt` (siap tempel ke ChatGPT/Claude/Gemini)
- menyimpan parameter di `vigen.project.json` (`spec`, `audio.mode`)
- mencetak langkah berikutnya di Termux

Setelah AI menjawab:

```bash
# 1. simpan jawaban AI sebagai scene.js
# 2. tiap scene punya field narasi (teks yang diucapkan)
vigen voice "40 Hari Malaka"     # → voice.txt (gabungan semua narasi)
# 3. copy voice.txt ke ElevenLabs SEKALI → voice/narasi.mp3
vigen check "40 Hari Malaka"
vigen audio "40 Hari Malaka"
vigen preview "40 Hari Malaka"
vigen finish "40 Hari Malaka"
vigen qc "40 Hari Malaka"
vigen publish "40 Hari Malaka"

# atau satu perintah:
vigen make "40 Hari Malaka"
```

Mode audio yang didukung:

| Mode | File voice | Pembagian durasi |
|---|---|---|
| `single` (default) | `voice/narasi.mp3` | proporsional dari jumlah kata `narasi` tiap scene |
| `blocks` | `voice/voice-1.mp3 …` | per blok scene, proporsional; jeda 0,35 dtk antar blok |
| `scenes` (lama) | `voice/s01.mp3 …` | presisi penuh, satu file per scene |

Catatan:
- `vigen prompt` **tidak** memanggil API AI; semua offline, kamu yang copy-paste.
- Default: 45 dtk, 8 scene, 1 voice. Bisa diubah lewat pertanyaan atau flag `--duration/--voices/--scenes`.
- `vigen voice` memakai `narasi`, bukan teks layar. Teks layar tetap yang tampil di video.
- Satu audio = paling praktis; sinkronisasi antar scene mengikuti porsi kata. Butuh presisi? pakai mode `scenes`.
- `vigen voice --voices 2` menulis `tts/voice-1.txt` dan `tts/voice-2.txt` untuk mode blok.

Hasil uji v0.5.1:

| Uji | Hasil |
|---|---|
| `prompt.txt` | 110 baris · 687 kata · parameter terkunci |
| 1 audio 10,500 dtk / 4 scene | split 3,122 · 2,554 · 2,554 · 2,270 dtk |
| Voice bus | 10,500 dtk (audio tidak terduplikasi) |
| 2 blok | total 9,350 dtk · jeda 0,350 dtk di antara blok |
| Render | 360 frame · 12,000 dtk · AAC 48 kHz stereo |
| Determinisme | render `--force` → sha256 identik |
| Audit | 1.412 kotak teks · 0 pelanggaran |

## Storyboard & humor

Satu file `scene.js` adalah sumber kebenaran visual. AI menulis data deklaratif; mesin tidak menebak kreatif.

```js
export default {
  schema: 1,
  style: 'sejarah/sepia-archive',
  brand: { watermark: 'LPTech' },
  scenes: [
    { id: 's01', type: 'hook', kicker: 'SEJARAH · EP 07', title: '40 HARI', subtitle: 'MALAKA · 1511' },
    { id: 's02', type: 'fact', kicker: 'FAKTA', title: 'Kenapa 40 hari?', body: 'Karena logistik, bukan takhayul.', source: 'sumber: arsip' },
    { id: 's03', type: 'punchline', setup: 'Dan bagian yang paling masuk akal:', text: 'TIDAK ADA.', pause: 0.4,
      gags: [
        { type: 'record-scratch', at: 0.1 },
        { type: 'receipt', at: 0.9, title: 'TOTAL KERUGIAN', rows: [['Peta', '0']], total: '0' },
      ] },
  ],
};
```

**Tipe scene** (field yang dipakai):

| Tipe | Isi |
|---|---|
| `hook` | `kicker`, `title`, `subtitle`, `source` |
| `fact` | `kicker`, `title`, `body`, `source` |
| `timeline` | `items: [{ year, text }]`, `correction: { was, year, text }` |
| `quote` | `quote` (atau `text`), `by` |
| `stat` | `value`, `unit`, `label`, `source` |
| `deadpan` | `text` (atau `body`), `aside` |
| `punchline` | `setup`, `text` (atau `title`), `pause` |
| `outro` | otomatis: brand, tagline, niche |

**Gag** (boleh satu objek atau array di `gags`):

| Gag | Opsi |
|---|---|
| `stamp` | `text`, `sub`, `pos` (`top`/`center`/`bottom`), `x`, `y`, `rotate` |
| `freeze-zoom` | `at`, `to` (skala akhir, default 1,08) |
| `record-scratch` | `at`, `x`, `y` (default pita atas kanan) |
| `timeline-corrected` | `at`, `text`, `sub` |
| `receipt` | `at`, `title`, `rows: [[label, nilai]]`, `total` |
| `chat-bubble` | `at`, `name`, `text`, `side` (`left`/`right`) |

Aturan penting:

- `id` scene sebaiknya sama dengan nama file voice (tanpa ekstensi). Bila tidak ada yang cocok, urutan index dipakai dengan peringatan; bila sebagian cocok dan sebagian tidak, render ditolak.
- `duration` opsional; tanpa voice, tiap tipe punya durasi default. Scene terakhir otomatis ditambah outro 1,5 dtk bila belum ada.
- Safe area teks: **x 84–996, y 210–1580**. Watermark dan progress bar di luar area audit.
- `punchline` menahan teks dan gag-nya selama jeda `0,4` dtk supaya terasa deadpan.
- Tata letak gag sadar teks: struk selalu jadi lower-third, vinyl di pita atas, chat bubble naik menghindari `aside`.
- `vigen check` mengaudit bounding box setiap elemen teks di setiap frame; `vigen render` membatalkan diri pada frame pertama yang melanggar dan menyebut id elemennya.

Hasil uji visual (8 scene, semua tipe + 6 gag):

| Uji | Hasil |
|---|---|
| Durasi / frame | 13,900 dtk · 417 frame |
| Audit teks | 2.080 kotak teks, **0 pelanggaran** |
| Render | 417/417 frame · 5,7 fps · 74 dtk · 2,1 MB |
| Determinisme | render ulang `--force` → sha256 **identik** |
| Overflow sengaja | `check` exit 1 (`bawah 2161px`), `render` berhenti di frame 4 |
| Audio + mux | 3 scene voice 4,900 dtk + outro → 6,400 dtk, AAC 48 kHz stereo |

## Hasil uji di perangkat (Termux, 4 core, Android)

| Metrik | Hasil (v0.5.0, PNG) |
|---|---|
| Throughput | **5,7 fps** |
| ms/frame | 176 |
| Ukuran frame | ~2,0 MB (tekstur arsip + debu) |
| Estimasi video 60 dtk | ±5 m 30 s |
| Kualitas | master, lossless |

JPEG tetap tersedia untuk draf cepat: `--capture jpeg:0.95`.

Validasi yang lulus:

- 417 frame untuk 13,900 detik — **0 frame selisih**, durasi tepat
- H.264, `yuv420p`, 1080×1920
- 2.080 kotak teks diaudit per frame, **semua di dalam safe area**
- render ulang `--force` → **sha256 identik** (`c869fe2c…86bd7`)
- resume memakai `storyHash`; cerita berubah → segmen lama otomatis dibuang
- mux audio 48 kHz stereo, loudness −14,0 LUFS, video di-copy

## Cara kerja render

```
scene.js + voice/.work/timeline.json
        │
        ▼
storyboard  ── start/end per scene, safe area, gag
        │
        ▼
Chromium headless  ── canvas 2D, semua animasi = f(t)
        │
        │  POST /frame (biner, localhost)
        ▼
Node host  ──►  ffmpeg (image2pipe)  ──►  segmen mp4
        │                                      │
        └── state.json (resume)                ▼
                                        concat → mp4 final
```

Keputusan penting: frame **tidak** dikirim lewat CDP sebagai base64 (mahal), melainkan `POST` biner ke server lokal di Node. Ini menaikkan throughput dari 2,4 fps menjadi 5,1 fps pada konten yang sama.

## Struktur

```
~/.vigen/
├─ bin/vigen.mjs           launcher CLI
├─ src/
│  ├─ cli/                 doctor, setup, new, prompt, voice, list, timing, audio, subs, render, preview, finish, qc, publish, make, check, still, test
│  ├─ core/                config, util, workspace, media (pemilih video + hash)
│  ├─ story/               storyboard, prompt builder, narration, prepare, subs
│  ├─ render/              browser (CDP), host, render, encode
│  ├─ audio/               timeline, mix (ducking + loudnorm), sfx, probe
│  └─ runtime/stage.html   kanvas, 8 scene + 6 gag, subtitle, audit safe area
├─ tools/                  utilitas dev (bench, snap)
├─ docs/                   JOURNAL.md, ROADMAP.md
└─ test/
```

## Roadmap

| Versi | Status |
|---|---|
| v0.1.0 — fondasi (doctor, still, Chromium) | ✅ selesai |
| v0.2.0 — render, resume, validasi, determinisme | ✅ selesai |
| v0.3.0 — workspace (`setup`, `new`, `list`) | ✅ selesai |
| v0.4.0 — audio (voice, ducking, loudnorm, SFX) | ✅ selesai |
| v0.5.0 — storyboard, sepia-archive, 8 scene, 6 gag, safe-area QC | ✅ selesai |
| v0.5.1 — prompt AI + voice sekali generate (1 audio) | ✅ selesai |
| v0.6.0 — subtitle, preview, finish, QC, publish, make idempoten | ✅ selesai |
| v1.0.0 — distribusi GitHub + npm | rencana |

Detail: [`docs/ROADMAP.md`](docs/ROADMAP.md) · Catatan pengembangan: [`docs/JOURNAL.md`](docs/JOURNAL.md)

## Lisensi

MIT © LPTech
