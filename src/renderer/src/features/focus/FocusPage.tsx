import { useMemo } from 'react';
import { Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Video } from '@shared/domain/schema';
import { isFocusLocationState, routes } from '@renderer/app/routes';
import { Button } from '@renderer/components/Button';
import { Stepper } from '@renderer/components/Stepper';
import { TimestampComposer } from '@renderer/features/annotations/TimestampComposer';
import { TimestampList } from '@renderer/features/annotations/TimestampList';
import { toTimelineMarkers } from '@renderer/features/player/markers';
import { PlayerSurface } from '@renderer/features/player/PlayerSurface';
import { usePlayerShortcuts, type ShortcutMap } from '@renderer/features/player/usePlayerShortcuts';
import { useVideoWorkspace } from '@renderer/features/player/useVideoWorkspace';
import { ShortcutHelp } from '@renderer/features/review/ShortcutHelp';
import { WorkspaceLayout } from '@renderer/features/review/WorkspaceLayout';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { selectFolder, selectTimestamps, selectVideo } from '@renderer/store/selectors';
import { reportError } from '@renderer/store/toastStore';
import styles from './FocusPage.module.css';

const FOCUS_SHORTCUTS = [{ keys: 'M', action: 'Mark a focus point here' }];

/**
 * Step three of the import flow, also reachable later from a video: scrub through the
 * recording and mark the moments the review should concentrate on.
 */
export function FocusPage() {
  const { videoId } = useParams();
  const video = selectVideo(useLibrary(), videoId);
  if (!video) return <Navigate to={routes.library()} replace />;
  return <FocusWorkspace key={video.id} video={video} />;
}

function FocusWorkspace({ video }: { video: Video }) {
  const library = useLibrary();
  const navigate = useNavigate();
  const location = useLocation();
  const createTimestamp = useLibraryStore((state) => state.createTimestamp);
  const workspace = useVideoWorkspace(video);
  const { player, zoom } = workspace;

  const folder = selectFolder(library, video.folderId);
  const focusPoints = useMemo(
    () => selectTimestamps(library, video.id).filter((timestamp) => timestamp.kind === 'focus'),
    [library, video.id],
  );
  const markers = useMemo(() => toTimelineMarkers(focusPoints), [focusPoints]);

  const { getCurrentTime } = player;
  const shortcuts = useMemo<ShortcutMap>(
    () => ({
      m: () => {
        void createTimestamp({
          videoId: video.id,
          kind: 'focus',
          label: '',
          timeSeconds: getCurrentTime(),
        }).catch(reportError);
      },
    }),
    [createTimestamp, getCurrentTime, video.id],
  );
  usePlayerShortcuts(player, zoom, shortcuts);

  return (
    <WorkspaceLayout
      video={video}
      folder={folder}
      banner={isFocusLocationState(location.state) ? <Stepper current={2} /> : undefined}
      actions={<ShortcutHelp extra={FOCUS_SHORTCUTS} />}
      sidebar={
        <>
          <div className={styles.intro}>
            <h2>Focus points</h2>
            <p>
              Where should this review concentrate? Scrub to each round, exchange or mistake you want to study
              and mark it. Your review will open on the first one.
            </p>
          </div>

          <div className={styles.points}>
            <TimestampComposer videoId={video.id} kind="focus" player={player} actionLabel="Mark" />
            <TimestampList
              timestamps={focusPoints}
              player={player}
              emptyMessage="No focus points yet. You can also skip this step and mark moments as you review."
            />
          </div>

          <div className={styles.footer}>
            <Button
              variant="primary"
              size="lg"
              trailingIcon="arrowRight"
              onClick={() => void navigate(routes.review(video.id))}
            >
              {focusPoints.length === 0 ? 'Skip to review' : 'Start review'}
            </Button>
          </div>
        </>
      }
    >
      <PlayerSurface workspace={workspace} markers={markers} />
    </WorkspaceLayout>
  );
}
