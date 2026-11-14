# 0001 - Build a desktop app with Electron, electron-vite and React

## Context

The app has to browse the user's Videos folder, play multi-gigabyte local recordings, and
keep a data file on disk. A web page in a browser tab cannot do any of that without
uploading files or repeated permission prompts. The brief also fixes TypeScript and React.

## Decision

An Electron app, built with electron-vite (Vite for the main process, the preload script
and the React renderer), with strict TypeScript throughout.

Options considered:

- **Browser app + local Node server.** Two things to start, a port to manage, and the
  server would still need the same path-safety work.
- **Tauri.** Smaller binaries, but adds Rust to a TypeScript-only project, and its system
  webview makes codec support depend on the OS.
- **Electron.** One language, a bundled Chromium with predictable H.264/AAC playback and
  `requestVideoFrameCallback`, and mature tooling.

## Consequences

- Large runtime (~100 MB+). Acceptable for a personal desktop tool.
- The process split (main / preload / renderer) has to be respected; it drives the
  [architecture](../architecture.md).
- Packaging into an installer is not set up yet. `electron-builder` or Electron Forge can
  be added without code changes; dependencies of the main process are currently left
  external and would be bundled or shipped at that point.
