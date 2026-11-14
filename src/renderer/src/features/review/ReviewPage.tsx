import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { Video } from '@shared/domain/schema';
import { routes } from '@renderer/app/routes';
import { Icon } from '@renderer/components/Icon';
import { cx } from '@renderer/lib/cx';
import { NotesPanel } from '@renderer/features/annotations/NotesPanel';
import { TimestampComposer } from '@renderer/features/annotations/TimestampComposer';
import { TimestampList } from '@renderer/features/annotations/TimestampList';
import { toTimelineMarkers } from '@renderer/features/player/markers';
import { PlayerSurface } from '@renderer/features/player/PlayerSurface';
import { usePlayerShortcuts, type ShortcutMap } from '@renderer/features/player/usePlayerShortcuts';
import { useVideoWorkspace } from '@renderer/features/player/useVideoWorkspace';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import {
  selectFolder,
  selectNotes,
  selectSessionsById,
  selectSummaryForSession,
  selectTimestamps,
  selectVideo,
} from '@renderer/store/selectors';
import { reportError } from '@renderer/store/toastStore';
import { ShortcutHelp } from './ShortcutHelp';
import { WorkspaceLayout } from './WorkspaceLayout';
import styles from './ReviewPage.module.css';

const REVIEW_SHORTCUTS = [
  { keys: 'M', action: 'Add a timestamp here' },
  { keys: 'N', action: 'Write a note here' },
];

type SidebarTab = 'notes' | 'timestamps';

export function ReviewPage() {
  const { videoId } = useParams();
  const video = selectVideo(useLibrary(), videoId);
  if (!video) return <Navigate to={routes.library()} replace />;
  // Keyed so that switching videos starts from a clean player and a new review session.
  return <ReviewWorkspace key={video.id} video={video} />;
}

function ReviewWorkspace({ video }: { video: Video }) {
  const library = useLibrary();
  const createTimestamp = useLibraryStore((state) => state.createTimestamp);
  const workspace = useVideoWorkspace(video);
  const { player, zoom } = workspace;

  const folder = selectFolder(library, video.folderId);
  const timestamps = useMemo(() => selectTimestamps(library, video.id), [library, video.id]);
  const notes = useMemo(() => selectNotes(library, video.id), [library, video.id]);
  const sessions = useMemo(() => selectSessionsById(library, video.id), [library, video.id]);
  const markers = useMemo(() => toTimelineMarkers(timestamps, notes), [timestamps, notes]);

  const [tab, setTab] = useState<SidebarTab>('notes');
  const [noteFocusRequest, setNoteFocusRequest] = useState(0);
  const [startedSessionId, setStartedSessionId] = useState<string | null>(null);
  // A session disappears when its last note is deleted; the next note then opens a new one.
  const currentSessionId = startedSessionId !== null && sessions.has(startedSessionId) ? startedSessionId : null;

  // Open on the first focus point: that is where the user said the review should start.
  const hasJumpedToFocus = useRef(false);
  useEffect(() => {
    if (!player.state.isReady || hasJumpedToFocus.current) return;
    hasJumpedToFocus.current = true;
    const firstFocus = timestamps.find((timestamp) => timestamp.kind === 'focus');
    if (firstFocus) player.seek(firstFocus.timeSeconds);
  }, [player, timestamps]);

  const { getCurrentTime } = player;
  const shortcuts = useMemo<ShortcutMap>(
    () => ({
      m: () => {
        setTab('timestamps');
        void createTimestamp({
          videoId: video.id,
          kind: 'bookmark',
          label: '',
          timeSeconds: getCurrentTime(),
        }).catch(reportError);
      },
      n: () => {
        setTab('notes');
        setNoteFocusRequest((count) => count + 1);
      },
    }),
    [createTimestamp, getCurrentTime, video.id],
  );
  usePlayerShortcuts(player, zoom, shortcuts);

  return (
    <WorkspaceLayout
      video={video}
      folder={folder}
      actions={
        <>
          <Link to={routes.focus(video.id)} className={styles.headerLink}>
            <Icon name="flag" size={16} /> Edit focus points
          </Link>
          <ShortcutHelp extra={REVIEW_SHORTCUTS} />
        </>
      }
      sidebar={
        <>
          <div className={styles.tabs} role="tablist" aria-label="Review tools">
            <TabButton id="notes" current={tab} count={notes.length} onSelect={setTab}>
              Notes
            </TabButton>
            <TabButton id="timestamps" current={tab} count={timestamps.length} onSelect={setTab}>
              Timestamps
            </TabButton>
          </div>

          <div
            className={styles.tabPanel}
            role="tabpanel"
            id="panel-notes"
            aria-labelledby="tab-notes"
            hidden={tab !== 'notes'}
          >
            <NotesPanel
              videoId={video.id}
              notes={notes}
              timestamps={timestamps}
              sessions={sessions}
              currentSessionId={currentSessionId}
              onSessionStarted={setStartedSessionId}
              player={player}
              focusRequest={noteFocusRequest}
              summary={selectSummaryForSession(library, currentSessionId)}
              sessionNotesHref={routes.sessionNotes(video.folderId)}
            />
          </div>

          <div
            className={styles.tabPanel}
            role="tabpanel"
            id="panel-timestamps"
            aria-labelledby="tab-timestamps"
            hidden={tab !== 'timestamps'}
          >
            <TimestampComposer videoId={video.id} kind="bookmark" player={player} actionLabel="Timestamp" />
            <TimestampList
              timestamps={timestamps}
              player={player}
              emptyMessage="No timestamps yet. Press M at any moment to mark it, then click it here to jump back."
            />
          </div>
        </>
      }
    >
      <PlayerSurface workspace={workspace} markers={markers} />
    </WorkspaceLayout>
  );
}

interface TabButtonProps {
  id: SidebarTab;
  current: SidebarTab;
  count: number;
  onSelect: (tab: SidebarTab) => void;
  children: string;
}

function TabButton({ id, current, count, onSelect, children }: TabButtonProps) {
  const selected = id === current;
  return (
    <button
      type="button"
      role="tab"
      id={`tab-${id}`}
      aria-selected={selected}
      aria-controls={`panel-${id}`}
      className={cx(styles.tab, selected && styles.selected)}
      onClick={() => onSelect(id)}
    >
      {children} <span className={styles.count}>{count}</span>
    </button>
  );
}
