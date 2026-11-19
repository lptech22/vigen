# Jurnal Pengembangan Vigen

Catatan kronologis: keputusan, masalah, dan angka nyata. Ditulis apa adanya supaya keputusan bisa dipertanggungjawabkan.

Perangkat uji: Termux Android · 4 core · 5,5 GB RAM · Node 26.13.1 · FFmpeg 9.0.2 · Chromium 157.0.8103.78

---

## 19 Nov 2026 — Sesi 1: fondasi & render inti

### 09:05 — Scaffold v0.1.0

Struktur dibuat tanpa dependensi npm sama sekali. Keputusan: **tidak memakai Puppeteer**.

Alasan:
- Puppeteer mengunduh Chromium (~300 MB) yang tidak perlu — Chromium Termux sudah ada.
- Node 26 punya `WebSocket` global, jadi klien CDP bisa ditulis ±120 baris.
- `npm install` di Termux rawan gagal; tanpa dependensi, instalasi = salin folder + symlink.

Hasil: `bin/vigen.mjs`, `src/cli/*`, `src/core/*`, `src/render/cdp.mjs`, `src/runtime/stage.html`.

### 09:07 — `vigen doctor` pertama

Semua hijau. Catatan lingkungan:

| Item | Nilai |
|---|---|
| node | v26.13.1 |
| ffmpeg | 9.0.2 · libx264 · libass |
| chromium | 157.0.8103.78 |
| fontconfig | tidak ada |
| font | DejaVuSerif-Bold & DejaVuSans di `$PREFIX/share/fonts/TTF` |
| memori tersedia | ~1,4 GB |

Konsekuensi fontconfig tidak ada: font harus disuntik ke halaman sebagai `@font-face` data URL dari Node. Ini juga membuat render **tidak bergantung font sistem** — hasil sama di perangkat lain.

Bug kecil: petunjuk perbaikan muncul walau status ✓. Diperbaiki (`status !== 'ok'`).

### 09:08 — Frame pertama

`vigen still --at 2.5` → PNG 1080×1920, 1,3 MB, 420 ms.

Masalah: 420 ms/frame → hanya ~2,4 fps. Ini di bawah target 4 fps.

### 09:09 — Render penuh pertama (v0.2.0 awal)

`vigen test` 150 frame → validasi lulus semua (150 frame, 5,000 dtk, h264, yuv420p), tetapi **2,36 fps**, total 63,5 dtk.

Temuan tambahan: rumus estimasi 60 detik salah (memakai 60 frame, bukan 1800 frame). Diperbaiki.

### 09:10 — Profiling: di mana waktunya habis

Frame dikirim sebagai PNG base64 lewat `Runtime.evaluate`. Diukur terpisah:

| Jalur | Waktu | Ukuran | fps |
|---|---|---|---|
| Encode PNG di dalam page | 89 ms | 1,8 MB | — |
| PNG `toDataURL` (CDP base64) | 465 ms | 1,8 MB | 2,2 |
| JPEG q95 (CDP base64) | 151 ms | 138 KB | 6,6 |
| WebP q0,9 (CDP base64) | 326 ms | 23 KB | 3,1 |
| evaluate kosong (overhead) | 7 ms | — | — |

Kesimpulan: **encode PNG hanya 89 ms; 376 ms sisanya habis di base64 + transfer CDP.**

### 09:12 — Perubahan arsitektur: POST biner ke host lokal

Daripada mengirim base64 lewat CDP, halaman mengirim frame sebagai `Blob` ke `POST http://127.0.0.1:<port>/frame`. Node menerima biner, lalu menulis ke stdin ffmpeg dengan backpressure.

Kendala awal: `fetch` dari `file://` ke `http://127.0.0.1` diblokir (CORS/origin). Solusi: `stage.html` **disajikan oleh host yang sama** (same-origin), bukan dibuka sebagai file.

Hasil pengukuran ulang:

| Jalur | ms/frame | fps |
|---|---|---|
| POST raw RGBA (8,1 MB) | 192 | 5,2 |
| POST PNG (1,1 MB) | 172 | 5,8 |
| POST JPEG q92 (53 KB) | 113 | 8,9 |
| POST WebP q92 (19 KB) | 438 | 2,3 |

