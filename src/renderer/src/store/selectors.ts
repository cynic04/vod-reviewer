import { CHARACTERS, getCharacter, type Character } from '@shared/domain/characters';
import type {
  Folder,
  Library,
  Note,
  ReviewSession,
  SessionSummary,
  Timestamp,
  Video,
} from '@shared/domain/schema';

/** Pure read-side queries over the normalised library. */

const byTime = <T extends { timeSeconds: number; createdAt: string }>(a: T, b: T): number =>
  a.timeSeconds - b.timeSeconds || a.createdAt.localeCompare(b.createdAt);

export function selectVideo(library: Library, videoId: string | undefined): Video | undefined {
  return library.videos.find((video) => video.id === videoId);
}

export function selectFolder(library: Library, folderId: string | undefined): Folder | undefined {
  return library.folders.find((folder) => folder.id === folderId);
}

/** Videos of a folder, most recently recorded first. */
export function selectVideosInFolder(library: Library, folderId: string): Video[] {
  return library.videos
    .filter((video) => video.folderId === folderId)
    .sort((a, b) => b.recordedAt.localeCompare(a.recordedAt));
}

export function selectTimestamps(library: Library, videoId: string): Timestamp[] {
  return library.timestamps.filter((timestamp) => timestamp.videoId === videoId).sort(byTime);
}

export function selectNotes(library: Library, videoId: string): Note[] {
  return library.notes.filter((note) => note.videoId === videoId).sort(byTime);
}

export function selectSessionsById(library: Library, videoId: string): Map<string, ReviewSession> {
  return new Map(
    library.sessions.filter((session) => session.videoId === videoId).map((session) => [session.id, session]),
  );
}

export interface FolderSummary {
  folder: Folder;
  videoCount: number;
  /** `recordedAt` of the newest video in the folder. */
  latestRecordedAt: string | null;
}

export function selectFolderSummaries(library: Library): FolderSummary[] {
  const summaries = new Map<string, FolderSummary>(
    library.folders.map((folder) => [folder.id, { folder, videoCount: 0, latestRecordedAt: null }]),
  );
  for (const video of library.videos) {
    const summary = summaries.get(video.folderId);
    if (!summary) continue;
    summary.videoCount += 1;
    if (summary.latestRecordedAt === null || video.recordedAt > summary.latestRecordedAt) {
      summary.latestRecordedAt = video.recordedAt;
    }
  }
  return [...summaries.values()];
}

export interface AnnotationCounts {
  notes: number;
  timestamps: number;
}

export function selectAnnotationCounts(library: Library): Map<string, AnnotationCounts> {
  const counts = new Map<string, AnnotationCounts>();
  const entry = (videoId: string): AnnotationCounts => {
    let current = counts.get(videoId);
    if (!current) {
      current = { notes: 0, timestamps: 0 };
      counts.set(videoId, current);
    }
    return current;
  };
  for (const note of library.notes) entry(note.videoId).notes += 1;
  for (const timestamp of library.timestamps) entry(timestamp.videoId).timestamps += 1;
  return counts;
}

export function selectSummaryForSession(library: Library, sessionId: string | null): SessionSummary | undefined {
  return sessionId === null ? undefined : library.summaries.find((summary) => summary.sessionId === sessionId);
}

/** One review session with everything the session notes view shows about it. */
export interface SessionEntry {
  session: ReviewSession;
  video: Video;
  folder: Folder;
  /** Sorted by position in the video. */
  notes: Note[];
  summary: SessionSummary | undefined;
}

export interface SessionGroup {
  key: string;
  /** `null` for the "Miscellaneous" group: sessions on videos that are not filed under a matchup. */
  character: Character | null;
  /** Newest session first. */
  entries: SessionEntry[];
}

const MISCELLANEOUS_KEY = 'miscellaneous';

/**
 * Review sessions grouped by the character of their matchup, in roster order, with
 * everything else under "Miscellaneous" at the end. Pass `folderId` to keep one folder only.
 */
export function selectSessionGroups(library: Library, folderId?: string): SessionGroup[] {
  const videos = new Map(library.videos.map((video) => [video.id, video]));
  const folders = new Map(library.folders.map((folder) => [folder.id, folder]));
  const summaries = new Map(library.summaries.map((summary) => [summary.sessionId, summary]));
  const notesBySession = new Map<string, Note[]>();
  for (const note of library.notes) {
    const notes = notesBySession.get(note.sessionId);
    if (notes) notes.push(note);
    else notesBySession.set(note.sessionId, [note]);
  }

  const entriesByGroup = new Map<string, SessionEntry[]>();
  for (const session of library.sessions) {
    const video = videos.get(session.videoId);
    const folder = video && folders.get(video.folderId);
    if (!video || !folder || (folderId !== undefined && folder.id !== folderId)) continue;

    const key = getCharacter(folder.characterId)?.id ?? MISCELLANEOUS_KEY;
    const entry: SessionEntry = {
      session,
      video,
      folder,
      notes: (notesBySession.get(session.id) ?? []).sort(byTime),
      summary: summaries.get(session.id),
    };
    const entries = entriesByGroup.get(key);
    if (entries) entries.push(entry);
    else entriesByGroup.set(key, [entry]);
  }

  const newestFirst = (a: SessionEntry, b: SessionEntry): number =>
    b.session.startedAt.localeCompare(a.session.startedAt);

  const groups: SessionGroup[] = [];
  for (const character of CHARACTERS) {
    const entries = entriesByGroup.get(character.id);
    if (entries) groups.push({ key: character.id, character, entries: entries.sort(newestFirst) });
  }
  const miscellaneous = entriesByGroup.get(MISCELLANEOUS_KEY);
  if (miscellaneous) {
    groups.push({ key: MISCELLANEOUS_KEY, character: null, entries: miscellaneous.sort(newestFirst) });
  }
  return groups;
}
