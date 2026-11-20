import { describe, expect, it } from 'vitest';
import { CHARACTERS, matchupFolderId } from '@shared/domain/characters';
import { librarySchema, type Library } from '@shared/domain/schema';
import {
  completeSummary,
  createEmptyLibrary,
  createFolder,
  createNote,
  createTimestamp,
  importVideo,
  reconcileMatchupFolders,
  removeFolder,
  removeNote,
  removeSummary,
  removeVideo,
  renameFolder,
  requestSummary,
  settleInterruptedSummaries,
  updateSettings,
  updateVideo,
  type OperationContext,
} from './operations';

function testContext(): OperationContext {
  let counter = 0;
  return {
    now: () => new Date('2026-11-14T10:00:00.000Z'),
    newId: () => `id-${(counter += 1)}`,
  };
}

const SOL = matchupFolderId('sol');

function libraryWithVideo(ctx: OperationContext): { library: Library; videoId: string } {
  const { library, video } = importVideo(
    createEmptyLibrary(ctx),
    {
      filePath: 'C:\\Videos\\set-vs-sol.mp4',
      fileName: 'set-vs-sol.mp4',
      fileSizeBytes: 1024,
      recordedAt: '2026-11-01T18:00:00.000Z',
      folderId: SOL,
    },
    ctx,
  );
  return { library, videoId: video.id };
}

