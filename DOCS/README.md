# BNote Documentation

Dokumen ini menjelaskan detail teknis BNote untuk pengembangan, maintenance, dan onboarding.

## Ringkasan

BNote adalah desktop text editor ringan. Fokus utama aplikasi adalah workflow lokal:

- pengguna membuka file dari filesystem;
- aplikasi membaca metadata dan konten melalui Tauri command;
- file teks ditampilkan dalam tab editable;
- file biner atau terlalu besar ditampilkan sebagai metadata agar tidak merusak isi file;
- perubahan disimpan kembali ke disk hanya saat pengguna menjalankan Save atau Save As.

Tidak ada backend HTTP, database remote, login, ataupun sinkronisasi cloud.

## Stack

| Area | Teknologi | Catatan |
| --- | --- | --- |
| Desktop shell | Tauri v2 | Window, dialog, opener, store, Rust commands |
| UI | React 19 | Component-based desktop layout |
| Bahasa frontend | TypeScript | Type safety untuk data dokumen dan tab |
| Build frontend | Vite 7 | Dev server dan production bundle |
| State | Zustand | Global store untuk tab, recent files, tema, dan busy/error state |
| Styling | Tailwind CSS 4 | Utility CSS dengan variable warna di `src/App.css` |
| UI primitive | Radix UI | Dialog, menu, tooltip, scroll area, toggle group |
| Icon | Lucide React | Icon toolbar, titlebar, sidebar, dan status |
| Native backend | Rust | Command untuk load/save/inspect file |
| Package manager | Bun | Install dependency dan menjalankan script |

## Entry Point

Frontend dimulai dari:

- `src/main.tsx`
- `src/App.tsx`

Backend Tauri dimulai dari:

- `src-tauri/src/main.rs`
- `src-tauri/src/lib.rs`

Konfigurasi desktop ada di:

- `src-tauri/tauri.conf.json`
- `src-tauri/capabilities/default.json`

## Script

Script utama ada di `package.json`.

```bash
bun run dev
bun run build
bun run preview
bun run tauri
```

Untuk development desktop gunakan:

```bash
bun run tauri dev
```

Untuk build installer/bundle desktop gunakan:

```bash
bun run tauri build
```

## Arsitektur Frontend

`App.tsx` menyusun layout utama:

- `TitleBar`
- `Sidebar`
- `Toolbar`
- `TabsBar`
- `EditorSurface`
- `StatusBar`

State global berada di `src/stores/useAppStore.ts`. Store ini menyimpan:

- `tabs`
- `activeTabId`
- `recentFiles`
- `themeMode`
- `sidebarCollapsed`
- `query`
- `isBusy`
- `isDragActive`
- `error`

Store juga memegang action utama seperti:

- `hydratePreferences`
- `openFiles`
- `openFromDialog`
- `saveActiveTab`
- `saveActiveTabAs`
- `closeTab`
- `toggleSidebar`
- `setThemeMode`
- `updateActiveContent`

## Model Data

Tipe data utama ada di `src/types.ts`.

`FileDocument` adalah representasi file yang dibaca dari Rust:

- `path`
- `name`
- `extension`
- `size`
- `modified`
- `kind`
- `content`
- `encoding`
- `lineCount`

`kind` bernilai `text` atau `binary`. Jika `kind` adalah `binary`, editor tidak menampilkan textarea dan tidak mengizinkan edit konten.

`EditorTab` menyimpan state dokumen di tab:

- `id`
- `document`
- `content`
- `lastSavedContent`

Perubahan belum tersimpan dihitung dengan membandingkan `content` dan `lastSavedContent`.

## Operasi File

Operasi file dilakukan dari Rust di `src-tauri/src/lib.rs`.

Command yang tersedia:

| Command | Fungsi |
| --- | --- |
| `inspect_file` | Membaca dokumen dengan pipeline metadata dan konten |
| `load_file` | Membuka file untuk ditampilkan di UI |
| `save_file` | Menulis konten ke path dan mengembalikan metadata terbaru |

Frontend memanggil command ini melalui `invoke` dari `@tauri-apps/api/core`.

## Proteksi File

BNote memiliki beberapa batasan agar file tidak dibuka secara keliru sebagai teks:

- file lebih dari 5 MB dianggap tidak editable;
- file dengan byte null dianggap biner;
- file yang gagal decode UTF-8 dianggap biner.

