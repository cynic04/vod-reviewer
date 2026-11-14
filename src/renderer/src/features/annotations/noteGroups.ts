import type { Note, Timestamp } from '@shared/domain/schema';

export interface NoteGroup {
  /** Stable key for React and for remembering which groups are collapsed. */
  key: string;
  /** The timestamp that opens this stretch of the video; `null` for notes before the first one. */
  timestamp: Timestamp | null;
  notes: Note[];
}

export const UNGROUPED_KEY = 'before-first-timestamp';

/**
 * Splits notes into the stretches of video that the timestamps mark out: a note belongs
 * to the last timestamp at or before it. Both inputs must be sorted by time. Timestamps
 * without notes produce no group.
 */
export function groupNotesByTimestamp(notes: readonly Note[], timestamps: readonly Timestamp[]): NoteGroup[] {
  const groups: NoteGroup[] = [];
  let next = 0;
  let current: Timestamp | null = null;

  for (const note of notes) {
    for (let candidate = timestamps[next]; candidate && candidate.timeSeconds <= note.timeSeconds; candidate = timestamps[next]) {
      current = candidate;
      next += 1;
    }

    const key = current?.id ?? UNGROUPED_KEY;
    const last = groups.at(-1);
    if (last?.key === key) last.notes.push(note);
    else groups.push({ key, timestamp: current, notes: [note] });
  }
  return groups;
}
