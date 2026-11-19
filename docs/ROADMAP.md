# Roadmap Vigen

Rencana berbasis versi. Aturan main: versi berikutnya tidak dimulai sebelum DoD versi sebelumnya lulus **3 kali berturut-turut**.

| Versi | Tahap | Status |
|---|---|---|
| v0.1.0 | Fondasi | ✅ selesai |
| v0.2.0 | Render inti | ✅ selesai |
| v0.3.0 | Workspace | ✅ selesai |
| v0.4.0 | Audio | ✅ selesai |
| v0.5.0 | Visual & humor | rencana |
| v0.6.0 | Publikasi & QC | rencana |
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

## v0.5.0 — Visual & humor ⏳

- style `sejarah/sepia-archive`
- scene: `hook`, `fact`, `timeline`, `quote`, `stat`, `deadpan`, `punchline`, `outro`
- gag: `stamp`, `freeze-zoom`, `record-scratch`, `timeline-corrected`, `receipt`, `chat-bubble`
- jeda punchline 0,4 dtk; watermark + outro LPTech

**DoD:** teks 100% di safe area (cek bounding box); render ulang pixel-identik.

## v0.6.0 — Publikasi & QC

- subtitle ASS dari naskah (bukan Whisper)
- `preview`, `finish`, `publish`, `qc`
- QC: durasi, LUFS, frame hitam, audio senyap, teks terpotong

**DoD:** subtitle ≤ 2 baris; `make` idempoten.

## v1.0.0 — Distribusi

- `install.sh` Termux, docs, LICENSE, CHANGELOG
- repo `github.com/lptech22/vigen` publik (MIT)
- tag + GitHub Release
- uji instalasi di Termux bersih

**DoD:** clone → install → `doctor` → `test` berhasil tanpa langkah manual selain izin storage.
