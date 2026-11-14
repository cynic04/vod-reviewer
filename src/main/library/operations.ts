import { CHARACTERS, getCharacter, matchupFolderId } from '@shared/domain/characters';
import {
  DEFAULT_FRAME_RATE,
  DEFAULT_STALE_AFTER_DAYS,
  DEFAULT_SUMMARY_MODEL,
  LIBRARY_SCHEMA_VERSION,
  MAX_SUMMARY_LENGTH,
} from '@shared/domain/constants';
import type {
  Folder,
  Library,
  Note,
  ReviewSession,
  SessionSummary,
  Settings,
  Timestamp,
  Video,
} from '@shared/domain/schema';
import type { IpcRequest } from '@shared/ipc/contract';
import { pathKey } from '../videos/paths';
import { DomainError, notFound } from './errors';

/**
 * Pure state transitions for the library. Each takes the current library and returns a
 * new one; nothing here touches the disk, the clock or randomness directly, which keeps
 * every rule of the domain unit-testable.
 */

export interface OperationContext {
  now: () => Date;
  newId: () => string;
}

/** Copies `patch` onto `entity`, ignoring keys that are absent or explicitly `undefined`. */
function applyPatch<T extends object>(entity: T, patch: { [K in keyof T]?: T[K] | undefined }): T {
  const next = { ...entity };
  for (const key of Object.keys(patch) as (keyof T)[]) {
    const value = patch[key];
    if (value !== undefined) next[key] = value;
  }
  return next;
}

function replaceById<T extends { id: string }>(items: readonly T[], updated: T): T[] {
  return items.map((item) => (item.id === updated.id ? updated : item));
}

function requireById<T extends { id: string }>(items: readonly T[], id: string, entity: string): T {
  const found = items.find((item) => item.id === id);
  if (!found) throw notFound(entity, id);
  return found;
}

function matchupFolder(characterId: string, name: string, createdAt: string): Folder {
  return { id: matchupFolderId(characterId), name, kind: 'matchup', characterId, createdAt };
}

export function createEmptyLibrary(ctx: OperationContext): Library {
  const createdAt = ctx.now().toISOString();
  return {
    schemaVersion: LIBRARY_SCHEMA_VERSION,
    settings: {
      theme: 'system',
      videosRoot: null,
      staleAfterDays: DEFAULT_STALE_AFTER_DAYS,
      playerCharacterId: null,
      summaryModel: DEFAULT_SUMMARY_MODEL,
      email: null,
    },
    folders: CHARACTERS.map((character) => matchupFolder(character.id, character.name, createdAt)),
    videos: [],
    timestamps: [],
    sessions: [],
    notes: [],
    summaries: [],
  };
}

/** Adds matchup folders for characters that joined the roster after the library was created. */
export function reconcileMatchupFolders(library: Library, ctx: OperationContext): Library {
  const existing = new Set(library.folders.map((folder) => folder.id));
  const missing = CHARACTERS.filter((character) => !existing.has(matchupFolderId(character.id)));
  if (missing.length === 0) return library;

  const createdAt = ctx.now().toISOString();
  return {
    ...library,
    folders: [...library.folders, ...missing.map((c) => matchupFolder(c.id, c.name, createdAt))],
  };
}

export function updateSettings(
  library: Library,
  patch: { [K in keyof Settings]?: Settings[K] | undefined },
): Library {
  if (patch.playerCharacterId != null && !getCharacter(patch.playerCharacterId)) {
    throw new DomainError('INVALID_REQUEST', `"${patch.playerCharacterId}" is not a character in the roster.`);
  }
  const settings: Settings = applyPatch(library.settings, patch);
  return { ...library, settings };
}

export interface ImportVideoInput {
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  recordedAt: string;
  folderId: string;
}

export function importVideo(
  library: Library,
  input: ImportVideoInput,
  ctx: OperationContext,
): { library: Library; video: Video } {
  requireById(library.folders, input.folderId, 'Folder');

  const key = pathKey(input.filePath);
  if (library.videos.some((video) => pathKey(video.filePath) === key)) {
    throw new DomainError('CONFLICT', `"${input.fileName}" is already in your library.`);
  }

  const video: Video = {
    id: ctx.newId(),
    folderId: input.folderId,
    filePath: input.filePath,
    fileName: input.fileName,
    title: input.fileName.replace(/\.[^.]+$/, '') || input.fileName,
    fileSizeBytes: input.fileSizeBytes,
    recordedAt: input.recordedAt,
    importedAt: ctx.now().toISOString(),
    durationSeconds: null,
    frameRate: DEFAULT_FRAME_RATE,
    frameRateSource: 'default',
  };
  return { library: { ...library, videos: [...library.videos, video] }, video };
}

