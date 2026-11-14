# 0008 - Group notes into implicit review sessions

## Context

The brief asks to "store the notes taken in the session along with the video". Reviewing
the same set on different days is normal, and it is useful to tell this sitting's notes
from last week's.

## Decision

- Every note belongs to a `ReviewSession`, which belongs to a video.
- Sessions are **implicit**. Opening the review screen does not create one; the first note
  written does. Later notes in the same visit join it. Leaving and coming back starts a
  new session with the next note.
- A session records `startedAt` and `lastActivityAt`. Deleting its last note deletes it.
- In the UI, notes are listed by position in the video (that is how they are used) and
  each shows which session it came from; the current one is labelled "This session".
- Timestamps are not tied to a session: they describe the video, not a sitting.

## Consequences

- No empty sessions, and no start/stop bookkeeping that could be left dangling by a crash.
- "A session" means "a visit to the review screen in which something was written". There
  is no way to continue an earlier session; nothing has needed it so far.
