import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Note, Timestamp, VideoSummary } from '@shared/domain/schema';
import { formatTimecode } from '@shared/domain/time';
import { Button, IconButton } from '@renderer/components/Button';
import { Icon } from '@renderer/components/Icon';
import { cx } from '@renderer/lib/cx';
import { formatDateTime } from '@renderer/lib/dates';
import { useActiveItemId, type Player } from '@renderer/features/player/usePlayer';
import { SummarizeButton } from '@renderer/features/review-notes/SummarizeButton';
import { countNotesNotInSummary } from '@renderer/store/selectors';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError } from '@renderer/store/toastStore';
import { groupNotesByTimestamp } from './noteGroups';
import { LiveTimecode } from './TimestampComposer';
import styles from './annotations.module.css';

interface NotesPanelProps {
  videoId: string;
  /** Sorted by time. */
  notes: readonly Note[];
  /** The video's timestamps, sorted by time. When there are any, notes are grouped under them. */
  timestamps: readonly Timestamp[];
  player: Player;
  /** Increment to move keyboard focus into the composer. */
  focusRequest: number;
  /** Summary of this video's notes, if one was requested. */
  summary: VideoSummary | undefined;
  /** Where the notes and summaries of this video's folder are shown. */
  reviewNotesHref: string;
}

export function NotesPanel({
  videoId,
  notes,
  player,
  focusRequest,
  summary,
  reviewNotesHref,
  timestamps,
}: NotesPanelProps) {
  const notInSummary = countNotesNotInSummary(notes, summary);

  return (
    <div className={styles.panel}>
      <NoteComposer videoId={videoId} player={player} focusRequest={focusRequest} />

      <div className={styles.summaryBar}>
        <p>
          {notes.length === 0 ? (
            'Every note on this video goes into one summary.'
          ) : summary?.status === 'pending' ? (
            <span role="status">Copilot is summarizing these notes in the terminal window.</span>
          ) : (
            <>
              <strong>{notes.length === 1 ? '1 note' : `${notes.length} notes`}</strong>
              {summary && (notInSummary === 0 ? ' - summarized' : ` - ${notInSummary} not in the summary yet`)}
            </>
          )}
        </p>
        <div className={styles.summaryActions}>
          <Link to={reviewNotesHref} className={styles.summaryLink}>
            {summary?.status === 'ready' ? 'View summary' : 'Review notes'}
          </Link>
          {notes.length > 0 && <SummarizeButton videoId={videoId} summary={summary} />}
        </div>
      </div>

      {notes.length === 0 ? (
        <p className={styles.empty}>
          No notes yet. Pause on a moment worth remembering and write down what happened.
        </p>
      ) : (
        <NoteList notes={notes} timestamps={timestamps} player={player} />

      )}
    </div>
  );
}

type NoteListProps = Pick<NotesPanelProps, 'notes' | 'timestamps' | 'player'>;

/**
 * The notes, in video order. When the video has timestamps they divide the list into
 * collapsible sections, one per timestamp, so a long review can be folded down to the
 * part being worked on.
 */
function NoteList({ notes, timestamps, player }: NoteListProps) {
  const activeId = useActiveItemId(player, notes);
  const groups = useMemo(() => groupNotesByTimestamp(notes, timestamps), [notes, timestamps]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const renderNotes = (items: readonly Note[], id?: string) => (
    <ol className={styles.list} id={id}>
      {items.map((note) => (
        <NoteItem key={note.id} note={note} isActive={note.id === activeId} onJump={player.seek} />

      ))}
    </ol>
  );

  if (timestamps.length === 0) return renderNotes(notes);

  const allCollapsed = groups.every((group) => collapsed.has(group.key));
  const toggle = (key: string): void =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });

  return (
    <div className={styles.groups}>
      <button
        type="button"
        className={styles.groupsToggle}
        onClick={() => setCollapsed(allCollapsed ? new Set() : new Set(groups.map((group) => group.key)))}
      >
        {allCollapsed ? 'Expand all' : 'Collapse all'}
      </button>

      {groups.map((group) => {
        const { key, timestamp } = group;
        const isCollapsed = collapsed.has(key);
        const containsActive = group.notes.some((note) => note.id === activeId);
        const label = timestamp
          ? timestamp.label || (timestamp.kind === 'focus' ? 'Focus point' : 'Timestamp')
          : 'Before the first timestamp';
        const listId = `notes-${key}`;

        return (
          <section key={key} className={styles.group}>
            <header className={cx(styles.groupHeader, containsActive && styles.groupActive)}>
              <button
                type="button"
                className={styles.groupToggle}
                aria-expanded={!isCollapsed}
                aria-controls={listId}
                onClick={() => toggle(key)}
              >
                <Icon name="chevronDown" size={16} className={cx(styles.chevron, isCollapsed && styles.chevronCollapsed)} />
                <span className={styles.groupLabel}>{label}</span>
                <span className={styles.groupCount}>{group.notes.length}</span>
              </button>
              {timestamp && (
                <button
                  type="button"
                  className={cx(styles.timeChip, timestamp.kind === 'focus' && styles.focusChip)}
                  aria-label={`Jump to ${label} at ${formatTimecode(timestamp.timeSeconds)}`}
                  title="Click to jump"
                  onClick={() => player.seek(timestamp.timeSeconds)}
                >
                  {formatTimecode(timestamp.timeSeconds)}
                </button>
              )}
            </header>
            {!isCollapsed && renderNotes(group.notes, listId)}
          </section>
        );
      })}
    </div>
  );
}

