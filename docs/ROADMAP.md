# Roadmap Vigen

Rencana berbasis versi. Aturan main: versi berikutnya tidak dimulai sebelum DoD versi sebelumnya lulus **3 kali berturut-turut**.

| Versi | Tahap | Status |
|---|---|---|
| v0.1.0 | Fondasi | ✅ selesai |
| v0.2.0 | Render inti | ✅ selesai |
| v0.3.0 | Workspace | ✅ selesai |
| v0.4.0 | Audio | ✅ selesai |
| v0.5.0 | Visual & humor | ✅ selesai |
| v0.5.1 | Prompt AI & voice | ✅ selesai |
| v0.6.0 | Publikasi & QC | ✅ selesai |
| v0.7.0 | Diorama bercerita | ✅ selesai |
| v0.8.0 | Web UI lokal | ✅ selesai |
| v1.0.0 | Distribusi | rencana |

---

## v0.1.0 — Fondasi ✅

**Deliverable:** config, `doctor`, `still`, launcher, runtime `stage.html`, klien CDP tanpa dependensi.

**DoD tercapai:**
- `doctor` memeriksa node, ffmpeg (+libx264/libass), ffprobe, chromium, font, storage, temp, memori.
- `still` menghasilkan PNG 1080×1920 yang benar.
- Chromium dijalankan sekali per perintah.

## v0.2.0 — Render inti ✅

**Deliverable:** timeline `f(t)`, host HTTP lokal, encoder ffmpeg, segmen + resume, validasi otomatis, metrik.

**DoD tercapai:**
- 150 frame / 5,000 dtk, H.264, `yuv420p`, 1080×1920 — 0 selisih frame.
- Determinisme: 2 render terpisah → sha256 video identik, hash frame identik.
- Resume: henti di frame 60 → lanjut → tetap 150 frame / 5,000 dtk.
- Throughput 5,1 fps (PNG) / 7,9 fps (JPEG q0,95).
- Warna: `-color_range tv` memastikan `yuv420p` (bukan `yuvj420p`).

**Keputusan teknis penting:** frame dikirim sebagai biner via `POST /frame` ke host lokal, bukan base64 lewat CDP. Throughput naik 2,4 → 5,1 fps.

## v0.3.0 — Workspace ✅

**Deliverable:** `setup`, `new`, `list`, marker workspace, project metadata, adopsi folder lama, fallback storage.

**DoD tercapai:**
- `setup` pada folder yang sudah berisi `Konten 1` → **diadopsi**, file lama tidak ditimpa.
- `setup` dijalankan ulang → idempoten (`aktif`, tidak ada data hilang).
- `new "Konten 2"` membuat struktur lengkap; nama duplikat ditolak dengan exit code 1.
- `list` mendeteksi transisi status: `baru` → `naskah` → `siap render` → `selesai`.
- Fallback diuji: workspace tidak bisa ditulis (EACCES) → pindah ke `~/Vigen` + config diperbarui + peringatan.
- `list --json` tersedia untuk otomasi.

## v0.4.0 — Audio ✅

**Deliverable:** `timing`, `audio`, timeline dari durasi voice, ducking musik, SFX prosedural, `loudnorm` 2-pass, mux.

**DoD tercapai:**
- Offset voice vs timeline **−1,2 ms** (target ≤ ±30 ms), diukur pada voice bus 3 scene.
- Loudness **−13,9 / −14,0 LUFS** (target −14 ± 0,5); parser loudness diperbaiki agar membaca hasil akhir, bukan baris progres pertama.
- Ducking **9,1 dB** saat voice aktif (target ≥ 6 dB); level musik di jeda kembali dalam 0,23 dB.
- SFX tepat waktu: selisih sinyal pada cue −33,0 / −28,6 / −30,1 dBFS, di luar cue **−180 dBFS** (identik).
- Reflow durasi: satu MP3 2,1 → 4,2 dtk memindahkan scene berikutnya, total 5,7 → 7,8 dtk, offset tetap −1,2 ms.
- Determinisme: 3 build bersih berturut-turut menghasilkan sha256 audio identik.
- Mux: H.264 video di-copy + AAC 192 kbps, durasi 7,800 dtk, deterministik.
- Estimasi 2,4 kata/detik berfungsi saat `voice/` kosong; `--no-retime` menghormati timeline tersimpan.
- Error path: project tidak ada, voice kosong, dan ID SFX tidak dikenal → pesan jelas + exit code 1.