export function updateVideo(library: Library, { id, patch }: IpcRequest<'videos:update'>): Library {
  const video = requireById(library.videos, id, 'Video');
  if (patch.folderId !== undefined) requireById(library.folders, patch.folderId, 'Folder');
  return { ...library, videos: replaceById(library.videos, applyPatch(video, patch)) };
}

/** Removes a video from the library together with everything recorded against it. */
export function removeVideo(library: Library, id: string): Library {
  requireById(library.videos, id, 'Video');
  return {
    ...library,
    videos: library.videos.filter((video) => video.id !== id),
    timestamps: library.timestamps.filter((timestamp) => timestamp.videoId !== id),
    sessions: library.sessions.filter((session) => session.videoId !== id),
    notes: library.notes.filter((note) => note.videoId !== id),
    summaries: library.summaries.filter((summary) => summary.videoId !== id),
  };
}

function assertFolderNameFree(library: Library, name: string, exceptId?: string): void {
  const wanted = name.trim().toLowerCase();
  if (library.folders.some((f) => f.id !== exceptId && f.name.trim().toLowerCase() === wanted)) {
    throw new DomainError('CONFLICT', `A folder named "${name.trim()}" already exists.`);
  }
}

function requireCustomFolder(library: Library, id: string): Folder {
  const folder = requireById(library.folders, id, 'Folder');
  if (folder.kind !== 'custom') {
    throw new DomainError('FORBIDDEN', 'Matchup folders are built in and cannot be changed.');
  }
  return folder;
}

export function createFolder(library: Library, name: string, ctx: OperationContext): Library {
  assertFolderNameFree(library, name);
  const folder: Folder = {
    id: ctx.newId(),
    name: name.trim(),
    kind: 'custom',
    characterId: null,
    createdAt: ctx.now().toISOString(),
  };
  return { ...library, folders: [...library.folders, folder] };
}

export function renameFolder(library: Library, id: string, name: string): Library {
  const folder = requireCustomFolder(library, id);
  assertFolderNameFree(library, name, id);
  return { ...library, folders: replaceById(library.folders, { ...folder, name: name.trim() }) };
}

export function removeFolder(library: Library, id: string): Library {
  requireCustomFolder(library, id);
  if (library.videos.some((video) => video.folderId === id)) {
    throw new DomainError('CONFLICT', 'Move or remove the videos in this folder before deleting it.');
  }
  return { ...library, folders: library.folders.filter((folder) => folder.id !== id) };
}

export function createTimestamp(
  library: Library,
  input: IpcRequest<'timestamps:create'>,
  ctx: OperationContext,
): { library: Library; timestamp: Timestamp } {
  requireById(library.videos, input.videoId, 'Video');
  const timestamp: Timestamp = { ...input, id: ctx.newId(), createdAt: ctx.now().toISOString() };
  return { library: { ...library, timestamps: [...library.timestamps, timestamp] }, timestamp };
}

export function updateTimestamp(library: Library, { id, patch }: IpcRequest<'timestamps:update'>): Library {
  const timestamp = requireById(library.timestamps, id, 'Timestamp');
  return { ...library, timestamps: replaceById(library.timestamps, applyPatch(timestamp, patch)) };
}

export function removeTimestamp(library: Library, id: string): Library {
  requireById(library.timestamps, id, 'Timestamp');
  return { ...library, timestamps: library.timestamps.filter((timestamp) => timestamp.id !== id) };
}

/**
 * Stores a note. Notes always belong to a review session: passing `sessionId: null`
 * opens a new one, so sessions only exist once something was actually written in them.
 */
export function createNote(
  library: Library,
  input: IpcRequest<'notes:create'>,
  ctx: OperationContext,
): { library: Library; note: Note } {
  requireById(library.videos, input.videoId, 'Video');
  const now = ctx.now().toISOString();

  let session: ReviewSession;
  let sessions: ReviewSession[];
  if (input.sessionId === null) {
    session = { id: ctx.newId(), videoId: input.videoId, startedAt: now, lastActivityAt: now };
    sessions = [...library.sessions, session];
  } else {
    const existing = requireById(library.sessions, input.sessionId, 'Review session');
    if (existing.videoId !== input.videoId) {
      throw new DomainError('CONFLICT', 'That review session belongs to a different video.');
    }
    session = { ...existing, lastActivityAt: now };
    sessions = replaceById(library.sessions, session);
  }

  const note: Note = {
    id: ctx.newId(),
    videoId: input.videoId,
    sessionId: session.id,
    timeSeconds: input.timeSeconds,
    body: input.body,
    createdAt: now,
    updatedAt: now,
  };
  return { library: { ...library, sessions, notes: [...library.notes, note] }, note };
}