Catatan: WebP justru lambat — encoder WebP Chromium menghabiskan ~400 ms; ukuran kecil tidak menolong.

### 09:15 — Render terintegrasi

Dengan PNG sebagai default:

- **5,14 fps**, 195 ms/frame, 150 frame dalam 29,2 dtk
- estimasi video 60 dtk: **5 m 50 s**

Dengan `--capture jpeg:0.95`:

- **7,94 fps**, 126 ms/frame
- estimasi video 60 dtk: **3 m 47 s**

Keputusan: **PNG tetap default** karena kualitas teks adalah prioritas konten edukasi/sejarah; JPEG disediakan untuk draf cepat dan hemat waktu.

### 09:16 — Bug warna: `yuvj420p`

Jalur JPEG menghasilkan `pix_fmt = yuvj420p` (full range). Platform (Shorts/Reels/TikTok) mengharapkan `yuv420p` limited range.

Uji tiga varian ffmpeg:

| Varian | Hasil |
|---|---|
| `-pix_fmt yuv420p` | yuvj420p (gagal) |
| `-pix_fmt yuv420p -color_range tv` | yuv420p (benar) |
| `-vf format=yuv420p -color_range tv` | yuv420p (benar) |

Dipilih `-color_range tv` — satu flag, tanpa filter tambahan.

### 09:17 — Uji determinisme

Dua render terpisah (folder kerja berbeda, proses Chromium berbeda):

- 5 hash frame sampel (0, 30, 60, 90, 120) **identik**
- sha256 kedua file mp4 **identik**
- `b335a0491c4af42ef671e6d966f1c9b5d58e89fbbd717ee8fa605cbdc2e415ee`

Artinya seluruh rantai — canvas, PNG, x264 — deterministik. Ini syarat untuk QA otomatis dan render ulang yang bisa dipertanggungjawabkan.

### 09:18 — Uji resume

Skenario: `--chunk 50 --stop-at 60`.

- Berhenti setelah 60 frame; hanya `seg_000.mp4` (50 frame) yang tersimpan
- Segmen setengah jadi (`seg_001`) dihapus otomatis
- Dijalankan ulang tanpa `--stop-at`: 50 frame dilewati, 100 frame dirender
- Hasil akhir: **150 frame, 5,000 dtk**, semua validasi lulus
- Hash frame 60/90/120 identik dengan render penuh

Catatan: hash frame 0 dan 30 tidak ada di hasil resume karena segmen yang sudah selesai tidak dirender ulang — perilaku yang benar, bukan bug.

### 09:20 — Perbaikan tipografi

Judul "40 HARI" terlalu mepet ke bingkai. Ditambahkan `fitFont()` — ukuran font menyesuaikan lebar aman (`w - 180`) secara deterministik. Basis 196 → 184 px dan auto-shrink bila perlu.

### 09:21 — Verifikasi akhir

Render bersih v0.2.0:

- 150/150 frame, 5,000 dtk
- H.264, yuv420p, 1080×1920
- 336 KB (67 KB/dtk)
- estimasi 60 dtk: 6 m 2 s (PNG)
- contact sheet 4 frame menunjukkan animasi berjalan: judul masuk → subjudul → garis aksen → caption → outro → watermark

---

## 19 Nov 2026 — Sesi 2: backup GitHub & workspace v0.3.0

### 09:28 — Repo dibuat, tag v0.2.0

- Repo publik: `github.com/lptech22/vigen` (MIT), branch `main`, 24 file, 466 KB.
- Tag `v0.2.0` + GitHub Release.
- `config.json` sengaja tidak di-commit (berisi path khusus perangkat); diganti `config.example.json`.
- File video/gambar/suara dikecualikan lewat `.gitignore`.

### 09:30–09:45 — Workspace v0.3.0

Keputusan desain:

