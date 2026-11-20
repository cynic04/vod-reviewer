import { describe, expect, it } from 'vitest';
import type { Library, Note, VideoSummary } from '@shared/domain/schema';
import { countNotesNotInSummary, selectReviewGroups } from './selectors';

const at = (minute: number): string => `2026-11-14T10:${String(minute).padStart(2, '0')}:00.000Z`;

function note(id: string, videoId: string, minute: number, timeSeconds = 0): Note {
  return { id, videoId, timeSeconds, body: id, createdAt: at(minute), updatedAt: at(minute) };
}

function video(id: string, folderId: string): Library['videos'][number] {
  return {
    id,
    folderId,
    filePath: `C:\\${id}.mp4`,
    fileName: `${id}.mp4`,
    title: id,
    fileSizeBytes: 1,
    recordedAt: at(0),
    importedAt: at(0),
    durationSeconds: null,
    frameRate: 60,
    frameRateSource: 'default',
  };
}

const summary: VideoSummary = {
  id: 's1',
  videoId: 'old',
  status: 'ready',
  markdown: 'text',
  model: 'claude-haiku-4.5',
  requestedAt: at(10),
  completedAt: at(11),
};

const library: Library = {
  schemaVersion: 4,
  settings: {
    theme: 'system',
    videosRoot: null,
    staleAfterDays: 15,
    playerCharacterId: null,
    summaryModel: 'claude-haiku-4.5',
    email: null,
  },
  folders: [
    { id: 'matchup-sol', name: 'Sol Badguy', kind: 'matchup', characterId: 'sol', createdAt: at(0) },
    { id: 'custom', name: 'Tournament sets', kind: 'custom', characterId: null, createdAt: at(0) },
  ],
  videos: [video('old', 'matchup-sol'), video('new', 'matchup-sol'), video('empty', 'matchup-sol'), video('misc', 'custom')],
  timestamps: [],
  notes: [note('a', 'old', 1, 50), note('b', 'new', 30), note('c', 'old', 20, 5), note('d', 'misc', 2)],
  summaries: [summary],
};

describe('selectReviewGroups', () => {
  it('lists one entry per video that has notes, however many sittings they were written in', () => {
    const [sol, miscellaneous] = selectReviewGroups(library);

    expect(sol?.character?.id).toBe('sol');
    // Most recently annotated first; the video without notes is left out.
    expect(sol?.entries.map((entry) => entry.video.id)).toEqual(['new', 'old']);
    expect(sol?.entries[1]).toMatchObject({ summary, lastNoteAt: at(20) });
    expect(sol?.entries[1]?.notes.map((item) => item.id)).toEqual(['c', 'a']);
    expect(miscellaneous).toMatchObject({ character: null, entries: [{ video: { id: 'misc' } }] });
  });

  it('keeps one folder only when asked', () => {
    expect(selectReviewGroups(library, 'custom').map((group) => group.key)).toEqual(['miscellaneous']);
  });
});

describe('countNotesNotInSummary', () => {
  it('counts notes written or edited after the summary was asked for', () => {
    const edited = { ...note('e', 'old', 1), updatedAt: at(15) };
    expect(countNotesNotInSummary([note('a', 'old', 1), note('c', 'old', 20), edited], summary)).toBe(2);
    expect(countNotesNotInSummary([note('c', 'old', 20)], undefined)).toBe(0);
  });
});
