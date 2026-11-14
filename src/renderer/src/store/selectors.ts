import type { Folder, Library, Note, ReviewSession, Timestamp, Video } from '@shared/domain/schema';

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