export function updateNote(library: Library, id: string, body: string, ctx: OperationContext): Library {
  const note = requireById(library.notes, id, 'Note');
  const updated: Note = { ...note, body, updatedAt: ctx.now().toISOString() };
  return { ...library, notes: replaceById(library.notes, updated) };
}

/** Removes a note, and its session (with any summary of it) once that session has no notes left. */
export function removeNote(library: Library, id: string): Library {
  const note = requireById(library.notes, id, 'Note');
  const notes = library.notes.filter((candidate) => candidate.id !== id);
  if (notes.some((candidate) => candidate.sessionId === note.sessionId)) return { ...library, notes };
  return {
    ...library,
    notes,
    sessions: library.sessions.filter((session) => session.id !== note.sessionId),
    summaries: library.summaries.filter((summary) => summary.sessionId !== note.sessionId),
  };
}

/**
 * Opens a summary request for a session. A session has at most one summary: asking again
 * replaces it with a new pending one that keeps showing the previous text until the
 * agent hands in a new version.
 */
export function requestSummary(
  library: Library,
  sessionId: string,
  ctx: OperationContext,
): { library: Library; summary: SessionSummary } {
  const session = requireById(library.sessions, sessionId, 'Review session');
  if (!library.notes.some((note) => note.sessionId === sessionId)) {
    throw new DomainError('CONFLICT', 'There are no notes in this session to summarize yet.');
  }

  const previous = library.summaries.find((candidate) => candidate.sessionId === sessionId);
  const summary: SessionSummary = {
    id: ctx.newId(),
    sessionId,
    videoId: session.videoId,
    status: 'pending',
    markdown: previous?.markdown ?? '',
    model: library.settings.summaryModel,
    requestedAt: ctx.now().toISOString(),
    completedAt: previous?.completedAt ?? null,
  };
  return {
    library: {
      ...library,
      summaries: [...library.summaries.filter((candidate) => candidate.sessionId !== sessionId), summary],
    },
    summary,
  };
}

/** Stores the text the agent wrote for a pending summary. */
export function completeSummary(library: Library, id: string, markdown: string, ctx: OperationContext): Library {
  const summary = requireById(library.summaries, id, 'Summary');
  if (summary.status !== 'pending') {
    throw new DomainError('CONFLICT', 'This summary has already been saved.');
  }
  const text = markdown.trim();
  if (text === '') throw new DomainError('INVALID_REQUEST', 'The summary is empty.');
  if (text.length > MAX_SUMMARY_LENGTH) {
    throw new DomainError('INVALID_REQUEST', `The summary is longer than ${MAX_SUMMARY_LENGTH} characters.`);
  }
  const completed: SessionSummary = {
    ...summary,
    status: 'ready',
    markdown: text,
    completedAt: ctx.now().toISOString(),
  };
  return { ...library, summaries: replaceById(library.summaries, completed) };
}

/** What is left of a pending summary whose run will not finish: its previous text, if it had any. */
function withoutPendingRun(summary: SessionSummary): SessionSummary[] {
  if (summary.status !== 'pending') return [summary];
  return summary.markdown === '' ? [] : [{ ...summary, status: 'ready' }];
}

/**
 * Removes a summary. Cancelling a pending one gives up on the run in progress and falls
 * back to the text from before it, so regenerating never destroys a summary by accident.
 */
export function removeSummary(library: Library, id: string): Library {
  const summary = requireById(library.summaries, id, 'Summary');
  const replacement = summary.status === 'pending' ? withoutPendingRun(summary) : [];
  return {
    ...library,
    summaries: library.summaries.flatMap((candidate) => (candidate.id === id ? replacement : [candidate])),
  };
}

/**
 * Settles summaries that were still pending when the app last closed. The agent run that
 * would have completed them can no longer reach this process.
 */
export function settleInterruptedSummaries(library: Library): Library {
  if (!library.summaries.some((summary) => summary.status === 'pending')) return library;
  return { ...library, summaries: library.summaries.flatMap(withoutPendingRun) };
}
