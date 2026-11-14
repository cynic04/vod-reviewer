# 0007 - Ship the roster as code and commit the official portraits

## Context

Videos are filed by matchup, so the app needs every Guilty Gear -Strive- character and a
picture of each.

## Decision

- The roster is static reference data in `src/shared/domain/characters.ts` (id, name,
  battle type, season). As of November 2026 that is 34 characters, through Season Pass 5.
  Ids are the slugs the official site uses.
- Each character gets a built-in matchup folder with the deterministic id
  `matchup-<characterId>`. Folders for characters added later are created on the next
  launch (`reconcileMatchupFolders`).
- Portraits are the character-select images from the official site, downloaded by
  `npm run fetch:characters` into `src/renderer/src/assets/characters/<id>.jpg` and
  **committed**, so the app works offline and builds are reproducible. The script reads
  the ids from `characters.ts` and reports any mismatch with the site.
- A character without an image file falls back to a folder icon; nothing breaks.

## Consequences

- Adding a character is two steps: add a line to `characters.ts`, run the script.
- The artwork is (c) ARC SYSTEM WORKS. It is committed because this repository is private
  and the app is not distributed. **If either changes, remove the images from the
  repository (and its history) and have the script fetch them at install time instead.**
