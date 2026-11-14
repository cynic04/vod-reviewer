import type { Note, Timestamp } from '@shared/domain/schema';
import type { TimelineMarker } from './Timeline';

const NOTE_PREVIEW_LENGTH = 60;

/** Turns stored timestamps and notes into the markers drawn on the timeline. */
export function toTimelineMarkers(timestamps: readonly Timestamp[], notes: readonly Note[] = []): TimelineMarker[] {
  return [
    ...timestamps.map((timestamp) => ({
      id: timestamp.id,
      timeSeconds: timestamp.timeSeconds,
      kind: timestamp.kind,
      label: timestamp.label || (timestamp.kind === 'focus' ? 'Focus point' : 'Timestamp'),
    })),
    ...notes.map((note) => ({
      id: note.id,
      timeSeconds: note.timeSeconds,
      kind: 'note' as const,
      label:
        note.body.length > NOTE_PREVIEW_LENGTH ? `${note.body.slice(0, NOTE_PREVIEW_LENGTH).trimEnd()}...` : note.body,
    })),
  ];
}