1. **Marker `.vigen-workspace.json`** + `workspaceVersion` — mencegah engine baru merusak workspace lama tanpa peringatan.
2. **Nama folder = nama tampilan**, slug hanya untuk identitas internal. Nama ber-spasi tetap nyaman di file manager Android.
3. **Status dihitung dari isi folder**, tidak disimpan di metadata — mustahil basi.
4. **Adopsi, bukan timpa**: folder lama di workspace otomatis diberi `vigen.project.json` dan template yang belum ada; file yang sudah ada dibiarkan.
5. **Fallback hanya untuk workspace default**: kalau `--workspace` diberikan eksplisit, error ditampilkan, tidak dialihkan diam-diam.

Uji yang dijalankan:

| Uji | Hasil |
|---|---|
| `setup` pada folder berisi `Konten 1` | diadopsi, video lama tetap ada, status `selesai` |
| `setup` kedua kali | idempoten, tidak ada perubahan |
| `new "Konten 2"` | struktur lengkap 8 item + metadata |
| `new "Konten 2"` lagi | ditolak, exit code 1 |
| transisi status | `naskah` (ada `tts/s01.txt`) → `siap render` (ada `voice/s01.mp3`) |
| fallback storage | path tidak bisa ditulis (EACCES) → pindah `~/Vigen`, config diperbarui, peringatan tampil |
| `list --json` | JSON valid untuk otomasi |

Temuan kecil: di Android ini `mkdir` pada `/system/...` mengembalikan `ENOENT`, bukan `EROFS`. `ENOENT` ditambahkan ke daftar kode fallback (hanya berlaku untuk workspace default).

### 09:46 — Verifikasi

`vigen doctor` menampilkan workspace aktif `v0.3.0`; `vigen list` menunjukkan 2 project (`Konten 1` selesai, `Konten 2` baru).

---

## 19 Nov 2026 — Sesi 3: audio v0.4.0

### 09:48 — Tiga modul baru

`timing` dan `audio` ditulis sebagai modul terpisah supaya alur bisa diuji sendiri-sendiri:

| Modul | Tanggung jawab |
|---|---|
| `src/audio/timeline.mjs` | baca durasi voice (`ffprobe`), hitung start/end, tulis `.work/timeline.json` |
| `src/audio/mix.mjs` | voice bus, musik, ducking, SFX, `loudnorm` 2-pass, mux |
| `src/audio/sfx.mjs` | SFX prosedural dari filter ffmpeg |
| `src/audio/probe.mjs` | durasi & format audio |

Fallback estimasi memakai 2,4 kata/detik. Tujuannya bukan akurasi, melainkan supaya `scene.js` dan visual bisa disiapkan sebelum voice selesai.

### 09:53 — Project uji & suara sintetis

Project `Uji Audio` diisi tiga MP3 sine:

| File | Durasi | Frekuensi |
|---|---|---|
| `s01.mp3` | 1,6 dtk | 440 Hz |
| `s02.mp3` | 2,1 dtk | 660 Hz |
| `s03.mp3` | 4,2 dtk (awalnya 2,1) | 660 Hz |

Frekuensi berbeda dipakai supaya onset tiap scene bisa dideteksi dari energi sinyal, bukan ditebak dari durasi.

### 09:55 — Bug parser loudness

Run pertama melaporkan **−70,0 LUFS**, padahal `true peak` −12,6 dB. Aneh: sinyal jelas ada.

Penyebab: regex mengambil kemunculan `I:` **pertama** dari log `ebur128`, yaitu baris progres saat masih senyap. Nilai akhir ada di ringkasan paling bawah. Perbaikan: ambil match terakhir.

Setelah diperbaiki: **−14,0 LUFS**, sesuai target.

### 09:56 — Ducking awalnya tidak jalan

Pengukuran pertama menunjukkan ducking hanya **0,4 dB**. Ternyata sinyal uji (sine bawaan ffmpeg) jauh lebih pelan dari suara TTS normal, sehingga berada di bawah threshold `sidechaincompress`.

Beberapa kombinasi diuji:

| Parameter | Ducking |
|---|---|
| `threshold=0.05 ratio=8` (awal) | 0,4 dB |
| `threshold=0.05 ratio=4 level_sc=4` | 7,1 dB |
| `threshold=0.05 ratio=4 level_sc=8` | 9,3 dB |
| `threshold=0.02 ratio=6 level_sc=8` | 10,9 dB |