**Keputusan teknis penting:** `sidechaincompress` di ffmpeg 9.0.2 menghasilkan durasi output yang berubah-ubah antar run (7,68 / 7,765 / 7,8 dtk) walau input identik, sehingga determinisme gagal. Ducking diganti envelope `volume` berbasis timeline: tetap halus (60 ms masuk, 250 ms keluar), tetapi sepenuhnya deterministik dan tidak bergantung level voice.

## v0.5.0 — Visual & humor ✅

**Deliverable:** storyboard `scene.js` (8 tipe scene), style `sejarah/sepia-archive`, 6 gag, audit safe area per frame, perintah `render` dan `check`.

**DoD tercapai:**
- Storyboard uji 8 scene (semua tipe) + 6 gag → **417 frame / 13,900 dtk**, tanpa error.
- Audit per frame: **2.080 kotak teks, 0 keluar safe area** (x 84–996, y 210–1580).
- Render ulang `--force`: **sha256 identik** `c869fe2c…86bd7`, 417/417 frame, 5,7 fps PNG (176 ms/frame).
- Overflow sengaja: `check` exit 1 dengan id elemen + `bawah 2161px`; `render` berhenti di frame 4 dengan pesan yang sama.
- Template `vigen new` lolos `check`; alur audio 3 scene (voice 4,900 dtk + outro) → 6,400 dtk dengan AAC 48 kHz stereo.
- Watermark + outro 1,5 dtk otomatis; punchline menahan teks/gag 0,4 dtk.

**Keputusan teknis penting:**
- Audit memakai bounding box setiap `drawBlock`, ditransformasi ke koordinat kanvas; teks dengan alpha 0 tidak dihitung.
- Gag sadar tata letak lewat `layout.textBottom` / `layout.asideTop`: struk jadi lower-third, vinyl di pita atas, chat bubble naik menghindari `aside`. Semua tetap `f(t)`, jadi deterministik.
- `storyHash` masuk meta resume supaya perubahan storyboard membatalkan segmen lama.
- Ditemukan saat uji audio: `findByTimeline` memakai `tl.totalDuration` (array scene) → `end` scene terakhir `NaN` dan scene tidak pernah digambar. Diperbaiki ke `timeline.totalDuration` + penjaga rentang waktu.

## v0.5.1 — Prompt AI & voice sekali generate ✅

**Deliverable:** `vigen prompt` (wizard + `prompt.txt`), `vigen voice` (narasi → `voice.txt`), timeline mode `single`/`blocks`, field `narasi` per scene.

**DoD tercapai:**
- `vigen prompt` interaktif (judul, durasi, voice, scene) dan non-interaktif (`--duration/--voices/--scenes/--yes`); project + `prompt.txt` 110 baris / 687 kata.
- AI hanya menghasilkan `scene.js`; `vigen voice` mengekstrak narasi → `voice.txt`.
- 1 audio 10,500 dtk / 4 scene → split proporsional **3,122 / 2,554 / 2,554 / 2,270 dtk**; voice bus tetap 10,500 dtk (tidak terduplikasi).
- Mode 2 blok: total 9,350 dtk, jeda 0,350 dtk hanya di antara blok.
- Render 360 frame / 12,000 dtk + AAC 48 kHz stereo; render `--force` sha256 identik; audit 1.412 kotak teks, 0 pelanggaran.
- Mode `scenes` lama tetap berjalan.

**Keputusan teknis penting:**
- `narasi` disimpan di `scene.js`, bukan file terpisah, supaya AI hanya mengembalikan satu file dan tidak ada duplikasi teks.
- Durasi single mode memakai bobot kata; `groups` di timeline memastikan audio utuh hanya ditempel sekali, bukan sekali per scene.
- `vigen voice` dan timeline memakai pembagi blok yang sama (`splitByWords`), jadi teks TTS dan pembagian scene selalu konsisten.
- Prompt sepenuhnya offline (tanpa API berbayar); pengguna copy-paste ke AI.

## v0.6.0 — Publikasi & QC ✅

**Deliverable:** subtitle narasi (SRT/ASS), `subs`, `preview`, `finish`, `qc`, `publish`, `make` idempoten.

