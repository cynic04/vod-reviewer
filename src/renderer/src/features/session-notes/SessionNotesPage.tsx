import { useMemo } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Character } from '@shared/domain/characters';
import type { Folder } from '@shared/domain/schema';
import { formatDuration } from '@shared/domain/time';
import { routes } from '@renderer/app/routes';
import { IconButton } from '@renderer/components/Button';
import { EmptyState } from '@renderer/components/EmptyState';
import { Icon } from '@renderer/components/Icon';
import { Markdown } from '@renderer/components/Markdown';
import { formatDateTime } from '@renderer/lib/dates';
import { folderLabel, portraitUrl } from '@renderer/features/characters/characters';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { selectFolder, selectSessionGroups, type SessionEntry, type SessionGroup } from '@renderer/store/selectors';
import { reportError } from '@renderer/store/toastStore';
import { SummarizeButton } from './SummarizeButton';
import styles from './SessionNotesPage.module.css';

/**
 * Every review session and its AI-written summary, grouped by the character of the
 * matchup. Reached from the top bar for the whole library, or from a folder for that
 * folder alone.
 */
export function SessionNotesPage() {
  const { folderId } = useParams();
  const folder = selectFolder(useLibrary(), folderId);
  if (folderId !== undefined && !folder) return <Navigate to={routes.sessionNotes()} replace />;
  return <SessionNotes folder={folder} />;
}

function SessionNotes({ folder }: { folder: Folder | undefined }) {
  const library = useLibrary();
  const onlyFolderId = folder?.id;
  const groups = useMemo(() => selectSessionGroups(library, onlyFolderId), [library, onlyFolderId]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        {folder ? (
          <Link to={routes.folder(folder.id)} className={styles.back}>
            <Icon name="arrowLeft" size={16} /> {folderLabel(folder)}
          </Link>
        ) : (
          <Link to={routes.library()} className={styles.back}>
            <Icon name="arrowLeft" size={16} /> Library
          </Link>
        )}
        <div className={styles.title}>
          <h1>Session notes</h1>
          <p>
            {folder
              ? `What you took away from each review in ${folderLabel(folder)}.`
              : 'What you took away from each review, grouped by matchup.'}
          </p>
          {folder && (
            <Link to={routes.sessionNotes()} className={styles.allLink}>
              All matchups <Icon name="arrowRight" size={14} />
            </Link>
          )}
        </div>
      </header>

      {groups.length === 0 ? (
        <EmptyState icon="notebook" title="No session notes yet">
          Review a video and write some notes, then press Summarize in the notes panel. Each review session
          and its summary will be collected here.
        </EmptyState>
      ) : (
        groups.map((group) => <GroupSection key={group.key} group={group} showHeading={!folder?.characterId} />)
      )}
    </div>
  );
}

function groupName(character: Character | null): string {
  return character ? `vs. ${character.name}` : 'Miscellaneous';
}

function GroupSection({ group, showHeading }: { group: SessionGroup; showHeading: boolean }) {
  const portrait = portraitUrl(group.character?.id ?? null);
  const headingId = `group-${group.key}`;

  return (
    <section className={styles.group} aria-labelledby={showHeading ? headingId : undefined}>
      {showHeading && (
        <header className={styles.groupHeader}>
          <span className={styles.groupArt}>
            {portrait ? <img src={portrait} alt="" /> : <Icon name="folder" size={22} />}
          </span>
          <h2 id={headingId}>{groupName(group.character)}</h2>
          <span className={styles.groupCount}>
            {group.entries.length === 1 ? '1 session' : `${group.entries.length} sessions`}
          </span>
        </header>
      )}
      <ol className={styles.entries}>
        {group.entries.map((entry) => (
          <li key={entry.session.id}>
            <SessionCard entry={entry} showFolder={group.character === null} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function SessionCard({ entry, showFolder }: { entry: SessionEntry; showFolder: boolean }) {
  const removeSummary = useLibraryStore((state) => state.removeSummary);
  const { session, video, folder, notes, summary } = entry;
  const isPending = summary?.status === 'pending';
  const hasText = summary !== undefined && summary.markdown !== '';

  return (
    <article className={styles.card}>
      <header className={styles.cardHeader}>
        <div className={styles.cardTitle}>
          <h3>
            <Link to={routes.review(video.id)}>{video.title}</Link>
          </h3>
          <p>
            {showFolder && <span className={styles.folderName}>{folder.name}</span>}
            <span>Reviewed {formatDateTime(session.startedAt)}</span>
            <span>{notes.length === 1 ? '1 note' : `${notes.length} notes`}</span>
            {summary?.completedAt && (
              <span>
                Summarized {formatDateTime(summary.completedAt)} with {summary.model}
              </span>
            )}
          </p>
        </div>
        <div className={styles.cardActions}>
          <SummarizeButton sessionId={session.id} summary={summary} variant={summary ? 'secondary' : 'primary'} />
          {summary && (
            <IconButton
              icon={isPending ? 'close' : 'trash'}
              label={isPending ? 'Cancel summary' : 'Delete summary'}
              onClick={() => void removeSummary(summary.id).catch(reportError)}
            />
          )}
        </div>
      </header>

      {isPending && (
        <p className={styles.pending} role="status">
          <span className={styles.pulse} aria-hidden="true" />
          {hasText
            ? 'A new summary is being written in the terminal window. This is the previous one.'
            : 'GitHub Copilot is writing this summary in the terminal window. It will appear here when it is saved.'}
        </p>
      )}

      {hasText ? (
        <div className={styles.summary}>
          <Markdown>{summary.markdown}</Markdown>
        </div>
      ) : (
        !isPending && <p className={styles.unsummarized}>Not summarized yet.</p>
      )}

      <details className={styles.notes}>
        <summary>Your notes ({notes.length})</summary>
        <ul>
          {notes.map((note) => (
            <li key={note.id}>
              <span className={styles.noteTime}>{formatDuration(note.timeSeconds)}</span>
              <span className={styles.noteBody}>{note.body}</span>
            </li>
          ))}
        </ul>
      </details>
    </article>
  );
}
