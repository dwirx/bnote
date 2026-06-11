# Changelog

## 0.1.1 - 2026-06-12

### Added

- Added a refreshed BNote desktop app icon source and regenerated Tauri icon assets for installer and executable branding.
- Added a GitHub Actions release workflow that builds the Windows NSIS installer and publishes GitHub releases from app version tags.
- Added a CodeMirror-powered editor with syntax highlighting for common text and code formats.
- Added CSV table preview with a raw text fallback view.
- Added native Rust-backed PDF and EPUB readers.
- Added scrollable multi-page PDF rendering with lazy Pdfium page rasterization, page jump, zoom, fit width, and clickable bookmark/page navigation.
- Added native EPUB parsing with metadata, TOC, spine navigation, scrollable chapter reading, font controls, and inlined EPUB image/CSS resources.
- Added read-only DOCX, MOBI, and AZW3 previews with safe fallback messaging for unsupported or protected files.
- Added DOC and KFX tabs with metadata and external-open fallback messaging.
- Added native CBZ and CBR comic readers with lazy page loading, natural page ordering, zoom, fit-width, and page navigation.
- Added native image tabs for JPG, PNG, GIF, WebP, SVG, HEIC/HEIF, AVIF, TIFF, BMP, ICO, QOI, TGA, PNM, and common camera RAW extensions.
- Added a multi-image gallery filmstrip for image tabs so several opened images can be browsed from one viewer.
- Added right-click tab actions for closing the selected tab, tabs to the right, or every open tab.
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
- Supported file dialogs and folder trees now include common image, HEIC/HEIF, AVIF, and RAW camera file extensions.
- Image and comic viewing now use natural image width for 100% zoom, fit-to-window alignment, cursor-centered wheel zoom, keyboard zoom shortcuts, and smoother drag-to-pan scrolling.
- Image zoom now renders on a scaled virtual canvas so the visible image, scrollbar size, and drag navigation all change with the zoom level.
- The recent files list now has its own scrollable panel so long recent history remains reachable.
- The title bar is now slimmer with tighter spacing and responsive controls on small windows.
- Windows desktop bundles now target NSIS by default.

### Fixed

- Fixed PDF rendering after the first PDF metadata load by reusing the initialized Pdfium binding instead of rebinding `pdfium.dll` for every rendered page.
- Cached the active PDFium document by file path, size, and modified time so page rendering does not reopen the same PDF for every visible page.
- Added a WebView2 PDF fallback for PDFs that PDFium rejects with internal format errors, so compatible Windows PDF rendering can still open the document inline.
- Fixed image zoom behavior that used a static width instead of the loaded image's natural size.
- Fixed drag navigation feeling unreliable by keeping zoom focus anchored and separating the scrollable image canvas from the gallery controls.
- Fixed zoom controls appearing to change the percentage while the image stayed visually fit-sized.
- Fixed image and comic preview layout jumps by sending image dimensions from the backend before the preview image loads.
- Fixed recent files not scrolling when the list was taller than the sidebar space.
- Updated the GitHub release workflow to run frontend and Rust tests before publishing.

### Performance

- Release builds now enable stripping, LTO, single codegen unit, size optimization, and abort-on-panic.
