# 0002 - Store the library as one normalised JSON file, owned by the main process

## Context

The brief asks for a JSON file that stores the data relationships, with a path to a
database later. The data is small (hundreds of videos, thousands of notes at most) and
has a single user.

## Decision

- One document, `library.json`, in Electron's `userData` folder.
- **Normalised**: one array per entity, relations by id, no nesting. It mirrors the
  relational schema in [data-model.md](../data-model.md) one to one.
- The **main process is the only reader and writer**. The renderer sends intent
  ("create this note") and receives the resulting snapshot.
- Domain rules are **pure functions** (`operations.ts`); persistence is behind a
  `LibraryRepository` interface; `LibraryService` queues mutations and commits state only
  after a successful write.
- Writes are atomic: write a temp file, then rename over the original, retrying briefly
  if another program (virus scanner, indexer, sync client) has the file open - on Windows
  that makes the rename fail.
- The file is validated with zod on load. If it cannot be read it is renamed aside, not
  overwritten.

## Consequences

- No lost or half-written data on a crash, and the UI never shows something unsaved.
- Each mutation rewrites the file and sends the whole library over IPC. Fine at this
  scale (a library with 1,000 notes is a few hundred kilobytes). **Revisit when** the file
  reaches several megabytes: switch the repository to SQLite and return patches instead of
  snapshots. The renderer's store API would not need to change.
- A normalised file is slightly less pleasant to read by hand than a nested one. That is
  the price of a trivial database migration.
- Only one app instance may run (enforced with a single-instance lock), since two would
  overwrite each other.