Jika file tidak editable, UI tetap menampilkan:

- extension;
- ukuran;
- modified date;
- encoding/status.

Pengguna masih bisa membuka file dengan aplikasi eksternal atau reveal file di folder.

## Persistensi Preferensi

Preferensi lokal disimpan memakai `@tauri-apps/plugin-store`.

File store:

```text
settings.json
```

Key yang digunakan:

| Key | Isi |
| --- | --- |
| `recentFiles` | Daftar path file terbaru |
| `sidebarCollapsed` | Status collapse sidebar |
| `themeMode` | `dark`, `light`, atau `system` |

Daftar recent files dibatasi oleh `MAX_RECENT_FILES` di `src/utils/files.ts`.

## Capability Tauri

Permission desktop ada di `src-tauri/capabilities/default.json`.

Permission yang dipakai:

- `core:default`
- `core:window:allow-close`
- `core:window:allow-minimize`
- `core:window:allow-start-dragging`
- `core:window:allow-toggle-maximize`
- `opener:default`
- `dialog:default`
- `store:default`

Permission ini mendukung custom title bar, dialog file, membuka file eksternal, reveal file di folder, dan penyimpanan preferensi.

## Workflow UI

### Open File

1. Pengguna klik Open, memakai shortcut, atau drop file.
2. Frontend memanggil `openFiles`.
3. Store memanggil `load_file`.
4. Jika file sudah terbuka, tab lama diaktifkan.
5. Jika file baru, tab baru dibuat dan path masuk recent files.

### Edit File

1. File teks ditampilkan di `textarea`.
2. Perubahan masuk ke `updateActiveContent`.
3. Status dirty muncul jika konten berbeda dari `lastSavedContent`.

### Save

1. Pengguna menjalankan Save.
2. Store memanggil `save_file` untuk path tab aktif.
3. Metadata dokumen diperbarui.
4. `lastSavedContent` disamakan dengan konten terbaru.

### Save As

1. Pengguna memilih path baru lewat dialog save.
2. Konten aktif ditulis ke path baru.
3. File hasil save dibaca ulang.
4. Tab aktif diarahkan ke path baru.

### Close Tab

Jika tab memiliki perubahan belum tersimpan, aplikasi menampilkan dialog:

- Save
- Don't Save
- Cancel

Tab hanya ditutup setelah keputusan pengguna selesai.

## Tema

Tema dikontrol oleh `themeMode`:

- `dark`
- `light`
- `system`

`App.tsx` membaca `prefers-color-scheme` saat mode system aktif dan menambahkan class `dark` pada root document ketika diperlukan.

## Shortcut

| Shortcut | Action |
| --- | --- |
| `Ctrl+O` / `Cmd+O` | Open file |
| `Ctrl+S` / `Cmd+S` | Save |
| `Ctrl+Shift+S` / `Cmd+Shift+S` | Save As |
| `Ctrl+B` / `Cmd+B` | Toggle sidebar |
| `Ctrl+W` / `Cmd+W` | Close active tab |

## Panduan Pengembangan

Gunakan pola berikut saat menambahkan fitur:

- Simpan state global lintas komponen di `useAppStore`.
- Simpan helper formatting dan file classification di `src/utils/files.ts`.
- Tambahkan command Rust hanya untuk operasi yang butuh akses native.
- Tambahkan permission di `capabilities/default.json` jika memakai API Tauri/plugin baru.
- Jaga agar file biner dan file besar tidak masuk ke textarea.
- Gunakan komponen UI yang sudah ada di `src/components/ui` sebelum membuat primitive baru.

## Pemeriksaan Sebelum Commit

Jalankan minimal:

```bash
bun run build
```

Untuk perubahan yang menyentuh Tauri/Rust, jalankan juga:

```bash
bun run tauri build
```

Jika hanya mengubah dokumentasi, build frontend cukup sebagai smoke test karena tidak ada perubahan runtime.

## Roadmap Teknis

Item yang masuk akal untuk iterasi berikutnya:

- membuat tab untitled/new note;
- menambahkan find in file;
- menambahkan konfigurasi font editor;
- menambahkan autosave opsional;
- menambahkan syntax highlighting;
- menambahkan session restore untuk tab terbuka;
- menambahkan test unit untuk helper file dan store action.
