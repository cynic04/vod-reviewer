# 0003 - Stream videos through a custom protocol instead of `file://`

## Context

The renderer needs to play local files. The obvious route - `file://` URLs with
`webSecurity` disabled - gives the page read access to the entire disk and does not work
from the dev server's `http://` origin at all.

## Decision

Register a privileged `vod-media://` scheme handled in the main process:

- `vod-media://video/<videoId>` resolves a video **that is in the library**, by id.
- `vod-media://preview/?path=...` resolves a not-yet-imported file, but only if it is a
  supported video type **inside the configured videos folder**.

The handler implements HTTP range requests itself (`206 Partial Content` with
`Content-Range`), streaming just the requested bytes from disk.

## Consequences

- The renderer can never read an arbitrary file, even if it were compromised.
- Seeking is instant in very large files: measured on a 6.4 GB 1440p60 recording, the
  player was ready in ~0.1 s and seeks completed in well under 0.2 s.
- Range handling is our own code, so it is unit-tested (`range.test.ts`).
- Moving or deleting a file outside the app breaks its library entry; the player then
  shows an explanatory error. Re-linking is not implemented.
