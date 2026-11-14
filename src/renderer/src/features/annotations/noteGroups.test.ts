import { describe, expect, it } from 'vitest';
import type { Note, Timestamp } from '@shared/domain/schema';
import { groupNotesByTimestamp, UNGROUPED_KEY } from './noteGroups';

const at = '2026-11-14T10:00:00.000Z';
const note = (id: string, timeSeconds: number): Note => ({
  id,
  videoId: 'v',
  sessionId: 's',
  timeSeconds,
  body: id,
  createdAt: at,
  updatedAt: at,
});
const timestamp = (id: string, timeSeconds: number): Timestamp => ({
  id,
  videoId: 'v',
  timeSeconds,
  label: id,
  kind: 'focus',
  createdAt: at,
});

const shape = (groups: ReturnType<typeof groupNotesByTimestamp>): [string, string[]][] =>
  groups.map((group) => [group.key, group.notes.map((entry) => entry.id)]);

describe('groupNotesByTimestamp', () => {
  it('files each note under the last timestamp at or before it', () => {
    const groups = groupNotesByTimestamp(
      [note('a', 5), note('b', 30), note('c', 45), note('d', 120)],
      [timestamp('round-1', 10), timestamp('round-2', 45), timestamp('round-3', 90)],
    );

    expect(shape(groups)).toEqual([
      [UNGROUPED_KEY, ['a']],
      ['round-1', ['b']],
      ['round-2', ['c']],
      ['round-3', ['d']],
    ]);
    expect(groups[0]?.timestamp).toBeNull();
    expect(groups[2]?.timestamp?.label).toBe('round-2');
  });

  it('skips timestamps that have no notes', () => {
    const groups = groupNotesByTimestamp(
      [note('a', 100), note('b', 110)],
      [timestamp('empty-1', 10), timestamp('empty-2', 20), timestamp('used', 90), timestamp('later', 500)],
    );
    expect(shape(groups)).toEqual([['used', ['a', 'b']]]);
  });

  it('returns a single ungrouped group when there are no timestamps', () => {
    expect(shape(groupNotesByTimestamp([note('a', 1), note('b', 2)], []))).toEqual([[UNGROUPED_KEY, ['a', 'b']]]);
    expect(groupNotesByTimestamp([], [timestamp('t', 1)])).toEqual([]);
  });
});
