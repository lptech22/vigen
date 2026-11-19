# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), versi mengikuti [SemVer](https://semver.org/lang/id/).

## [0.4.0] — 2026-11-19

### Ditambahkan
- `vigen timing "<project>"`: timeline dari durasi voice asli (`ffprobe`), jeda antar scene (`--gap`, default 0,35 dtk); fallback estimasi 2,4 kata/detik dari `script.json` (`--wps`).
- `vigen audio "<project>"`: voice bus, musik ducking, SFX, mix, `loudnorm` 2-pass, tulis `out/audio.wav`.
- `vigen audio --mux`: gabungkan audio ke video (AAC 192 kbps, video di-copy, `+faststart`).
- SFX prosedural `whoosh`, `boom`, `scratch`, `pop`, `tick` lewat `sfx.json` — tanpa file berlisensi, seed tetap.
- `--no-retime`, `--music`, `--sfx`, `--video`, `--out`.
- `resolveProject`: pilih project dari nama, slug, atau path.
- Pemeriksaan filter audio di `vigen doctor` (`loudnorm`, `amix`, `adelay`, `apad`, `volume`).

### Diperbaiki
- Loudness reader kini memakai hasil akhir `ebur128`, bukan baris progres pertama (sebelumnya salah melaporkan −70 LUFS).
- Ducking tidak lagi memakai `sidechaincompress` yang non-deterministik di ffmpeg 9.0.2; diganti envelope `volume` berbasis timeline (60 ms masuk, 250 ms keluar, −9 dB).
- `anoisesrc` diberi seed tetap supaya SFX identik antar build.
- Validasi `sfx.json` memberi pesan jelas untuk JSON rusak atau format salah.

### Teknis
- Determinisme audio: 3 build bersih berturut-turut → sha256 identik.
- Offset voice −1,2 ms; loudness −13,9 LUFS; ducking 9,1 dB; mux 7,800 dtk deterministik.
- Tanpa dependensi npm tetap dipertahankan.

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
