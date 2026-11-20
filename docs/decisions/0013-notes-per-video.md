# 0013 - Notes belong to the video; review sessions are removed

Supersedes [0008](0008-review-sessions.md).

## Context

Notes were grouped into implicit *review sessions*: leaving the review screen and coming
back started a new one with the next note ([0008](0008-review-sessions.md)). Summaries
were written per session ([0010](0010-summarize-agent.md)).

In use this got in the way. A video is often reviewed in several sittings, and the
summary that is wanted is of everything written about the video - not of whichever
sitting happened to be open. Notes from an earlier visit could not be summarized from the
review screen at all, and a video reviewed three times showed up as three half-reviews.

## Decision

- **There are no sessions.** A note belongs to its video and nothing else. Opening,
  leaving and reopening the review screen changes nothing about where a note goes.
- **A video has at most one summary**, of all its notes (`VideoSummary`, keyed by
  `videoId`). Summarizing again replaces it, still showing the old text until the new
  one arrives.
- **The app says when a summary is behind.** Notes written or edited after the summary
  was requested are counted ("2 not in the summary yet") in the notes panel and on the
  video's card, so it is clear when to summarize again. This is derived from
  `note.updatedAt > summary.requestedAt`; nothing extra is stored.
- **Each note shows when it was written**, where it used to show its session. That keeps
  the one useful thing sessions gave: telling this week's notes from last week's.
- **The "Session notes" view is now "Review notes"**: one card per video that has notes,
  grouped by character, most recently annotated first.
- The agent's read tool is renamed `get_review_notes` and returns every note on the video.
- Deleting a video's last note still deletes its summary: there is nothing left for it
  to be a summary of.

### Migration (library schema 4)

- `sessions` is dropped, and `sessionId` is removed from notes and summaries. No note is
  lost or changed otherwise.
- Where a video had summaries for several sessions, the one written last is kept. The
  others have no place in the new model.
- Because that can discard text, the file as it was is first copied to
  `library.v3-backup.json` beside the library. This now happens before every schema
  upgrade (`library.v<old>-backup.json`), and an existing copy is never overwritten.

Alternatives considered:

- *Keep sessions and add "summarize the whole video".* Two kinds of summary for the same
  notes, and the session bookkeeping would stay for the sake of a label.
- *Merge the texts of several summaries on migration.* Produces a document nobody wrote;
  summarizing again gives a better result for a few credits.

## Consequences

- Simpler model: one fewer entity, no composite keys, and `note.videoId` is no longer a
  redundant copy of anything.
- A summary always covers the whole video, so long, many-sitting reviews make longer
  briefs for the agent. Notes are short; this has not been a problem.
- There is no record of which notes were written in the same sitting, beyond their
  timestamps.
- Summaries from before this change were written from one session's notes. They are kept
  as they are; for a video that had several sessions, the notes from the other sessions
  are simply not reflected until it is summarized again (the app cannot tell, since
  those notes are older than the summary).