**DoD tercapai:**
- Subtitle dari `narasi` (bukan Whisper): 5 potongan, **maks 2 baris**, maks 37 karakter, ditulis ke `out/subtitle.srt` + `.ass` dan digambar di canvas.
- `preview` 540×960 CRF 30: 435 frame / 14,500 dtk, **26,14 fps** (16,6 dtk), QC draf lulus dan tersimpan terpisah di `out/qc-preview.json`.
- `finish` menjalankan audio sinkron → render final 1080×1920 + subtitle → QC → `out/finish.json`.
- `qc` memeriksa codec, pixel format, resolusi, fps, durasi, loudness, true peak, frame hitam, audio senyap, dan subtitle. Final: **−14,0 LUFS**, **−12,7 dBTP**, 0 frame hitam, 0 audio senyap.
- `publish` menulis `out/caption.txt` + `out/publish.json` dari `script.json` (`judul`, `deskripsi`, `hashtag`), tanpa upload otomatis.
- `make` **idempoten**: run 1 audio built + render 435 frame + QC pass + publish; run 2–3 audio/render/QC skip; `--force` menghasilkan sha256 video **identik** (`4d77feab…c808f08`).
- Render final PNG: 435 frame, **5,75 fps**, 75,7 dtk, 1,9 MB; QC lulus.

**Keputusan teknis penting:**
- Subtitle dihitung dari kata di `scene.js`, jadi tidak butuh model tambahan dan selalu deterministik. Waktu dibagi proporsional per kata di dalam scene.
- Subtitle digambar langsung di canvas, bukan filter `subtitles` ffmpeg, supaya posisi, ukuran font, dan safe area sama dengan audit teks lain.
- QC draf menulis `qc-preview.json`, bukan `qc.json`, supaya hasil draf tidak dianggap sebagai QC final saat `publish`.
- `make` memakai `.work/make.json` berisi fingerprint input dan output. Fingerprint timeline **mengabaikan `createdAt`**, karena timeline dihitung ulang setiap perintah; tanpa itu `make` akan membangun ulang audio terus-menerus.
- `make` dan `finish` berhenti lebih awal bila `voice/` kosong dan `out/audio.wav` belum ada, dengan saran memakai `--no-audio`; ini menghemat render yang pasti gagal QC.

## v0.7.0 — Diorama bercerita ✅

Dirilis 20 November 2026.

Tujuan: video tidak lagi kartu teks statis. Adopsi bahasa visual referensi
(diorama isometrik, kamera sinematik, objek beranimasi, karakter minimal,
header bab) dengan topik sejarah.

| Tahap | Isi | Status |
|---|---|---|
| 0 | Benchmark diorama (prop + karakter + kamera) | ✅ 4,0 fps PNG / 5,7 fps JPEG |
| 1 | Style `sejarah/diorama` + header bab + font sans | ✅ selesai |
| 2 | Kamera virtual (pan/zoom/rotate, keyframe) | ✅ selesai |
| 3 | Prop library vektor isometrik | ✅ selesai (12 prop) |
| 4 | Tipe scene `diorama` (dunia + kamera + prop) | ✅ selesai |
| 5 | Tipe scene `adegan` (aksi objek + callout + karakter) | ✅ selesai |
| 6 | Subtitle karaoke per kata | ✅ selesai |
| 7 | Prompt builder + validasi + audit | ✅ selesai |
| 8 | Video uji sejarah 30–45 dtk + determinisme + QC | ✅ 40,8 dtk · 1223 frame · QC lulus |

**Keputusan tahap 1:**
- Dua style: `sejarah/sepia-archive` (lama, default untuk scene.js tanpa style)
  dan `sejarah/diorama` (default project baru via template/prompt).
- Header bab memakai field `chapter: { text, highlight }`; bertahan sampai scene
  berikutnya mengganti, dan hilang otomatis di outro. Posisi y=210 (opsi B).
- Konten scene lama digeser 48px saat header aktif agar tidak bertumpuk.
- Font display diorama memakai sans (VigenUI), bukan serif.

**Keputusan tahap 3:**
- Prop tinggal di `src/runtime/props.js` sebagai script klasik (`window.VigenProps`),
  bukan ES module, supaya tetap termuat saat `stage.html` dibuka via `file://`
  (`vigen still` / `vigen check`).
- 12 prop awal: map, book, scroll, ship, coins, scale, lantern, crate, spice,
  compass, fort, flag. Semua vektor 2D dengan proyeksi isometrik (`isoBox`,
  `boxFaces`, `shadow`), tanpa Math.random.
- Animasi prop hanya fungsi `t` lokal (ombak kapal, nyala lentera, jarum
  timbangan) agar render tetap deterministik.
