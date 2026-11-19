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
- Belum ada subtitle, style pack, dan humor system (v0.5.0–v0.6.0).
- `tools/bench.mjs` masih memakai jalur `file://` lama; hanya alat dev, bukan jalur produksi.
