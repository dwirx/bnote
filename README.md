# BNote

BNote adalah aplikasi catatan dan editor teks lokal berbasis Tauri, React, dan TypeScript. Aplikasi ini dibuat untuk membuka, membaca, mengedit, dan menyimpan file teks dari komputer pengguna tanpa backend, tanpa akun, dan tanpa sinkronisasi cloud bawaan.

## Fitur Utama

- Membuka banyak file lokal dalam tab.
- Drag and drop file langsung ke jendela aplikasi.
- Edit file teks UTF-8 seperti `.txt`, `.md`, `.json`, `.ts`, `.js`, `.rs`, `.css`, `.html`, `.yaml`, dan format teks umum lain.
- Deteksi file biner dan file besar agar tidak dirender sebagai teks.
- Save dan Save As melalui dialog native sistem operasi.
- Daftar recent files yang disimpan lokal memakai Tauri Store.
- Sidebar recent files dengan pencarian.
- Status bar untuk status simpan, jenis file, ukuran, jumlah baris, jumlah kata, encoding, dan path singkat.
- Tema dark, light, dan system.
- Title bar custom dengan kontrol minimize, maximize, dan close.
- Shortcut keyboard untuk workflow dasar.

## Teknologi

- Tauri v2 untuk shell desktop, dialog file, opener, store, dan command Rust.
- React 19 untuk UI.
- TypeScript untuk frontend.
- Vite 7 untuk dev server dan build frontend.
- Zustand untuk state management.
- Tailwind CSS 4 untuk styling.
- Radix UI untuk primitive komponen.
- Lucide React untuk ikon.
- Rust untuk operasi file lokal melalui Tauri command.
- Bun sebagai package manager dan script runner.

## Prasyarat

Pastikan tool berikut sudah tersedia:

- Bun
- Node.js yang kompatibel dengan toolchain frontend
- Rust stable
- Tauri prerequisites sesuai sistem operasi

Untuk Windows, Tauri membutuhkan Microsoft Visual Studio Build Tools dan WebView2 Runtime. Untuk Linux dan macOS, ikuti dependensi sistem dari dokumentasi Tauri v2.

## Instalasi

Clone repository:

```bash
git clone git@github.com:dwirx/bnote.git
cd bnote
```

Install dependency:

```bash
bun install
```

## Menjalankan Development

Jalankan aplikasi desktop Tauri:

```bash
bun run tauri dev
```

Jika hanya ingin menjalankan frontend Vite:

```bash
bun run dev
```

Konfigurasi Tauri memakai dev server di `http://localhost:1420`, sesuai `src-tauri/tauri.conf.json`.

## Build

Build frontend saja:

```bash
bun run build
```

Build aplikasi desktop:

```bash
bun run tauri build
```

Output bundling Tauri akan dibuat oleh toolchain Tauri di dalam folder target Rust.

## Shortcut

| Shortcut | Fungsi |
| --- | --- |
| `Ctrl+O` / `Cmd+O` | Open file |
| `Ctrl+S` / `Cmd+S` | Save active tab |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Save As |
| `Ctrl+B` / `Cmd+B` | Toggle sidebar |
| `Ctrl+W` / `Cmd+W` | Close active tab |

## Struktur Project

```text
bnote/
  DOCS/                    Dokumentasi teknis tambahan
  public/                  Asset publik Vite
  src/                     Frontend React
    components/            Komponen UI aplikasi
    components/ui/         Primitive UI berbasis Radix/shadcn style
    stores/                Zustand store
    utils/                 Helper file, format, dan metadata
    App.tsx                Root aplikasi
    main.tsx               Entry point React
  src-tauri/               Backend Tauri dan konfigurasi desktop
    capabilities/          Permission/capability Tauri
    src/lib.rs             Command Rust untuk file lokal
    tauri.conf.json        Konfigurasi aplikasi Tauri
  package.json             Script dan dependency frontend
  bun.lock                 Lockfile Bun
```

## Cara Kerja Aplikasi

Frontend mengelola UI, tab, recent files, tema, dan interaksi pengguna. Operasi yang menyentuh filesystem dilakukan lewat command Tauri di Rust:

- `load_file` membaca metadata dan konten file jika aman sebagai teks.
- `save_file` menulis konten editor ke path tujuan.
- `inspect_file` memakai pipeline metadata yang sama untuk inspeksi file.

File dianggap tidak editable jika ukurannya lebih dari 5 MB, mengandung byte null, atau tidak valid UTF-8. Kondisi tersebut membuat UI menampilkan metadata file tanpa membuka konten sebagai teks.

## Dokumentasi Lanjutan

Dokumentasi teknis ada di [DOCS/README.md](DOCS/README.md), termasuk arsitektur, alur state, command Tauri, batasan file, dan catatan pengembangan.

## Catatan Keamanan

BNote tidak mengirim file ke server. Semua operasi file dilakukan lokal melalui Tauri. Aplikasi tetap perlu permission dialog, opener, dan store agar bisa membuka file, menampilkan file di folder, membuka file dengan aplikasi eksternal, dan menyimpan preferensi lokal.
