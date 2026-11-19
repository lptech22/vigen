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
