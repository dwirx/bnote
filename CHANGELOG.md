# Changelog

## Unreleased - 2026-05-26

### Added

- Added a CodeMirror-powered editor with syntax highlighting for common text and code formats.
- Added CSV table preview with a raw text fallback view.
- Added editor preferences for line numbers, word wrap, font size, and tab size.
- Added clipboard actions for copying the active file path and file details.
- Added system info, restart, and updater status actions in the app menu.
- Added Tauri plugins for filesystem, OS, clipboard, process, and optional updater support.
- Added desktop build scripts for unpacked executable, NSIS installer, and updater-enabled installer builds.

### Changed

- Large UTF-8 files now open in read-only preview mode instead of being rejected as binary files.
- Binary file handling now reports non-editable metadata more explicitly.
- Save behavior now relies on document editability so editable CSV files can be saved safely.
- Windows desktop bundles now target NSIS by default.

### Performance

- Release builds now enable stripping, LTO, single codegen unit, size optimization, and abort-on-panic.