type NoteComposerProps = Pick<NotesPanelProps, 'videoId' | 'player' | 'focusRequest'>;

function NoteComposer({ videoId, player, focusRequest }: NoteComposerProps) {
  const createNote = useLibraryStore((state) => state.createNote);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [body, setBody] = useState('');
  /** The moment the note is about: where the playhead was when typing began. */
  const [pinnedTime, setPinnedTime] = useState<number | null>(null);

  useEffect(() => {
    if (focusRequest > 0) textareaRef.current?.focus();
  }, [focusRequest]);

  const onChange = (value: string): void => {
    if (pinnedTime === null && value.trim() !== '') setPinnedTime(player.getCurrentTime());
    if (value.trim() === '') setPinnedTime(null);
    setBody(value);
  };

  const save = (): void => {
    const trimmed = body.trim();
    if (trimmed === '') return;
    createNote({ videoId, body: trimmed, timeSeconds: pinnedTime ?? player.getCurrentTime() })
      .then(() => {
        setBody('');
        setPinnedTime(null);
      })
      .catch(reportError);
  };

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    save();
  };

  return (
    <form className={styles.noteComposer} onSubmit={onSubmit}>
      <label htmlFor="note-body" className={styles.composerLabel}>
        Note at{' '}
        <span className={styles.mono}>
          {pinnedTime === null ? <LiveTimecode player={player} /> : formatTimecode(pinnedTime)}
        </span>
      </label>
      <textarea
        id="note-body"
        ref={textareaRef}
        rows={3}
        value={body}
        maxLength={5000}
        placeholder="What happened here? What should you do next time?"
        // Writing about a moment means looking at it: hold the frame while typing.
        onFocus={player.pause}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) save();
          if (event.key === 'Escape') event.currentTarget.blur();
        }}
      />
      <div className={styles.composerActions}>
        <span className={styles.hint}>Ctrl + Enter to save</span>
        <Button type="submit" variant="primary" icon="note" disabled={body.trim() === ''}>
          Save note
        </Button>
      </div>
    </form>
  );
}

interface NoteItemProps {
  note: Note;
  isActive: boolean;
  onJump: (timeSeconds: number) => void;
}

function NoteItem({ note, isActive, onJump }: NoteItemProps) {
  const updateNote = useLibraryStore((state) => state.updateNote);
  const removeNote = useLibraryStore((state) => state.removeNote);
  const [draft, setDraft] = useState<string | null>(null);
  const timecode = formatTimecode(note.timeSeconds);

  const saveDraft = (): void => {
    const body = draft?.trim() ?? '';
    if (body === '' || body === note.body) {
      setDraft(null);
      return;
    }
    updateNote(note.id, body)
      .then(() => setDraft(null))
      .catch(reportError);
  };

  return (
    <li className={cx(styles.item, styles.noteItem, isActive && styles.active)}>
      <div className={styles.noteHeader}>
        <button
          type="button"
          className={styles.timeChip}
          aria-label={`Jump to note at ${timecode}`}
          title="Click to jump"
          onClick={() => onJump(note.timeSeconds)}
        >
          {timecode}
        </button>
        <span className={styles.noteDate} title="When this note was written">
          {formatDateTime(note.createdAt)}
        </span>
        {draft === null && (
          <>
            <IconButton icon="edit" label={`Edit note at ${timecode}`} size={16} onClick={() => setDraft(note.body)} />
            <IconButton
              icon="trash"
              label={`Delete note at ${timecode}`}
              size={16}
              onClick={() => void removeNote(note.id).catch(reportError)}
            />
          </>
        )}
      </div>

      {draft === null ? (
        <p className={styles.noteBody}>{note.body}</p>
      ) : (
        <div className={styles.noteEditor}>
          <textarea
            rows={3}
            value={draft}
            maxLength={5000}
            autoFocus
            aria-label={`Edit note at ${timecode}`}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) saveDraft();
              if (event.key === 'Escape') setDraft(null);
            }}
          />
          <div className={styles.composerActions}>
            <Button variant="ghost" onClick={() => setDraft(null)}>
              Cancel
            </Button>
            <Button variant="primary" onClick={saveDraft}>
              Save
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