`level_sc=4` dipilih: cukup dalam untuk voice pelan, tidak berlebihan untuk voice normal.

### 09:57 — Determinisme gagal

Dua build bersih menghasilkan sha256 audio berbeda. Investigasi per stem:

| Stem | Hasil |
|---|---|
| `voice-bus.wav` | identik |
| `music-raw.wav` | identik |
| `music-duck.wav` | **berbeda** |
| SFX | identik |

Penyebabnya bukan input. `sidechaincompress` di ffmpeg 9.0.2 menghasilkan **durasi output yang berubah-ubah** pada input yang sama: 7,680 / 7,765333 / 7,800 dtk dalam lima run. Kemungkinan race di EOF/threading filter tersebut.

Keputusan: **buang `sidechaincompress` untuk ducking**. Ganti dengan envelope `volume` yang dihitung dari timeline:

- turun 60 ms sebelum voice,
- naik 250 ms setelah voice selesai,
- kedalaman 0,65 (−9,1 dB),
- `max()` antar scene supaya tidak menumpuk.

Hasil: tiga build bersih → sha256 `513a2357f6d6ddec51c1008f19f9d2b28e489e0c2b68330b5fb74f6df282b6c7` identik.

### 09:58 — SFX juga perlu seed

`anoisesrc` memakai seed acak secara default. Dua generate `whoosh` menghasilkan hash berbeda. Seed tetap ditambahkan (`whoosh=7`, `scratch=11`, `tick=13`); `boom` dan `pop` memakai sine sehingga sudah deterministik.

### 09:59 — Uji SFX, reflow, dan mux

SFX diuji dengan membandingkan mix ber-SFX dan tanpa SFX:

| Jendela | Selisih sinyal |
|---|---|
| whoosh 0,20–0,70 | −33,0 dBFS |
| boom 1,95–2,85 | −28,6 dBFS |
| pop 4,40–4,54 | −30,1 dBFS |
| kontrol (tanpa cue) | **−180 dBFS** (identik) |

Artinya SFX benar-benar masuk hanya di cue.

Reflow diuji dengan menggandakan `s02.mp3` dari 2,1 → 4,2 dtk. Timeline otomatis berubah 5,7 → 7,8 dtk, scene ketiga bergeser 4,4 → 6,5 dtk, dan offset voice tetap **−1,2 ms**.

`--no-retime` diuji dengan menggeser start scene ketiga di `timeline.json`; output mengikuti 6,6 dtk, bukan menghitung ulang.

Mux: video uji 1080×1920 30fps + audio 7,8 dtk → H.264 di-copy, AAC 192 kbps, `+faststart`, durasi 7,800 dtk, dua run sha256 identik.

### 10:00 — Hasil akhir

| Uji | Target | Hasil |
|---|---|---|
| Offset voice | ≤ ±30 ms | **−1,2 ms** |
| Loudness | −14 ± 0,5 LUFS | **−13,9 LUFS** |
| Ducking | ≥ 6 dB | **9,1 dB** |
| Level musik di jeda | kembali normal | selisih 0,23 dB |
| Determinisme | identik | 3/3 build identik |
| Mux | A/V sinkron | 7,800 dtk, deterministic |

Waktu proses audio 7,8 dtk: **±2 detik** (didominasi decode MP3 + `loudnorm` 2-pass). Jauh lebih cepat dari render video, jadi tidak jadi bottleneck.

Catatan jujur: sidechain terdengar lebih "hidup" karena mengikuti level voice, tetapi harga non-determinisme tidak bisa diterima untuk engine yang mengklaim render identik. Envelope timeline adalah kompromi yang tepat untuk format scene yang sudah diketahui durasinya.

---

## 19 Nov 2026 — Sesi 4: visual & humor v0.5.0

