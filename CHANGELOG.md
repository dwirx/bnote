# Changelog

## Unreleased - 2026-05-26

### Added

- Added a CodeMirror-powered editor with syntax highlighting for common text and code formats.
- Added CSV table preview with a raw text fallback view.
- Added native Rust-backed PDF and EPUB readers.
- Added scrollable multi-page PDF rendering with lazy Pdfium page rasterization, page jump, zoom, fit width, and clickable bookmark/page navigation.
- Added native EPUB parsing with metadata, TOC, spine navigation, scrollable chapter reading, font controls, and inlined EPUB image/CSS resources.
- Added read-only DOCX, MOBI, and AZW3 previews with safe fallback messaging for unsupported or protected files.
- Added DOC and KFX tabs with metadata and external-open fallback messaging.
- Added native CBZ and CBR comic readers with lazy page loading, natural page ordering, zoom, fit-width, and page navigation.
- Bundled Windows x64 `pdfium.dll` for release builds.
- Added folder opening with a limited workspace tree in the sidebar.
- Added a clear recent action for the recent files list.
- Added editor preferences for line numbers, word wrap, font size, and tab size.
- Added new untitled file tabs with first-save Save As behavior.
- Added Zen mode with F11 and Ctrl+Alt+Z shortcuts for focused reading/editing.
- Added collapsible PDF/EPUB chapter and contents sidebars with Ctrl+Alt+B shortcut.
- Added clipboard actions for copying the active file path and file details.
- Added system info, restart, and updater status actions in the app menu.
- Added Tauri plugins for filesystem, OS, clipboard, process, and optional updater support.
- Added desktop build scripts for unpacked executable, NSIS installer, and updater-enabled installer builds.

### Changed

- Large UTF-8 files now open in read-only preview mode instead of being rejected as binary files.
- Binary file handling now reports non-editable metadata more explicitly.
- Save behavior now relies on document editability so editable CSV files can be saved safely.
- App menu actions are grouped by File, View, Clipboard, Editor, and System with visible shortcuts.
- Workspace actions now separate New, File, and Folder entry points to reduce duplicate controls.
- The old duplicated global toolbar was removed in favor of contextual viewer controls.
- Supported file dialogs and folder trees now include AZW3, KFX, MOBI, DOC, DOCX, CBR, and CBZ files.
- Windows desktop bundles now target NSIS by default.

### Fixed

- Fixed PDF rendering after the first PDF metadata load by reusing the initialized Pdfium binding instead of rebinding `pdfium.dll` for every rendered page.
- Cached the active PDFium document by file path, size, and modified time so page rendering does not reopen the same PDF for every visible page.
- Added a WebView2 PDF fallback for PDFs that PDFium rejects with internal format errors, so compatible Windows PDF rendering can still open the document inline.

### Performance

- Release builds now enable stripping, LTO, single codegen unit, size optimization, and abort-on-panic.
