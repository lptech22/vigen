# Vigen

**video generator by LPTech** — engine code-to-video untuk konten vertikal (1080×1920), dijalankan sepenuhnya di Termux Android.

> *Tulis naskah. Vigen bikin videonya.*

Status: **v0.2.0** — mesin render inti sudah lulus uji determinisme, resume, dan validasi output.

---

## Kenapa Vigen

Konten pendek (sejarah, cerita, edukasi) butuh visual berulang dengan biaya produksi rendah. Vigen memisahkan tiga hal supaya bisa diskalakan:

| Lapisan | Isi | Siapa yang mengerjakan |
|---|---|---|
| **Konten** | `script.json`, `scene.js` | AI / penulis |
| **Mesin** | renderer, encoder, validasi | sekali tulis, dipakai selamanya |
| **Suara** | narasi per scene | kamu (ElevenLabs dll.) |

AI cukup menghasilkan data. Mesin tidak pernah menebak kreatif, sehingga gaya dan hasil antar episode konsisten.

## Kebutuhan

- Termux (Android)
- Node.js ≥ 20
- FFmpeg (dengan libx264)
- Chromium (headless)

```bash
pkg install nodejs ffmpeg chromium git
```

## Instalasi (lokal, sebelum rilis GitHub)

```bash
git clone https://github.com/lptech22/vigen ~/.vigen
ln -sf "$HOME/.vigen/bin/vigen.mjs" "$PREFIX/bin/vigen"
vigen doctor
```

Catatan: clone ke `~/.vigen` mensyaratkan folder itu belum ada. Kalau sudah ada, gunakan `git -C ~/.vigen pull` untuk memperbarui.

Engine sengaja disimpan di `~/.vigen` (tersembunyi dari file manager/Galeri Android) dan memakai filesystem cepat, bukan FUSE di `/storage`.

## Perintah

| Perintah | Fungsi |
|---|---|
| `vigen doctor` | Periksa node, ffmpeg, chromium, font, storage, memori |
| `vigen still --at 2.5` | Render satu frame jadi PNG |
| `vigen test` | Render video uji 5 detik + validasi otomatis |
| `vigen version` | Versi engine |

Contoh cepat:

```bash
vigen doctor
vigen still --at 2.5 --out ./frame.png
vigen test
vigen test --capture jpeg:0.95          # draf cepat
vigen test --chunk 50 --stop-at 60      # uji resume
vigen test --force --quiet              # render bersih tanpa progres
```

## Hasil uji di perangkat (Termux, 4 core, Android)

| Metrik | PNG (default) | JPEG q0.95 |
|---|---|---|
| Throughput | **5,1 fps** | **7,9 fps** |
| ms/frame | 195 | 126 |
| Ukuran frame | ~1,1 MB | ~120 KB |
| Estimasi video 60 dtk | 5 m 50 s | 3 m 47 s |
| Kualitas | master, lossless | draf / hemat waktu |

Validasi yang lulus:

- 150 frame untuk 5,000 detik — **0 frame selisih**
- durasi tepat 5,000 dtk, H.264, `yuv420p`, 1080×1920
- dua render terpisah menghasilkan **sha256 identik** (video dan frame)
- resume setelah frame ke-60: 50 frame dilewati, hasil akhir tetap 150 frame / 5,000 dtk
- hash frame setelah resume identik dengan render penuh

## Cara kerja render

```
scene.js / stage.html
        │
        ▼
Chromium headless  ── canvas 2D, semua animasi = f(t)
        │
        │  POST /frame (biner, localhost)
        ▼
Node host  ──►  ffmpeg (image2pipe)  ──►  segmen mp4
        │                                      │
        └── state.json (resume)                ▼
                                        concat → mp4 final
```

Keputusan penting: frame **tidak** dikirim lewat CDP sebagai base64 (mahal), melainkan `POST` biner ke server lokal di Node. Ini menaikkan throughput dari 2,4 fps menjadi 5,1 fps pada konten yang sama.

## Struktur

```
~/.vigen/
├─ bin/vigen.mjs           launcher CLI
├─ src/
│  ├─ cli/                 doctor, still, test
│  ├─ core/                config, util
│  ├─ render/              browser (CDP), host, render, encode
│  └─ runtime/stage.html   kanvas + window.seek(t)
├─ tools/                  utilitas dev (bench, snap)
├─ docs/                   JOURNAL.md, ROADMAP.md
└─ test/
```

## Roadmap

| Versi | Status |
|---|---|
| v0.1.0 — fondasi (doctor, still, Chromium) | ✅ selesai |
| v0.2.0 — render, resume, validasi, determinisme | ✅ selesai |
| v0.3.0 — workspace (`setup`, `new`, `list`) | ⏳ berikutnya |
| v0.4.0 — audio (voice, ducking, loudnorm) | rencana |
| v0.5.0 — style sejarah + sistem humor | rencana |
| v0.6.0 — subtitle, preview, QC | rencana |
| v1.0.0 — distribusi GitHub + npm | rencana |

Detail: [`docs/ROADMAP.md`](docs/ROADMAP.md) · Catatan pengembangan: [`docs/JOURNAL.md`](docs/JOURNAL.md)

## Lisensi

MIT © LPTech