### 10:10 — Arah: storyboard, bukan lagi 5 detik hardcoded
Runtime lama hanya mengenal satu layar. v0.5.0 memindahkan seluruh keputusan visual ke `scene.js`: 8 tipe scene, 6 gag, dan timeline yang mengikuti durasi voice. Renderer jadi data-driven; `stage.html` tidak tahu isi cerita, hanya menggambar storyboard yang dikirim.

### 10:14 — Skema & pemetaan timeline
`src/story/storyboard.mjs` memvalidasi skema, id unik, tipe scene/gag, lalu memetakan start/end dari `.work/timeline.json`. Id yang sama dengan nama voice dipakai langsung; bila tidak ada yang cocok → urutan index + peringatan; bila sebagian cocok → error. Scene terakhir otomatis mendapat outro 1,5 dtk.

### 10:18 — Audit jadi bagian render
Setiap `drawBlock` mencatat bounding box dalam koordinat kanvas. `vigen check` mengaudit seluruh frame; `__sendFrame` mengembalikan `violations` sehingga `render` berhenti pada frame pertama yang melanggar. Ini menutup celah "aman di still, keluar saat animasi".

### 10:21 — False positive 1px
Audit awal menambah padding 1px ke setiap kotak, sehingga teks rata kiri di x=84 selalu dilaporkan `kiri 1px`. Padding dihapus; batas kini persis mengikuti metrik teks.

### 10:23 — QA still: dua tabrakan
Dari 8 still, hanya `s07` bermasalah: vinyl record-scratch di (802,476) menutup setup, dan struk mulai di y≈738 menutup teks punchline. Perbaikan:
- vinyl pindah ke pita atas kanan (r 84, pusat 900×304), label rata kanan di 984;
- struk jadi lower-third (`safe.bottom - h - 40`) dan sadar teks lewat `layout.textBottom`;
- chat bubble naik ke y 1110 dan dibatasi `layout.asideTop`.
Semuanya tetap fungsi murni dari `t`.

### 10:26 — Uji kegagalan
Project "Uji Overflow" dengan teks deadpan sangat panjang: `check` exit 1, `s01:text` melewati bawah 2.161 px; `render` berhenti di frame 4 dengan pesan yang sama. `check --json` mengeluarkan detail kotak + selisih.

### 10:29 — Render penuh & determinisme
"Uji Visual" 8 scene: 417 frame, 13,900 dtk, 5,7 fps, 74 dtk, 2,1 MB. Render ulang `--force` → sha256 identik `c869fe2c…86bd7`.

### 10:32 — Uji audio menemukan bug serius
Project 3 scene dengan voice sintetis 1,2 / 1,6 / 1,4 dtk. Ringkasan render menampilkan `s03 … –NaNs`. Ternyata `findByTimeline` memakai `tl.totalDuration`, padahal `tl` adalah array scene, sehingga scene terakhir mendapat `NaN` dan tidak pernah digambar — video tetap "lulus" karena frame-nya kosong. Diperbaiki ke `timeline.totalDuration` plus penjaga `end > start`. Setelah itu: 192 frame, 6,400 dtk, AAC 48 kHz stereo, −14,0 LUFS.

### 10:35 — Verifikasi akhir
- `vigen test --duration 1 --force --quiet` → lulus.
- Template `vigen new` → `check` 0 pelanggaran.
- 8 scene + 6 gag → 2.080 kotak teks, 0 pelanggaran.
- Determinisme dan mux audio lulus.
- Versi dinaikkan ke 0.5.0; README, ROADMAP, CHANGELOG diperbarui.

---

## 19 Nov 2026 — Sesi 5: prompt AI & voice sekali generate v0.5.1

### 10:40 — Masalah yang mau ditutup
Sesi 4 sudah punya storyboard lengkap, tetapi alurnya masih manual: pengguna harus menulis `narasi` di `script.json`, membuat teks TTS sendiri, lalu menyimpan satu audio per scene. Tiga friksi:
1. AI harus mengembalikan banyak file / teks ganda.
2. Generate TTS berkali-kali memakan kuota.
3. Sinkronisasi audio utuh ke scene belum ada.

Keputusan: **narasi disimpan di dalam tiap scene `scene.js`**. AI hanya mengembalikan satu file; mesin yang mengekstrak dan membagi.

