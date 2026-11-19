# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), versi mengikuti [SemVer](https://semver.org/lang/id/).

## [0.3.0] — 2026-11-19

### Ditambahkan
- `vigen setup`: inisialisasi workspace `/storage/emulated/0/Vigen`, marker `.vigen-workspace.json`, project pertama otomatis.
- `vigen new "<nama>"`: project baru dengan `brief.md`, `script.json`, `scene.js`, folder `tts/ voice/ assets/ out/ .work/`.
- `vigen list` (+ `--json`): status `baru → naskah → siap render → selesai`, dihitung dari isi folder.
- Adopsi folder lama tanpa menimpa file yang sudah ada.
- Fallback workspace ke `~/Vigen` bila lokasi utama tidak bisa ditulis (EACCES/EROFS/ENOENT), dengan peringatan dan pembaruan config.
- Slug otomatis dari nama (mendukung spasi); nama duplikat ditolak.
- Pemeriksaan workspace di `vigen doctor`.

### Diperbaiki
- Pesan `setup` membedakan workspace baru diinisialisasi vs aktif.
- `--workspace` eksplisit tidak lagi diam-diam dialihkan; error ditampilkan dengan saran perbaikan.

## [0.2.0] — 2026-11-19

### Ditambahkan
- `vigen test`: render video uji + validasi otomatis (frame, durasi, codec, pix_fmt, resolusi).
- Host HTTP lokal (`POST /frame`) — frame dikirim biner, bukan base64 lewat CDP.
- Render per segmen (`--chunk`) dengan state resume di `state.json`.
- Uji determinisme (`--hash-every`, `--hash-file`) dan uji resume (`--stop-at`).
- Opsi `--capture png|jpeg:0.95`, `--quiet`, `--duration`.
- `fitFont()` — ukuran judul menyesuaikan lebar aman.
- Dokumentasi: README, jurnal pengembangan, roadmap.

### Diperbaiki
- Throughput naik dari 2,4 fps → 5,1 fps (PNG) dan 7,9 fps (JPEG q0,95).
- `yuvj420p` pada jalur JPEG diperbaiki dengan `-color_range tv`.
- Rumus estimasi durasi video 60 detik (sebelumnya salah faktor `fps`).
- Petunjuk `doctor` tidak lagi muncul untuk pemeriksaan yang sudah ✓.

### Teknis
- Tanpa dependensi npm; klien CDP ditulis sendiri memakai `WebSocket` bawaan Node.

## [0.1.0] — 2026-11-19

### Ditambahkan
- Struktur engine di `~/.vigen` + launcher `$PREFIX/bin/vigen`.
- `vigen doctor`: node, ffmpeg, ffprobe, chromium, font, storage, temp, memori.
- `vigen still`: render satu frame PNG 1080×1920.
- `stage.html` dengan `window.seek(t)` dan animasi deterministik `f(t)`.
- Font disuntik sebagai `@font-face` data URL — tidak bergantung fontconfig.