- Host menyajikan `/props.js` dari `src/render/host.mjs`; alat preview
  `tools/props-sheet.mjs` merender semua prop ke satu PNG.

**Keputusan tahap 4:**
- Scene `diorama` = alas isometrik (`ground`: `island` | `table` | `none`) +
  prop + teks di atasnya. Alas digambar lebih dulu, teks selalu di atas.
- Koordinat prop memakai px layar, lalu diproyeksikan ke permukaan alas
  (`plateLocal` → `plateProject`) dan dijepit ke tepi, jadi prop tidak pernah
  melayang. Tanpa `x`/`y`, prop disusun otomatis di atas alas.
- Kamera scene diorama hanya menggerakkan lapisan dunia; teks, header, dan
  subtitle tetap diam. `content` default `true` untuk diorama (kebalikan scene
  lain) agar penulis tidak perlu menuliskannya.
- Latar halaman ikut kamera hanya bila `content` true, supaya dunia dan latar
  bergerak sebagai satu kesatuan.
- Nama prop divalidasi saat boot runtime (`window.VigenProps.has`); nama salah
  langsung gagal dengan daftar pilihan, bukan hilang diam-diam.
- Kedalaman digambar dengan mengurutkan prop berdasarkan `y` (makin besar makin
  depan), sehingga tumpang tindih terlihat benar.
- Permukaan alas diberi cahaya lembut dan butir tanah memakai `mulberry32`
  dengan seed tetap, jadi tekstur tetap deterministik.

**Keputusan tahap 5:**
- Scene `adegan` memakai alas + prop yang sama dengan `diorama`, ditambah
  `cast` (karakter) dan `callouts` (label penunjuk).
- Karakter tinggal di `src/runtime/cast.js` (`window.VigenCast`), script klasik
  seperti props.js. 5 peran: pedagang, pelaut, serdadu, raja, petani.
- Gaya "stylized": vektor berbayang, tanpa wajah realistis dan tanpa 3D —
  cukup ringan untuk render di tablet.
- Pose `idle` / `point` / `hold`; `flip` membalik arah hadap. Gerak hanya
  f(t): napas, goyangan badan, langkah kecil.
- Animasi masuk objek: `pop` (default), `drop`, `slide`, `rise`. Semua
  dihitung dari `delay` + `t`, bukan timer.
- Posisi otomatis dipisah: prop di baris belakang (`v=-0.35`), karakter di
  baris depan (`v=0.40`), lalu diurutkan berdasarkan `y` untuk kedalaman.
- Callout digambar di dalam transform kamera agar menempel ke objek, tetapi
  posisinya dijepit memakai kebalikan transform (`localSafeRect`) sehingga
  chip tetap di dalam safe area walau kamera zoom.
- Nama karakter divalidasi saat boot seperti prop; nama salah langsung gagal.
- Kecepatan: scene adegan penuh (4 prop + 2 karakter + 2 callout + kamera)
  ≈ 4,3 fps PNG 1080×1920 — masih di level benchmark (4,0 fps).

**Keputusan tahap 6:**
- Setiap cue subtitle menyimpan `wordTimes: [{ text, start, end }]`. Waktunya
  dibagi rata di dalam cue, setara dengan porsi global `wiStart..wiEnd`,
  sehingga total tetap sama dengan durasi narasi dan tidak ada kata yang
  tumpang tindih.
- Runtime mewarnai kata per kata: sudah diucapkan = `subInk`, sedang diucapkan
  = `subActive` (emas di sepia, merah di diorama), belum = `subInkFaint`.
- Posisi kata dihitung dari `block.lines` yang sudah ada, jadi pembungkusan
  baris, ukuran font, latar chip, dan audit safe area tidak berubah.
- Bila `wordTimes` tidak ada atau jumlahnya tidak cocok dengan jumlah kata,
  runtime kembali ke penggambaran biasa (kompatibel dengan storyboard lama).
- SRT/ASS tidak terpengaruh: keduanya tetap memakai `lines`.

**Keputusan tahap 7:**
- Prompt menyarankan `diorama`/`adegan` sejak rencana scene (bukan hanya di
  catatan), lengkap dengan saran visual per tipe. Untuk 3 scene, dunia tetap
  opsional; 4 scene ke atas minimal 1 scene dunia.
- Prompt memuat aturan scene dunia yang sama dengan validator: daftar prop/
  karakter, batas 12 prop / 6 cast / 4 callout, rentang koordinat, `delay`,
  `anim`, dan larangan menaruh field dunia di tipe yang salah.
