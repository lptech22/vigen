# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), versi mengikuti [SemVer](https://semver.org/lang/id/).

## [0.6.0] — 2026-11-19

### Ditambahkan
- `vigen subs` + `vigen subtitle`: potong `narasi` jadi subtitle ≤ 2 baris, tulis `out/subtitle.srt` + `out/subtitle.ass`, dan gambar subtitle di canvas saat render.
- `vigen preview`: draf 540×960 CRF 30 (`jpeg:0.92`) untuk review cepat, tetap memakai audio dan subtitle bila aktif.
- `vigen finish`: pastikan audio sinkron, render final 1080×1920 + subtitle, jalankan QC, tulis `out/finish.json`.
- `vigen qc`: periksa codec, pixel format, resolusi, fps, durasi, loudness, true peak, frame hitam, audio senyap, dan batas subtitle. `--preview` memeriksa draf dan menulis `qc-preview.json`.
- `vigen publish`: tulis `out/caption.txt` + `out/publish.json` dari `script.json` (`judul`, `deskripsi`, `hashtag`). `--strict` menolak publish bila QC belum lulus.
- `vigen make`: pipeline idempoten audio → subtitle → render final → QC → publish, dengan manifest `.work/make.json`.
- Opsi `--subs` / `--no-subs`, `--subs-max-chars`, `--no-audio`, `--no-qc`, `--no-publish`, `--check`, `--force`.
- Config `subs` (`enabled`, `maxChars`, `maxLines`, `minDuration`) dan `preview` (`scale`, `crf`, `capture`).

### Diperbaiki
- `qc` tidak lagi memilih `_preview.mp4`, `_audio.mp4`, atau `black_defect.mp4` sebagai video final.
- `qc --preview` memakai resolusi 540×960 dan menulis laporan terpisah, sehingga QC draf tidak menimpa QC final.
- `publish` memastikan `qc.json` berasal dari video yang sama; laporan QC draf atau file lain tidak dianggap lulus.
- `render` membersihkan baris no-op dan memakai `storyHash` yang sudah mencakup subtitle.
- Opsi `subs` menerima `--max-chars` maupun `--subs-max-chars` dengan validasi angka.
- `probeAudio` di `qc` hanya dipanggil sekali.
- `make` mengabaikan `createdAt` pada fingerprint timeline, sehingga run kedua benar-benar idempoten.
- `finish`/`make` berhenti dengan pesan jelas bila `voice/` kosong dan audio belum ada.
- Mux audio tidak lagi memakai `-shortest`; pembulatan AAC sempat memotong frame terakhir (435 → 434). `apad=whole_dur` menyamakan audio yang pendek dan `-t` membatasi audio yang panjang.
- `finish --out <video>` dan `make --out <video>` tidak lagi menimpa video dengan laporan QC; path laporan tetap `out/qc.json`.
- `make` tidak lagi melewati QC bila `out/qc.json` berasal dari file lain; laporan harus cocok dengan video final sebelum dianggap valid.
- QC dengan `--no-audio` menandai audio sebagai nonaktif (info), bukan gagal; `finish`/`make --no-audio` bisa lulus dan publish.

### Teknis
- Uji 4 scene + outro, 14,500 dtk: subtitle 5 potongan · maks 2 baris · maks 37 karakter.
- Render final PNG 435 frame · **5,75 fps** · 75,7 dtk · 1,9 MB.
- Preview 540×960: 435 frame · **26,14 fps** · 16,6 dtk.
- QC final: **−14,0 LUFS** · **−12,7 dBTP** · 0 frame hitam · 0 audio senyap.
- `make` dijalankan 3×: run 1 membangun semuanya, run 2–3 melewati audio/render/QC. `make --force` menghasilkan sha256 video identik (`4d77feab…c808f08`).
- Tetap tanpa dependensi npm.

## [0.5.1] — 2026-11-19

