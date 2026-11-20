# Changelog

Format mengikuti [Keep a Changelog](https://keepachangelog.com/id/1.1.0/), versi mengikuti [SemVer](https://semver.org/lang/id/).

## [0.8.0] — 2026-11-20

### Ditambahkan
- `vigen ui`: web UI lokal di `127.0.0.1` dengan token per sesi (cookie HttpOnly + bearer), tanpa dependensi dan tanpa build step.
- Dashboard: workspace, ringkasan status project, pencarian, filter status, kartu project.
- Panel project 3 tab:
  - **Aksi** — Make, Preview, Frame, Check, Audio, QC, Publish; opsi `--force`, `--at`, `QC preview`.
  - **File** — editor `scene.js`, `script.json`, `sfx.json`, `brief.md` dengan backup `<file>.bak` dan validasi JSON sebelum menyimpan.
  - **Hasil** — pemutar video `out/` (HTTP Range, bisa di-seek), ringkasan 13 pemeriksaan QC, caption + tombol Copy, daftar file hasil.
- Job runner serial: antrean maksimal 3, progres frame live lewat SSE, log 1500 baris, tombol Batal.
- API lokal: `/api/session`, `/api/projects`, `/api/projects/:slug`, `/file`, `/asset`, `/jobs`, `/jobs/:id/events`, `/jobs/:id/cancel`.

### Teknis
- Job dijalankan sebagai proses anak (`node bin/vigen.mjs …`) dengan process group sendiri; batal mengirim SIGTERM lalu SIGKILL sehingga Chromium/ffmpeg ikut berhenti. Output identik dengan jalur CLI.
- Aset hanya dari `out/` dan `voice/`; path traversal ditolak. Editor dibatasi whitelist 4 file.
- `shutdownJobs()` dipanggil saat server ditutup; uji: 0 proses tersisa.
- Uji lapangan di Termux: QC 13 pemeriksaan, `make` idempoten (sha256 `c5a604f7…` tetap), `still`/`preview` via UI, cancel render < 1 dtk, antrean + cancel antre, Range `0-99` → 206, traversal → 400.
- `vigen test` 150/150 frame tetap lulus; `package.json` tanpa dependensi.

## [0.7.0] — 2026-11-20

### Ditambahkan
- Style `sejarah/diorama` (default project baru) dengan latar kertas terang, header bab, dan font sans; style lama `sejarah/sepia-archive` tetap dipakai bila `scene.js` tidak menulis `style`.
- Field `chapter: { text, highlight }` (atau `false` untuk menghapus) sebagai header bab yang bertahan antar scene.
- Kamera virtual per scene: `camera: { from, to, ease, content }` atau keyframe `keys`; pan/zoom/rotate dengan easing, `content` mengatur apakah latar ikut bergerak.
- 12 prop vektor isometrik (`src/runtime/props.js`): map, book, scroll, ship, coins, scale, lantern, crate, spice, compass, fort, flag.
- 5 karakter stylized (`src/runtime/cast.js`): pedagang, pelaut, serdadu, raja, petani; pose `idle`/`point`/`hold`, `flip`, animasi masuk `pop`/`drop`/`slide`/`rise`.
- Tipe scene `diorama` (alas `island`/`table`/`none` + prop + kamera) dan `adegan` (tambah `cast` + `callouts`).
- Subtitle karaoke per kata: `wordTimes` per cue, kata aktif disorot (`subActive`), kata belum diucapkan diredupkan.
- Prompt builder menyarankan scene dunia sejak rencana scene, memuat daftar prop/karakter, batas koordinat, dan checklist validasi.
- Alat preview `tools/props-sheet.mjs` dan `tools/cast-sheet.mjs`; benchmark `tools/bench-diorama.mjs`.

### Diperbaiki
- Validasi menolak `adegan` tanpa cast, `cast`/`callouts` di luar `adegan`, `props`/`ground` di tipe non-dunia, callout > 40 karakter, dan `chapter.highlight` yang bukan bagian dari `chapter.text`.
- Nama prop/karakter divalidasi saat boot dengan daftar pilihan; nama salah tidak lagi hilang diam-diam.
- Callout dijepit ke safe area memakai kebalikan transform kamera (`localSafeRect`), jadi chip tidak keluar batas saat zoom.
- Posisi otomatis memisahkan prop (belakang) dan karakter (depan), lalu mengurutkan berdasarkan `y` untuk kedalaman.
- `vigen check` menampilkan ringkasan scene dunia dan memeriksa `wordTimes` (jumlah, urutan, rentang cue).
- `vigen check --json` mengeluarkan JSON murni dengan field `world` dan `validation`.

### Teknis
- Video uji “Rempah Nusantara”: 40,767 dtk · 1223 frame · 1080×1920 30 fps · h264/yuv420p.
- QC: **−14,0 LUFS** · −1,4 dBTP · 0 frame hitam · 0 audio senyap · subtitle maks 2 baris/38 karakter.
- Audit: 1223 frame · 7606 kotak teks · **0 pelanggaran**.
- `make --force` 3× menghasilkan sha256 identik (`c5a604f7…b6c681f`).
- Regresi sepia: `vigen test` 2× → sha256 identik (`ee2b4065…30d4305`); nilainya bergeser dari `5e72e3c9…f190a` karena `stage.html` direfaktor di seri ini, bukan karena non-determinisme. Lembar karakter deterministik (`375cb6f2…a4c84`).

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
