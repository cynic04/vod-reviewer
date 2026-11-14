import { useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Link } from 'react-router-dom';
import type { Note, ReviewSession, SessionSummary, Timestamp } from '@shared/domain/schema';
import { formatTimecode } from '@shared/domain/time';
import { Button, IconButton } from '@renderer/components/Button';
import { Icon } from '@renderer/components/Icon';
import { cx } from '@renderer/lib/cx';
import { formatDateTime } from '@renderer/lib/dates';
import { useActiveItemId, type Player } from '@renderer/features/player/usePlayer';
import { SummarizeButton } from '@renderer/features/session-notes/SummarizeButton';
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
  sessions: ReadonlyMap<string, ReviewSession>;
  /** The session notes are currently being added to, or `null` before the first note. */
  currentSessionId: string | null;
  onSessionStarted: (sessionId: string) => void;
  player: Player;
  /** Increment to move keyboard focus into the composer. */
  focusRequest: number;
  /** Summary of the current session, if one was requested. */
  summary: SessionSummary | undefined;
  /** Where the session notes of this video's folder are shown. */
  sessionNotesHref: string;
}

export function NotesPanel({
  videoId,
  notes,
  sessions,
  currentSessionId,
  onSessionStarted,
  player,
  focusRequest,
  summary,
  sessionNotesHref,
  timestamps,
}: NotesPanelProps) {
  const sessionNoteCount = notes.filter((note) => note.sessionId === currentSessionId).length;

  return (
    <div className={styles.panel}>
      <NoteComposer
        videoId={videoId}
        sessionId={currentSessionId}
        onSessionStarted={onSessionStarted}
        player={player}
        focusRequest={focusRequest}
      />

      <div className={styles.sessionBar}>
        <p>
          {currentSessionId === null ? (
            'Notes you write now start a new session.'
          ) : summary?.status === 'pending' ? (
            <span role="status">Copilot is summarizing this session in the terminal window.</span>
          ) : (
            <>
              <strong>This session:</strong> {sessionNoteCount === 1 ? '1 note' : `${sessionNoteCount} notes`}
              {summary && ' - summarized'}
            </>
          )}
        </p>
        <div className={styles.sessionActions}>
          <Link to={sessionNotesHref} className={styles.sessionLink}>
            {summary?.status === 'ready' ? 'View summary' : 'Session notes'}
          </Link>
          {currentSessionId !== null && <SummarizeButton sessionId={currentSessionId} summary={summary} />}
        </div>
      </div>

      {notes.length === 0 ? (
        <p className={styles.empty}>
          No notes yet. Pause on a moment worth remembering and write down what happened.
        </p>
      ) : (
        <NoteList
          notes={notes}
          timestamps={timestamps}
          sessions={sessions}
          currentSessionId={currentSessionId}
          player={player}
        />
      )}
    </div>
  );
}

type NoteListProps = Pick<NotesPanelProps, 'notes' | 'timestamps' | 'sessions' | 'currentSessionId' | 'player'>;

/**
 * The notes, in video order. When the video has timestamps they divide the list into
 * collapsible sections, one per timestamp, so a long review can be folded down to the
 * part being worked on.
 */
function NoteList({ notes, timestamps, sessions, currentSessionId, player }: NoteListProps) {
  const activeId = useActiveItemId(player, notes);
  const groups = useMemo(() => groupNotesByTimestamp(notes, timestamps), [notes, timestamps]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(() => new Set());

  const renderNotes = (items: readonly Note[], id?: string) => (
    <ol className={styles.list} id={id}>
      {items.map((note) => (
        <NoteItem
          key={note.id}
          note={note}
          session={sessions.get(note.sessionId)}
          isCurrentSession={note.sessionId === currentSessionId}
          isActive={note.id === activeId}
          onJump={player.seek}
        />
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

interface NoteComposerProps
  extends Pick<NotesPanelProps, 'videoId' | 'onSessionStarted' | 'player' | 'focusRequest'> {
  sessionId: string | null;
}

function NoteComposer({ videoId, sessionId, onSessionStarted, player, focusRequest }: NoteComposerProps) {
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
    createNote({ videoId, sessionId, body: trimmed, timeSeconds: pinnedTime ?? player.getCurrentTime() })
      .then((note) => {
        setBody('');
        setPinnedTime(null);
        onSessionStarted(note.sessionId);
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
  session: ReviewSession | undefined;
  isCurrentSession: boolean;
  isActive: boolean;
  onJump: (timeSeconds: number) => void;
}

function NoteItem({ note, session, isCurrentSession, isActive, onJump }: NoteItemProps) {
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
        <span className={cx(styles.session, isCurrentSession && styles.currentSession)}>
          {isCurrentSession ? 'This session' : session ? `Session ${formatDateTime(session.startedAt)}` : ''}
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