### Ditambahkan
- `vigen prompt`: wizard judul, durasi, jumlah voice, jumlah scene; membuat project otomatis dan menulis `prompt.txt` siap tempel ke AI.
- `vigen prompt --yes`: mode non-interaktif dengan default 45 dtk / 1 voice / 8 scene.
- `vigen voice "<project>"`: ekstrak field `narasi` dari `scene.js` menjadi `voice.txt` (satu teks untuk sekali generate TTS).
- `vigen voice --voices N`: menulis `tts/voice-1.txt …` untuk mode blok.
- Field `narasi` per scene (teks diucapkan, terpisah dari teks layar).
- Timeline mode `single`: satu audio utuh dibagi proporsional dari jumlah kata `narasi`.
- Timeline mode `blocks`: beberapa audio, tiap file mencakup beberapa scene berurutan; jeda hanya antar blok.
- `groups` pada timeline agar audio utuh hanya ditempel sekali oleh voice bus.
- `spec` dan `audio` disimpan di `vigen.project.json`.

### Diperbaiki
- Voice bus tidak lagi menggandakan file audio yang sama untuk setiap scene pada mode single/blocks.
- Ducking musik memakai grup audio, bukan scene, sehingga tidak menumpuk pada satu file utuh.
- Pesan sumber timeline di `timing`/`render`/`audio` membedakan mode per scene, single, blok, dan estimasi.

### Teknis
- Prompt 110 baris / 687 kata, offline tanpa API.
- Uji 1 audio 10,500 dtk / 4 scene: split 3,122 · 2,554 · 2,554 · 2,270 dtk.
- Uji 2 blok: total 9,350 dtk, jeda 0,350 dtk.
- Render 360 frame / 12,000 dtk + AAC, deterministik (sha256 identik).

## [0.5.0] — 2026-11-19

### Ditambahkan
- `vigen render "<project>"`: storyboard → video, mux otomatis bila `out/audio.wav` ada; opsi `--capture`, `--chunk`, `--force`, `--no-retime`, `--no-audio`.
- `vigen check "<project>"`: audit bounding box seluruh teks di setiap frame; `--step` dan `--json`.
- `vigen still "<project>" --scene <id>`: render satu scene, sekaligus melaporkan pelanggaran safe area.
- Storyboard `scene.js` v1: 8 tipe scene (`hook`, `fact`, `timeline`, `quote`, `stat`, `deadpan`, `punchline`, `outro`), 6 gag (`stamp`, `freeze-zoom`, `record-scratch`, `timeline-corrected`, `receipt`, `chat-bubble`).
- Validasi skema + pemetaan timeline voice; durasi default per tipe; auto-outro 1,5 dtk.
- Style `sejarah/sepia-archive`: tekstur kertas tua, debu deterministik, bingkai arsip, watermark.
- Render membatalkan diri pada frame pertama yang teksnya keluar safe area.
- `storyHash` pada state resume; perubahan storyboard membuang segmen lama.

### Diperbaiki
- `findByTimeline` memakai `tl.totalDuration` (array scene) sehingga `end` scene terakhir `NaN` dan scene tidak pernah digambar; kini `timeline.totalDuration` + penjaga rentang waktu.
- Tata letak gag punchline: vinyl pindah ke pita atas, struk jadi lower-third, chat bubble menghindari kotak `aside`.
- Padding audit 1px dihapus agar teks rata kiri tepat di x=84 tidak dianggap melanggar.
- Template `vigen new` kini berisi contoh storyboard yang langsung lolos `vigen check`.

### Teknis
- Uji 8 scene: 417 frame / 13,900 dtk, 2.080 kotak teks, 0 pelanggaran.
- Determinisme: render ulang `--force` → sha256 identik (`c869fe2c…86bd7`).
- Throughput 5,7 fps PNG (176 ms/frame); 2,1 MB untuk 13,9 dtk.
- Tetap tanpa dependensi npm.

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
