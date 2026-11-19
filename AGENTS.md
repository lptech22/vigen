# Vigen (LPTech)

Engine code-to-video vertikal 1080x1920, jalan penuh di Termux Android
(Node >= 20, FFmpeg libx264, Chromium headless). Repo: github.com/lptech22/vigen
Versi sekarang: v0.6.0 | Tahap berikutnya: v1.0.0 (distribusi GitHub + npm)

## Cara kerja AI di proyek ini
- Diskusikan dulu. Eksekusi/ubah file hanya setelah user konfirmasi.
- Jangan baca seluruh repo. Pakai peta modul di bawah, lalu minta/baca
  hanya file yang relevan dengan tahap ini.
- Satu tahap dalam satu waktu. Uji dan pastikan berfungsi sebelum lanjut.
- Revisi file: kirim FULL file hasil revisi (bukan potongan).
- Hemat token: log panjang cukup 20 baris terakhir atau pesan error.
- Setelah tahap selesai: jalankan /selesai-tahap (perbarui catatan proyek).

## Peta modul (src/)
- cli/      perintah: doctor, setup, new, prompt, voice, list, timing, audio,
            render, check, still, test, subs/subtitle, preview, finish, qc,
            publish, make; subtitle-option = opsi --subs bersama
- core/     config, media, util, workspace
- story/    storyboard, prompt builder, narration, prepare, subs (potong subtitle)
- render/   browser, cdp, host (server lokal), render, encode
- audio/    timeline, mix (ducking + loudnorm), sfx, probe
- runtime/stage.html  kanvas 2D: 8 tipe scene, 6 gag, subtitle, audit safe area
- bin/vigen.mjs       launcher CLI | tools/ utilitas dev | test/ pengujian
- docs/JOURNAL.md, docs/ROADMAP.md  catatan dan rencana

## Alur data
scene.js + voice/ + .work/timeline.json
-> storyboard -> Chromium (canvas, animasi + subtitle = f(t))
-> POST biner /frame ke host Node -> ffmpeg -> segmen mp4 -> concat -> mux audio
State resume: .work/state.json (storyHash, sudah mencakup subtitle).
`vigen make`: audio -> subtitle -> render final -> QC -> publish (manifest .work/make.json).

## Keputusan yang jangan dibalik
- Frame dikirim POST biner ke server lokal, BUKAN base64 lewat CDP.
- Semua animasi murni fungsi waktu f(t) agar render deterministik.
- Engine di ~/.vigen (filesystem cepat), workspace di /storage/emulated/0/Vigen.
- Audio: loudnorm 2-pass -14 LUFS; ducking dihitung dari timeline
  (bukan sidechaincompress).
- 1 audio = mode single (default); durasi dibagi proporsional jumlah kata.
- Mux audio tanpa -shortest: apad=whole_dur (audio pendek) dan -t (panjang).
- QC/publish sah hanya bila out/qc.json dari video final yang sama (bukan _preview/_audio).
- make idempoten (createdAt diabaikan); preview 540x960 hanya review, QC terpisah.

## Aturan yang harus tetap lulus
- Safe area teks: x 84-996, y 210-1580 (`vigen check` = 0 pelanggaran).
- Render ulang dan `make --force` menghasilkan sha256 identik.
- Output H.264 yuv420p 1080x1920 30fps, jumlah frame tepat (tidak kurang 1).
- `vigen qc` lulus: -14 LUFS, 0 frame hitam, 0 audio senyap, subtitle <= 2 baris.
- Jangan timpa file milik user di workspace (setup bersifat idempoten).

## Sudah dicoba dan gagal
- Frame base64 lewat CDP: lambat (2,4 fps vs 5,1 fps via POST biner).
- sidechaincompress untuk ducking: non-deterministik di ffmpeg 9.0.2.
- Mux dengan -shortest: pembulatan AAC memotong frame terakhir (435 -> 434).

## Status tahap
- Sekarang: belum ada tahap yang dimulai (v1.0.0 masih rencana).
- Selesai: v0.1.0 - v0.6.0 (lihat CHANGELOG.md).

## Peta cepat (baca ini dulu, jangan telusuri folder)
- Tahap saat ini: v0.6.0 selesai (subtitle, preview, finish, qc, publish, make). Berikutnya: v1.0.0.
- Subtitle: logika `src/story/subs.mjs`, CLI `src/cli/subs.mjs`
- Detail tahap: `docs/ROADMAP.md`, riwayat: `docs/JOURNAL.md`
