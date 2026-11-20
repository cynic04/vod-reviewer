import { useId, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Character } from '@shared/domain/characters';
import type { Folder } from '@shared/domain/schema';
import { formatDuration } from '@shared/domain/time';
import { routes } from '@renderer/app/routes';
import { IconButton } from '@renderer/components/Button';
import { EmptyState } from '@renderer/components/EmptyState';
import { Icon } from '@renderer/components/Icon';
import { Markdown } from '@renderer/components/Markdown';
import { cx } from '@renderer/lib/cx';
import { formatDateTime } from '@renderer/lib/dates';
import { folderLabel, portraitUrl } from '@renderer/features/characters/characters';
import { EmailSummaryButton } from '@renderer/features/email/EmailSummaryButton';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import {
  countNotesNotInSummary,
  selectFolder,
  selectReviewGroups, type ReviewEntry, type ReviewGroup } from '@renderer/store/selectors';
import { reportError } from '@renderer/store/toastStore';
import { SummarizeButton } from './SummarizeButton';
import styles from './ReviewNotesPage.module.css';

/**
 * Every video that has notes, with its AI-written summary, grouped by the character of the
 * matchup. Reached from the top bar for the whole library, or from a folder for that
 * folder alone.
 */
export function ReviewNotesPage() {
  const { folderId } = useParams();
  const folder = selectFolder(useLibrary(), folderId);
  if (folderId !== undefined && !folder) return <Navigate to={routes.reviewNotes()} replace />;
  return <ReviewNotes folder={folder} />;
}

function ReviewNotes({ folder }: { folder: Folder | undefined }) {
  const library = useLibrary();
  const onlyFolderId = folder?.id;
  const groups = useMemo(() => selectReviewGroups(library, onlyFolderId), [library, onlyFolderId]);

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
          <h1>Review notes</h1>
          <p>
            {folder
              ? `Your notes and summary for each video in ${folderLabel(folder)}.`
              : 'Your notes and summary for each video, grouped by matchup.'}
          </p>
          {folder && (
            <Link to={routes.reviewNotes()} className={styles.allLink}>
              All matchups <Icon name="arrowRight" size={14} />
            </Link>
          )}
        </div>
      </header>

      {groups.length === 0 ? (
        <EmptyState icon="notebook" title="No review notes yet">
          Review a video and write some notes, then press Summarize in the notes panel. Each video's notes
          and summary will be collected here.
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

function GroupSection({ group, showHeading }: { group: ReviewGroup; showHeading: boolean }) {
  const portrait = portraitUrl(group.character?.id ?? null);
  const headingId = `group-${group.key}`;
  const entriesId = `group-${group.key}-videos`;
  // Characters start folded, so the page opens as a list of matchups. A page that shows
  // a single matchup has no heading to fold under and lists its videos directly.
  const [isOpen, setIsOpen] = useState(false);
  const showEntries = !showHeading || isOpen;

  return (
    <section className={styles.group} aria-labelledby={showHeading ? headingId : undefined}>
      {showHeading && (
        <header className={cx(styles.groupHeader, isOpen && styles.groupOpen)}>
          <h2 id={headingId}>
            <button
              type="button"
              className={styles.groupToggle}
              aria-expanded={isOpen}
              aria-controls={entriesId}
              onClick={() => setIsOpen((open) => !open)}
            >
              <Icon name="chevronDown" size={22} className={cx(styles.chevron, !isOpen && styles.chevronCollapsed)} />
              <span className={styles.groupArt}>
                {portrait ? <img src={portrait} alt="" /> : <Icon name="folder" size={22} />}
              </span>
              <span>{groupName(group.character)}</span>
            </button>
          </h2>
          <span className={styles.groupCount}>
            {group.entries.length === 1 ? '1 video' : `${group.entries.length} videos`}
          </span>
        </header>
      )}
      <ol className={styles.entries} id={entriesId} hidden={!showEntries}>
        {group.entries.map((entry) => (
          <li key={entry.video.id}>
            <ReviewCard entry={entry} showFolder={group.character === null} />
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReviewCard({ entry, showFolder }: { entry: ReviewEntry; showFolder: boolean }) {
  const removeSummary = useLibraryStore((state) => state.removeSummary);
  const { video, folder, notes, summary, lastNoteAt } = entry;
  const notInSummary = countNotesNotInSummary(notes, summary);
  const isPending = summary?.status === 'pending';
  const hasText = summary !== undefined && summary.markdown !== '';
  // Cards start folded so the page reads as a list of videos; open the one you want.
  const [isOpen, setIsOpen] = useState(false);
  const bodyId = useId();

  return (
    <article className={cx(styles.card, isOpen && styles.cardOpen)}>
      <header className={styles.cardHeader}>
        <button
          type="button"
          className={styles.cardToggle}
          aria-expanded={isOpen}
          aria-controls={bodyId}
          aria-label={`${isOpen ? 'Hide' : 'Show'} notes for ${video.title}`}
          title={isOpen ? 'Collapse' : 'Expand'}
          onClick={() => setIsOpen((open) => !open)}
        >
          <Icon name="chevronDown" size={20} className={cx(styles.chevron, !isOpen && styles.chevronCollapsed)} />
        </button>
        <div className={styles.cardTitle}>
          <h3>
            <Link to={routes.review(video.id)}>{video.title}</Link>
          </h3>
          <p>
            {showFolder && <span className={styles.folderName}>{folder.name}</span>}
            <span>Last note {formatDateTime(lastNoteAt)}</span>
            <span>{notes.length === 1 ? '1 note' : `${notes.length} notes`}</span>
            {summary?.completedAt && (
              <span>
                Summarized {formatDateTime(summary.completedAt)} with {summary.model}
              </span>
            )}
            {!isPending && notInSummary > 0 && (
              <span className={styles.outdated}>
                {notInSummary === 1 ? '1 note' : `${notInSummary} notes`} not in the summary yet
              </span>
            )}
          </p>
        </div>
        <div className={styles.cardActions}>
          {summary && <EmailSummaryButton summary={summary} />}
          <SummarizeButton videoId={video.id} summary={summary} variant={summary ? 'secondary' : 'primary'} />
          {summary && (
            <IconButton
              icon={isPending ? 'close' : 'trash'}
              label={isPending ? 'Cancel summary' : 'Delete summary'}
              onClick={() => void removeSummary(summary.id).catch(reportError)}
            />
          )}
        </div>
      </header>

      <div id={bodyId} hidden={!isOpen}>
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
      </div>
    </article>
  );
}
