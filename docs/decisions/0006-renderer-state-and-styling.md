# 0006 - zustand mirror + URL-driven workflow; CSS Modules with design tokens

## Context

The renderer needs the library everywhere, a four-step guided flow, and a distinctive
visual style in two themes.

## Decision

**State.**

- The library is held in one zustand store that mirrors the main process. Every action is
  "ask main, then replace the snapshot"; there are no optimistic updates to reconcile.
- Reads go through pure selector functions (`store/selectors.ts`) wrapped in `useMemo`.
- The playhead is exposed through `useSyncExternalStore`, not state (see
  [architecture](../architecture.md#the-media-player)).
- Everything else is local component state.

**Workflow.** The four steps are routes (`react-router`, hash-based because the packaged
app is served from `file://`): pick a video and choose a matchup on `/import`, then
`/videos/:id/focus`, then `/videos/:id/review`. Steps 3 and 4 operate on the stored
video, so the same screens serve "edit focus points" and "resume review" later, and a
half-finished import is never lost.

**Styling.** CSS Modules per component plus a global token file with `data-theme`
switching. See [design-system.md](../design-system.md).

Rejected: Redux Toolkit (more ceremony than a 15-action store needs), React Query (there
is no network cache to manage - the main process pushes complete snapshots), Tailwind or a
component library (the look is custom enough that both would mostly be overridden).

## Consequences

- Few dependencies in the renderer: React, react-router, zustand.
- A selector recomputes whenever any part of the library changes. With arrays this small
  it is negligible; if it ever shows up in a profile, split the store by entity.
