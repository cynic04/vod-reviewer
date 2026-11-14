import type { Player } from './usePlayer';
import type { ZoomPan } from './useZoomPan';
import { isZoomed } from './zoom';
import { cx } from '@renderer/lib/cx';
import styles from './VideoStage.module.css';

interface VideoStageProps {
  src: string;
  player: Player;
  zoom: ZoomPan;
}

/** The picture itself: the video inside a viewport that can be zoomed and panned. */
export function VideoStage({ src, player, zoom }: VideoStageProps) {
  const { attachViewport, view, isPanning, pointerHandlers } = zoom;
  const { attachVideo, state } = player;
  const zoomed = isZoomed(view);

  return (
    <div
      ref={attachViewport}
      className={cx(styles.stage, zoomed && styles.zoomed, isPanning && styles.panning)}
      {...pointerHandlers}
    >
      <div
        className={styles.content}
        style={{ transform: `translate(${view.x * 100}%, ${view.y * 100}%) scale(${view.scale})` }}
      >
        {/* Review footage has no captions; the notes panel is the text alternative. */}
        <video ref={attachVideo} className={styles.video} src={src} preload="auto" playsInline />
      </div>

      {zoomed && (
        <div className={styles.zoomBadge} aria-live="polite">
          {view.scale.toFixed(1)}x <span>drag to pan</span>
        </div>
      )}

      {state.error && (
        <div className={styles.error} role="alert">
          <p>{state.error}</p>
        </div>
      )}
    </div>
  );
}