### 10:42 — `vigen prompt`
Wizard meminta judul, durasi, jumlah voice, dan jumlah scene, lalu:
- membuat project baru otomatis (nama folder = judul),
- menulis `prompt.txt` (110 baris, 687 kata),
- menyimpan `spec` + `audio.mode` di `vigen.project.json`,
- mencetak langkah kerja berikutnya.

Default: **45 dtk / 1 voice / 8 scene**. Mode non-interaktif: `--yes` plus flag `--duration/--voices/--scenes`.

Prompt sepenuhnya offline — tidak ada panggilan API. Rencana scene: `s01` hook, tengah berputar `fact/timeline/stat/quote/deadpan`, terakhir punchline. Outro tidak ditulis karena mesin menambah 1,5 dtk otomatis.

### 10:45 — `vigen voice`
`src/story/narration.mjs` membaca `scene.js` lewat validator yang sama dengan render. `vigen voice` menggabungkan semua `narasi` menjadi `voice.txt` (satu teks untuk sekali generate TTS). Untuk `--voices N`, dipakai `splitByWords` yang sama dengan timeline, sehingga teks TTS dan pembagian scene tidak mungkin berbeda.

### 10:47 — Timeline tiga mode
| Mode | File | Pembagian |
|---|---|---|
| `scenes` | `voice/s01.mp3 …` | durasi asli per file, jeda 0,35 dtk |
| `single` | `voice/narasi.mp3` | proporsional bobot kata, tanpa jeda buatan |
| `blocks` | `voice/voice-1.mp3 …` | proporsional per blok, jeda hanya antar blok |

Estimasi 2,4 kata/detik tetap menjadi fallback bila `voice/` kosong.

### 10:49 — Bug voice bus terduplikasi
Uji pertama mode single: `voice-bus.wav` menjadi **2,1× lebih panjang** dari audio aslinya. Penyebab: voice bus menempelkan file yang sama sekali per scene. Perbaikan: timeline menyimpan `groups` (file + rentang waktu), dan voice bus serta `duckExpression` memakai `groups`, bukan `scenes`.

Kerusakan sampingan yang tertangkap: `scenesTimeline` sempat memakai `dur = 0` dan `pending: true` karena refactor setengah jalan. Diperbaiki agar tetap memanggil `probeDuration` seperti versi lama. Uji ulang memastikan mode `scenes` masih identik perilakunya.

### 10:52 — Hasil uji
Project 4 scene, narasi 37 kata, audio sintetis 10,500 dtk:

| Scene | Kata | Start → End |
|---|---|---|
| s01 | 11 | 0,000 → 3,122 |
| s02 | 9 | 3,122 → 5,676 |
| s03 | 9 | 5,676 → 8,230 |
| s04 | 8 | 8,230 → 10,500 |

Voice bus tepat **10,500 dtk**, jadi tidak ada duplikasi. Mode 2 blok (5 dtk + 4 dtk) → total **9,350 dtk**, jeda 0,350 dtk hanya di antara blok (s02 berakhir 5,000; s03 mulai 5,350).

### 10:54 — Render & audit
`vigen render` 360 frame / 12,000 dtk, H.264 `yuv420p`, AAC 48 kHz stereo. `--force` menghasilkan sha256 identik `fcc74a66…78cb0e4`. Audit mode single: 360 frame, 1.412 kotak, 0 pelanggaran. Audit mode blok: 326 frame, 1.250 kotak, 0 pelanggaran.

### 10:56 — Wizard diuji lewat PTY
`script -qec` dipakai untuk mensimulasikan TTY. Temuan: `readline` butuh `\r`, bukan `\n`; input `\n\n\n` membuat proses berhenti dengan "Aborted with Ctrl+D". Setelah memakai `\r` dengan jeda kecil, default 45/1/8 diterapkan dan project terbuat benar. Ini murni perilaku uji, bukan bug di Termux asli.