describe('library operations', () => {
  it('starts with one matchup folder per character and satisfies the schema', () => {
    const library = createEmptyLibrary(testContext());
    expect(library.folders).toHaveLength(CHARACTERS.length);
    expect(library.folders.every((folder) => folder.kind === 'matchup')).toBe(true);
    expect(() => librarySchema.parse(library)).not.toThrow();
  });

  it('adds folders for characters missing from an older library', () => {
    const ctx = testContext();
    const full = createEmptyLibrary(ctx);
    const older = { ...full, folders: full.folders.filter((folder) => folder.characterId !== 'rbk') };

    const reconciled = reconcileMatchupFolders(older, ctx);
    expect(reconciled.folders.map((folder) => folder.id)).toContain(matchupFolderId('rbk'));
    expect(reconcileMatchupFolders(reconciled, ctx)).toBe(reconciled);
  });

  it('imports a video with a title derived from the file name', () => {
    const { library } = libraryWithVideo(testContext());
    expect(library.videos[0]).toMatchObject({ title: 'set-vs-sol', folderId: SOL, frameRate: 60 });
    expect(() => librarySchema.parse(library)).not.toThrow();
  });

  it('refuses to import the same file twice or into a missing folder', () => {
    const ctx = testContext();
    const { library } = libraryWithVideo(ctx);
    const again = {
      filePath: 'C:\\Videos\\set-vs-sol.mp4',
      fileName: 'set-vs-sol.mp4',
      fileSizeBytes: 1024,
      recordedAt: '2026-11-01T18:00:00.000Z',
    };
    expect(() => importVideo(library, { ...again, folderId: SOL }, ctx)).toThrow(/already in your library/);
    expect(() => importVideo(library, { ...again, filePath: 'C:\\other.mp4', folderId: 'nope' }, ctx)).toThrow(
      /does not exist/,
    );
  });

  it('leaves fields alone when a patch carries undefined for them', () => {
    const { library, videoId } = libraryWithVideo(testContext());
    const updated = updateVideo(library, { id: videoId, patch: { title: undefined, durationSeconds: 90 } });
    expect(updated.videos[0]).toMatchObject({ title: 'set-vs-sol', durationSeconds: 90 });
  });

  it('keeps every note on a video in one collection, whenever it was written', () => {
    const ctx = testContext();
    const { library, videoId } = libraryWithVideo(ctx);

    const first = createNote(library, { videoId, timeSeconds: 3, body: 'Whiffed 6P' }, ctx);
    const second = createNote(first.library, { videoId, timeSeconds: 9, body: 'Burst baited' }, ctx);

    expect(second.library.notes).toMatchObject([
      { videoId, timeSeconds: 3, body: 'Whiffed 6P' },
      { videoId, timeSeconds: 9, body: 'Burst baited' },
    ]);
    expect(() => createNote(library, { videoId: 'missing', timeSeconds: 0, body: 'x' }, ctx)).toThrow(/does not exist/);
  });
  it('removes a video together with its timestamps and notes', () => {
    const ctx = testContext();
    const { library, videoId } = libraryWithVideo(ctx);
    const withTimestamp = createTimestamp(
      library,
      { videoId, timeSeconds: 12, label: 'Round 2', kind: 'focus' },
      ctx,
    ).library;
    const withNote = createNote(withTimestamp, { videoId, timeSeconds: 12, body: 'x' }, ctx);

    const removed = removeVideo(withNote.library, videoId);
    expect(removed).toMatchObject({ videos: [], timestamps: [], notes: [] });
  });

  it('keeps the previous summary text until a regenerated one arrives', () => {
    const ctx = testContext();
    const { library, videoId } = libraryWithVideo(ctx);
    const { library: withNote } = createNote(library, { videoId, timeSeconds: 3, body: 'x' }, ctx);

    const first = requestSummary(withNote, videoId, ctx);
    expect(first.summary).toMatchObject({ status: 'pending', markdown: '', model: 'claude-haiku-4.5' });
    const written = completeSummary(first.library, first.summary.id, '  ## Overview  ', ctx);
    expect(written.summaries).toMatchObject([{ status: 'ready', markdown: '## Overview' }]);

    const again = requestSummary(written, videoId, ctx);
    expect(again.library.summaries).toHaveLength(1);
    expect(again.summary).toMatchObject({ status: 'pending', markdown: '## Overview' });
    expect(again.summary.id).not.toBe(first.summary.id);

    // Cancelling the regeneration, or restarting the app mid-run, falls back to the old text.
    expect(removeSummary(again.library, again.summary.id).summaries).toMatchObject([
      { status: 'ready', markdown: '## Overview' },
    ]);
    expect(settleInterruptedSummaries(again.library).summaries).toMatchObject([{ status: 'ready' }]);
    // A first run that never finished leaves nothing behind.
    expect(settleInterruptedSummaries(first.library).summaries).toEqual([]);
    expect(removeSummary(written, first.summary.id).summaries).toEqual([]);
  });

  it('only summarizes videos that exist and have notes, and only accepts a summary once', () => {
    const ctx = testContext();
    const { library, videoId } = libraryWithVideo(ctx);
    expect(() => requestSummary(library, 'no-video', ctx)).toThrow(/does not exist/);
    expect(() => requestSummary(library, videoId, ctx)).toThrow(/no notes/);

    const { library: withNote } = createNote(library, { videoId, timeSeconds: 3, body: 'x' }, ctx);
    const { library: pending, summary } = requestSummary(withNote, videoId, ctx);
    expect(() => completeSummary(pending, summary.id, '   ', ctx)).toThrow(/empty/);
    const done = completeSummary(pending, summary.id, 'text', ctx);
    expect(() => completeSummary(done, summary.id, 'again', ctx)).toThrow(/already been saved/);
  });

  it('drops a summary with the last note of its video, or with the video', () => {
    const ctx = testContext();
    const { library, videoId } = libraryWithVideo(ctx);
    const { library: withNote, note } = createNote(library, { videoId, timeSeconds: 3, body: 'x' }, ctx);
    const two = createNote(withNote, { videoId, timeSeconds: 8, body: 'y' }, ctx);
    const { library: summarized } = requestSummary(two.library, videoId, ctx);

    const oneLeft = removeNote(summarized, note.id);
    expect(oneLeft.summaries).toHaveLength(1);
    expect(removeNote(oneLeft, two.note.id).summaries).toEqual([]);
    expect(removeVideo(summarized, videoId).summaries).toEqual([]);
  });

  it('only accepts a roster character as the player character', () => {
    const library = createEmptyLibrary(testContext());
    expect(updateSettings(library, { playerCharacterId: 'mll' }).settings.playerCharacterId).toBe('mll');
    expect(() => updateSettings(library, { playerCharacterId: 'ryu' })).toThrow(/not a character/);
  });

  it('protects matchup folders and non-empty custom folders', () => {
    const ctx = testContext();
    const { library, videoId } = libraryWithVideo(ctx);

    expect(() => renameFolder(library, SOL, 'Not Sol')).toThrow(/built in/);
    expect(() => removeFolder(library, SOL)).toThrow(/built in/);
    expect(() => createFolder(library, '  sol badguy ', ctx)).toThrow(/already exists/);

    const withFolder = createFolder(library, 'Tournament sets', ctx);
    const customId = withFolder.folders.at(-1)?.id ?? '';
    const moved = updateVideo(withFolder, { id: videoId, patch: { folderId: customId } });

    expect(() => removeFolder(moved, customId)).toThrow(/Move or remove/);
    expect(removeFolder(withFolder, customId).folders).toHaveLength(CHARACTERS.length);
  });
});
