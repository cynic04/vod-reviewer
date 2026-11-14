import { Timeline, type TimelineMarker } from './Timeline';
import { TransportBar } from './TransportBar';
import type { VideoWorkspace } from './useVideoWorkspace';
import { VideoStage } from './VideoStage';
import styles from './PlayerSurface.module.css';

interface PlayerSurfaceProps {
  workspace: VideoWorkspace;
  markers: readonly TimelineMarker[];
}

/** The complete media player: picture, scrubber and transport controls. */
export function PlayerSurface({ workspace, markers }: PlayerSurfaceProps) {
  const { src, player, zoom, setFrameRate } = workspace;
  return (
    <section className={styles.surface} aria-label="Video player">
      <VideoStage src={src} player={player} zoom={zoom} />
      <Timeline player={player} markers={markers} />
      <TransportBar player={player} zoom={zoom} onFrameRateChange={setFrameRate} />
    </section>
  );
}