### 10:58 — Verifikasi akhir
- `vigen prompt` membuat `prompt.txt` sesuai parameter (id terakhir mengikuti jumlah scene).
- `vigen voice` menghasilkan `voice.txt` dan memperingatkan bila narasi lebih panjang dari target.
- Mode single dan blocks lulus audio, audit, dan render.
- Versi dinaikkan ke 0.5.1; README, ROADMAP, CHANGELOG diperbarui.
- Project uji (`Uji Prompt`, `Uji Blok`, `Uji Wizard`) dihapus; workspace kembali hanya `Konten 1` dan `Konten 2`.

## Ringkasan angka sesi 1

| Metrik | Nilai |
|---|---|
| Throughput PNG | 5,1 fps (195 ms/frame) |
| Throughput JPEG q0,95 | 7,9 fps (126 ms/frame) |
| Determinisme | 100% (hash video identik) |
| Resume | lulus (0 frame hilang, 0 frame dobel) |
| Akurasi durasi | 0 frame selisih |
| Ukuran video 5 dtk | 336 KB |
| Estimasi video 60 dtk | 5–6 menit (PNG) / ±3,5 menit (JPEG) |

## Keputusan yang dikunci

1. Tanpa dependensi npm — instalasi cukup symlink.
2. Frame dikirim biner via HTTP lokal, bukan base64 via CDP.
3. PNG default, JPEG opsional untuk draf.
4. Chromium dijalankan sekali per perintah, profil sementara dibuang setelah selesai.
5. Semua animasi fungsi murni dari waktu (`f(t)`), tanpa `Date.now()`/`Math.random()`.
6. `-color_range tv` wajib agar output `yuv420p` diterima platform.

## Utang teknis (dibayar di versi berikutnya)

- ~~Workspace `Vigen/` + `Konten N` belum otomatis~~ → selesai di v0.3.0.
- ~~Audio, ducking, loudnorm, SFX~~ → selesai di v0.4.0.
- ~~Subtitle, preview, publikasi, dan QC~~ → selesai di v0.6.0.
- `tools/bench.mjs` masih memakai jalur `file://` lama; hanya alat dev, bukan jalur produksi.

## 19 Nov 2026 — Sesi 2: publikasi & QC

### 21:40 — Baseline

Working tree sudah berisi `subs`, `preview`, dan `qc` yang belum di-commit. Fokus sesi ini: melengkapi `finish`, `publish`, `make`, memperbaiki pemilihan file QC, dan memverifikasi DoD.

Pemeriksaan awal menemukan tiga masalah:

1. `qc` memilih `.mp4` terbaru, sehingga bisa mengambil `_preview.mp4` atau `black_defect.mp4` lalu gagal di cek resolusi.
2. `publish` belum ada, padahal `script.json` sudah punya field `publish`.
3. `make` belum ada, jadi belum ada cara menjalankan pipeline berulang tanpa render ulang.

### 21:45 — Keputusan subtitle

Subtitle tetap dihitung dari `narasi` di `scene.js`, bukan Whisper:

- tidak butuh model/API tambahan;
- timing deterministik: durasi scene dibagi proporsional dari jumlah kata;
- subtitle digambar di canvas, bukan filter `subtitles` ffmpeg, supaya posisi dan safe area sama dengan audit teks lain;
- SRT/ASS tetap diekspor untuk diunggah terpisah.

QC draf menulis `out/qc-preview.json`, bukan `out/qc.json`. Tanpa pemisahan ini, `publish` bisa membaca QC draf 540×960 dan menganggap video final sudah lulus.

### 21:50 — `finish`, `publish`, `make`

- `finish`: cek audio, bangun ulang bila durasi beda > 0,5 dtk, render final + subtitle, QC, tulis `out/finish.json`.
- `publish`: baca `script.json.publish`, tulis `out/caption.txt` + `out/publish.json`. Tidak upload otomatis.
- `make`: audio → subtitle → render → QC → publish, dengan manifest `.work/make.json`.

`finish` dan `make` berhenti lebih awal bila `voice/` kosong dan `out/audio.wav` belum ada. Template `Konten 1` tanpa voice tidak lagi merender video 16 detik yang pasti gagal QC.

### 21:55 — Bug idempotensi pertama

