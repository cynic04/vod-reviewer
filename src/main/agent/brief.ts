import { getCharacter } from '@shared/domain/characters';
import type { Library } from '@shared/domain/schema';
import { formatDuration } from '@shared/domain/time';
import { notFound } from '../library/errors';

/**
 * Everything the summarize agent is told about one review session. Built fresh from the
 * library each time the agent asks, so it always reflects the notes as they are now.
 */
export interface SessionBrief {
  game: string;
  matchup: {
    /** The character the user plays, or `null` if they have not set one. */
    player: string | null;
    /** The character they played against, or `null` for a video outside a matchup folder. */
    opponent: string | null;
    /** Name of the custom folder when there is no opponent. */
    folder: string | null;
  };
  video: {
    title: string;
    recordedOn: string;
    length: string | null;
  };
  session: {
    startedAt: string;
  };
  notes: { time: string; text: string }[];
  /** Moments the player flagged: focus points set before reviewing, bookmarks set during. */
  markers: { time: string; kind: 'focus' | 'bookmark'; label: string }[];
}

const byTime = (a: { timeSeconds: number }, b: { timeSeconds: number }): number => a.timeSeconds - b.timeSeconds;

export function buildSessionBrief(library: Library, summaryId: string): SessionBrief {
  const summary = library.summaries.find((candidate) => candidate.id === summaryId);
  if (!summary) throw notFound('Summary', summaryId);

  const session = library.sessions.find((candidate) => candidate.id === summary.sessionId);
  const video = library.videos.find((candidate) => candidate.id === summary.videoId);
  if (!session || !video) throw notFound('Review session', summary.sessionId);

  const folder = library.folders.find((candidate) => candidate.id === video.folderId);
  const opponent = getCharacter(folder?.characterId ?? null);

  return {
    game: 'Guilty Gear -Strive-',
    matchup: {
      player: getCharacter(library.settings.playerCharacterId)?.name ?? null,
      opponent: opponent?.name ?? null,
      folder: opponent ? null : (folder?.name ?? null),
    },
    video: {
      title: video.title,
      recordedOn: video.recordedAt.slice(0, 10),
      length: video.durationSeconds === null ? null : formatDuration(video.durationSeconds),
    },
    session: { startedAt: session.startedAt },
    notes: library.notes
      .filter((note) => note.sessionId === session.id)
      .sort(byTime)
      .map((note) => ({ time: formatDuration(note.timeSeconds), text: note.body })),
    markers: library.timestamps
      .filter((timestamp) => timestamp.videoId === video.id)
      .sort(byTime)
      .map((timestamp) => ({
        time: formatDuration(timestamp.timeSeconds),
        kind: timestamp.kind,
        label: timestamp.label,
      })),
  };
}

/** Ids of the two characters of a summary's matchup; `null` where one is not known. */
export function matchupCharacterIds(
  library: Library,
  summaryId: string,
): { player: string | null; opponent: string | null } {
  const summary = library.summaries.find((candidate) => candidate.id === summaryId);
  if (!summary) throw notFound('Summary', summaryId);

  const video = library.videos.find((candidate) => candidate.id === summary.videoId);
  const folder = library.folders.find((candidate) => candidate.id === video?.folderId);
  return {
    player: getCharacter(library.settings.playerCharacterId)?.id ?? null,
    opponent: getCharacter(folder?.characterId ?? null)?.id ?? null,
  };
}
