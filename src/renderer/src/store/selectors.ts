import { CHARACTERS, getCharacter, type Character } from '@shared/domain/characters';
import type {
  Folder,
  Library,
  Note,
  Timestamp,
  Video,
  VideoSummary,
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

export function selectSummaryForVideo(library: Library, videoId: string): VideoSummary | undefined {
  return library.summaries.find((summary) => summary.videoId === videoId);
}

/** How many notes were written or edited after the summary was asked for, so are not in it. */
export function countNotesNotInSummary(notes: readonly Note[], summary: VideoSummary | undefined): number {
  if (!summary) return 0;
  return notes.filter((note) => note.updatedAt > summary.requestedAt).length;
}

/** One reviewed video with everything the review notes view shows about it. */
export interface ReviewEntry {
  video: Video;
  folder: Folder;
  /** Every note on the video, sorted by position in it. Never empty. */
  notes: Note[];
  summary: VideoSummary | undefined;
  /** When the newest note was written. */
  lastNoteAt: string;
}

export interface ReviewGroup {
  key: string;
  /** `null` for the "Miscellaneous" group: videos that are not filed under a matchup. */
  character: Character | null;
  /** Most recently annotated video first. */
  entries: ReviewEntry[];
}

const MISCELLANEOUS_KEY = 'miscellaneous';

/**
 * Videos that have notes, grouped by the character of their matchup, in roster order,
 * with everything else under "Miscellaneous" at the end. Pass `folderId` to keep one
 * folder only.
 */
export function selectReviewGroups(library: Library, folderId?: string): ReviewGroup[] {
  const folders = new Map(library.folders.map((folder) => [folder.id, folder]));
  const summaries = new Map(library.summaries.map((summary) => [summary.videoId, summary]));
  const notesByVideo = new Map<string, Note[]>();
  for (const note of library.notes) {
    const notes = notesByVideo.get(note.videoId);
    if (notes) notes.push(note);
    else notesByVideo.set(note.videoId, [note]);
  }

  const entriesByGroup = new Map<string, ReviewEntry[]>();
  for (const video of library.videos) {
    const notes = notesByVideo.get(video.id);
    const folder = folders.get(video.folderId);
    if (!notes || !folder || (folderId !== undefined && folder.id !== folderId)) continue;

    const key = getCharacter(folder.characterId)?.id ?? MISCELLANEOUS_KEY;
    const entry: ReviewEntry = {
      video,
      folder,
      notes: notes.sort(byTime),
      summary: summaries.get(video.id),
      lastNoteAt: notes.reduce((latest, note) => (note.createdAt > latest ? note.createdAt : latest), ''),
    };
    const entries = entriesByGroup.get(key);
    if (entries) entries.push(entry);
    else entriesByGroup.set(key, [entry]);
  }

  const newestFirst = (a: ReviewEntry, b: ReviewEntry): number => b.lastNoteAt.localeCompare(a.lastNoteAt);

  const groups: ReviewGroup[] = [];
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