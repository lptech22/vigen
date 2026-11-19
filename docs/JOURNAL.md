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

- Workspace `Vigen/` + `Konten N` belum otomatis (v0.3.0).
- Belum ada audio, subtitle, style pack, dan humor system (v0.4.0–v0.5.0).
- `tools/bench.mjs` masih memakai jalur `file://` lama; hanya alat dev, bukan jalur produksi.
