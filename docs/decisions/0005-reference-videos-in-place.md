# 0005 - Reference videos where they are; date them by file modification time

## Context

"Importing" a video could mean copying it into an app-managed folder or just remembering
where it is. Match recordings are routinely several gigabytes.

## Decision

- **Importing records the file's path. Nothing is copied or moved**, and removing a video
  from the library never touches the file.
- A file can be in the library once; it lives in exactly one folder (a matchup or a custom
  folder). Folders are an organisational concept of the app, not directories on disk.
- The import browser is confined to one root folder - the OS Videos folder by default,
  changeable in Settings - and can walk its sub-folders.
- A video's date (`recordedAt`) is the file's **last-modified time**: for a recording that
  is the moment the capture finished, and unlike the creation time it survives the file
  being copied to another drive. The "old video" highlight (older than 15 days by default)
  is computed from it.

## Consequences

- Importing is instant and uses no extra disk space.
- The library depends on files staying put (see ADR 0003 for what happens otherwise).
- Editing or re-encoding a recording changes its modification time and therefore its date.
