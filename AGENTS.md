# Vigen (LPTech)

Engine code-to-video vertikal 1080x1920, jalan penuh di Termux Android
(Node >= 20, FFmpeg libx264, Chromium headless). Repo: github.com/lptech22/vigen
Versi sekarang: v0.8.0 | Tahap berikutnya: v1.0.0 (distribusi GitHub + npm)

## Cara kerja AI
- Diskusikan dulu; eksekusi/ubah file hanya setelah user konfirmasi. Satu
  tahap dalam satu waktu, uji sampai berfungsi sebelum lanjut.
- Jangan baca seluruh repo; pakai peta modul. Revisi file: FULL file, bukan
  potongan. Log panjang: 20 baris terakhir.
- Setelah tahap selesai: /selesai-tahap (perbarui catatan proyek).

## Peta modul (src/)
- cli/      doctor, setup, new, prompt, voice, list, timing, audio, render,
            check, still, test, subs, preview, finish, qc, publish, make, ui
- core/     config, media, util, workspace
- story/    storyboard, prompt, narration, prepare, subs, styles
- render/   browser, cdp, host, render, encode
- audio/    timeline, mix (ducking + loudnorm), sfx, probe
- web/      server (token + SSE), jobs (proses anak), public/ UI tanpa dependensi
- runtime/stage.html  10 tipe scene, 6 gag, subtitle karaoke, audit
- runtime/props.js    12 prop isometrik + helper | cast.js 5 karakter
- bin/vigen.mjs launcher | tools/ bench, props-sheet | test/ | docs/ JOURNAL, ROADMAP

## Alur data
scene.js + voice/ + timeline -> storyboard -> canvas -> POST /frame -> ffmpeg ->
segmen -> concat -> mux; `vigen make`: audio -> subs -> render -> QC -> publish.

## Keputusan yang jangan dibalik
- Frame: POST biner ke host lokal, BUKAN base64 lewat CDP.
- Animasi murni f(t) agar deterministik; kamera hanya gerakkan dunia
  (teks, header, subtitle diam).
- Engine di ~/.vigen; workspace di /storage/emulated/0/Vigen.
- Audio: loudnorm 2-pass -14 LUFS; ducking envelope dari timeline; 1 audio =
  mode single, durasi dibagi proporsional kata; mux tanpa -shortest.
- QC/publish sah hanya bila qc.json dari video final; make idempoten
  (createdAt diabaikan); preview hanya review.
- Prop/karakter script klasik (file:// aman); style default diorama; subtitle
  karaoke dari wordTimes digambar di canvas (bukan filter ffmpeg).
- Web UI: bind 127.0.0.1 + token per sesi; job = proses anak, batal =
  SIGKILL grup; tanpa dependensi/CDN.

## Aturan yang harus tetap lulus
- Safe area teks: x 84-996, y 210-1580 (`vigen check` = 0 pelanggaran).
- Render ulang/`make --force` sha256 identik; output H.264 yuv420p 1080x1920
  30fps, jumlah frame tepat.
- `vigen qc` lulus: -14 LUFS, 0 frame hitam, 0 audio senyap, subtitle <= 2 baris; jangan timpa file user di workspace.

## Sudah dicoba dan gagal
- Base64 lewat CDP: lambat (2,4 fps vs 5,1 fps POST biner). sidechaincompress:
  ducking non-deterministik di ffmpeg 9.0.2.
- Mux -shortest: pembulatan AAC memotong frame terakhir (435 -> 434).
- Prop/karakter ES module: gagal dimuat saat stage.html dibuka via file://.
- three.js/WebGL: ditolak; canvas 2D pseudo-3D cukup (4-5 fps).
- JPEG untuk final: hanya preview; final PNG demi determinisme.

## Status tahap
- Sekarang: v1.0.0 (distribusi GitHub + npm), belum dimulai; rencana di `docs/ROADMAP.md`.
- Selesai: v0.1.0 - v0.8.0 (diorama + web UI lokal); riwayat di CHANGELOG.md + docs/JOURNAL.md.