- Validasi baru: `adegan` wajib minimal 1 cast; `cast`/`callouts` hanya di
  `adegan`; `props`/`ground` hanya di `diorama`/`adegan`; teks callout ≤ 40
  karakter; `chapter` divalidasi (text ≤ 70, highlight harus bagian dari text,
  `false` untuk menghapus).
- `vigen check` menampilkan ringkasan scene dunia (jumlah scene, prop, cast,
  callout) dan memeriksa `wordTimes` (jumlah kata, urutan, rentang cue) di
  samping batas 2 baris subtitle.
- `vigen check --json` sekarang mengeluarkan JSON murni (tanpa baris info),
  dengan field tambahan `world` dan `validation`.

**Keputusan tahap 8:**
- Video uji memakai topik “Kenapa rempah Nusantara diperebutkan?” dengan
  style `sejarah/diorama`, 3 scene dunia (2 diorama + 1 adegan), 15 subtitle.
- Narasi 75 kata, voice uji awal edge-tts `id-ID-GadisNeural` 42,6 dtk, lalu
  diganti voice final 39,3 dtk; total video 40,8 dtk termasuk outro — masuk
  target 30–45 dtk.
- QC final: H.264 yuv420p 1080×1920 30 fps, 1223 frame, **−14,0 LUFS**,
  −1,4 dBTP, 0 frame hitam, 0 audio senyap, subtitle maks 2 baris/38 karakter.
- `make --force` tiga kali menghasilkan sha256 identik
  (`c5a604f7…b6c681f`); `qc.json` dan `publish.json` menunjuk video yang sama.
- `vigen check` 1223 frame: 7.606 kotak teks, 0 pelanggaran safe area.
- Voice final sudah dipasang (menggantikan voice uji cloud); `make --force`
  dijalankan ulang dan QC tetap lulus.

## v0.8.0 — Web UI lokal ✅

Dirilis 20 November 2026.

Tujuan: pengguna bisa melihat project, menjalankan pipeline, mengedit
storyboard, dan memeriksa hasil dari browser HP tanpa menghafal perintah.

| Tahap | Isi | Status |
|---|---|---|
| 1 | `vigen ui`, server + token, daftar project + status | ✅ selesai |
| 2 | Job serial + SSE + aksi + progres frame + batal | ✅ selesai |
| 3 | Editor file + `.bak`, pemutar video Range, QC, caption | ✅ selesai |

**Keputusan:**
- Job dijalankan sebagai proses anak dengan process group sendiri. Batal =
  SIGTERM lalu SIGKILL, sekaligus mematikan Chromium/ffmpeg. Hasil identik
  dengan CLI karena menjalankan launcher yang sama.
- Token acak per sesi (`crypto.randomBytes(16)`) lewat cookie HttpOnly
  SameSite=Strict; `Authorization: Bearer` untuk curl. Bind `127.0.0.1` saja.
- Tanpa dependensi dan tanpa build step: HTML/CSS/JS klasik dari
  `src/web/public`, disajikan `node:http`.
- Editor hanya untuk 4 file (`scene.js`, `script.json`, `sfx.json`,
  `brief.md`); JSON divalidasi sebelum ditulis, file lama disalin ke `.bak`.
- Aset hanya boleh dari `out/` dan `voice/`; video memakai `Range` agar bisa
  di-seek.

**DoD tercapai:**
- `vigen ui` di Termux: 6 project, filter + pencarian, panel 3 tab.
- QC via UI: 13 pemeriksaan, `qc.json` tertulis. `make` idempoten: sha256
  `c5a604f7…` tetap sama sebelum dan sesudah.
- SSE mengirim snapshot + log + progres; batal saat render berhenti < 1 dtk;
  antrean maks 3 dan bisa dibatalkan; server ditutup → 0 proses tersisa.
- `Range: bytes=0-99` → 206; `out/../scene.js` → 400; PUT `../../config.json`
  → 400; tanpa token → 401.
- `vigen doctor`, `vigen list`, `vigen test` (150/150) tetap lulus;
  `package.json` tetap tanpa dependensi.

## v1.0.0 — Distribusi

- `install.sh` Termux, docs, LICENSE, CHANGELOG
- repo `github.com/lptech22/vigen` publik (MIT)
- tag + GitHub Release
- uji instalasi di Termux bersih

**DoD:** clone → install → `doctor` → `test` berhasil tanpa langkah manual selain izin storage.