Run kedua `make` masih membangun ulang audio. Penyebab: fingerprint audio memakai `JSON.stringify(timeline)`, dan `timeline.createdAt` berubah setiap `prepareStoryboard()`.

Perbaikan: fingerprint timeline hanya memakai `source`, `mode`, `totalDuration`, `scenes`, dan `groups`. Setelah itu run kedua dan ketiga benar-benar melewati audio, render, dan QC.

### 22:00 — Verifikasi

Project uji: 5 scene (4 narasi + outro), 14,500 dtk, satu audio utuh.

| Uji | Hasil |
|---|---|
| Render final PNG | 435 frame · **5,75 fps** · 75,7 dtk · 1,9 MB |
| Preview 540×960 | 435 frame · **26,14 fps** · 16,6 dtk |
| QC final | −14,0 LUFS · −12,7 dBTP · 0 frame hitam · 0 audio senyap |
| Subtitle | 5 potongan · maks 2 baris · maks 37 karakter |
| `make` run 1 | audio built · render rendered · QC pass · publish written |
| `make` run 2–3 | audio skip · render skip · QC skip · publish written |
| `make --force` | sha256 `4d77feab…c808f08` — identik dengan run bersih |

### 22:05 — Dokumentasi

README, ROADMAP, CHANGELOG, dan jurnal diperbarui. Versi engine tetap 0.6.0 di `package.json`, `config.json`, dan `config.example.json`.

### 22:12 — Dua bug terakhir

Regresi bersih menemukan `render` melaporkan `434/435` frame walau segmen berisi 300 + 135 frame dan `video-only.mp4` tetap 435. Penyebabnya ada di mux: `-shortest` memilih akhir audio AAC yang dibulatkan sedikit lebih pendek dari video, sehingga frame terakhir dibuang. Perbaikan: hapus `-shortest`; `apad=whole_dur=<durasi video>` sudah memastikan audio sama panjang. Setelah itu `mux-test.mp4` kembali 435 frame / 14,500 dtk.

Bug kedua: `finish --out <video>` meneruskan `flags.out` ke `runQc()`, yang menganggapnya path laporan QC. Akibatnya file video bisa ditimpa JSON. `finish` dan `make` sekarang mengosongkan `out` saat memanggil QC; laporan selalu `out/qc.json`.

Regresi 3× setelah perbaikan:

| Run | Hasil |
|---|---|
| 1 (`--force`) | audio built · render 435/435 · QC pass · publish written |
| 2 | audio skip · render skip · QC skip · publish written |
| 3 | audio skip · render skip · QC skip · publish written |

sha256 final kembali `4d77feab…c808f08`. `finish --out` dan `make --out` juga diuji: video tetap MP4 435 frame, QC menulis ke `out/qc.json`, dan run kedua idempoten.

Dua celah lain ditemukan saat menguji kombinasi opsi:

1. `make` bisa melewati QC memakai `out/qc.json` milik file lain (mis. hasil `--out` sebelumnya). Sekarang `qcCanSkip` juga membandingkan `qc.path` dengan video final; bila beda, QC dijalankan ulang.
2. `finish`/`make --no-audio` selalu gagal QC karena audio dianggap hilang. `runQc()` sekarang punya `expectAudio`; bila audio memang dinonaktifkan, hasilnya info, bukan error.

Uji `finish "Konten 1" --no-audio --subs`: 495/495 frame, subtitle 6 potongan maks 2 baris, QC lulus, `finish.json` ditulis. Mux juga diuji dengan audio 20 dtk: output tetap 435 frame / 14,500 dtk karena `-t` membatasi audio.

### Catatan teknis

- `pickVideo()` memilih `<slug>_<width>x<height>.mp4` secara eksplisit, lalu fallback ke video non-preview terbaru.
- `publish` membandingkan `qc.path`/`qc.file` dengan video yang akan dipublikasikan; QC dari file lain dianggap belum lulus.
- `make --no-audio` menandai audio nonaktif di `renderKey`, sehingga video beraudio lama tidak dianggap sama dengan video senyap.
- `finish` tetap merender ulang setiap dipanggil; idempotensi adalah tanggung jawab `make`.
