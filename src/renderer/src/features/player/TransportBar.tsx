import { COMMON_FRAME_RATES, frameCount } from '@shared/domain/frames';
import { formatTimecode } from '@shared/domain/time';
import { IconButton } from '@renderer/components/Button';
import { PLAYBACK_RATES, useCurrentFrame, useCurrentTime, type Player } from './usePlayer';
import type { ZoomPan } from './useZoomPan';
import { isZoomed } from './zoom';
import styles from './TransportBar.module.css';

interface TransportBarProps {
  player: Player;
  zoom: ZoomPan;
  onFrameRateChange: (frameRate: number) => void;
}

/** Play/pause, frame stepping, the time readout, speed, frame rate, volume and zoom. */
export function TransportBar({ player, zoom, onFrameRateChange }: TransportBarProps) {
  const { state } = player;
  const disabled = !state.isReady;
  const frameRates = COMMON_FRAME_RATES.some((rate) => rate === player.frameRate)
    ? COMMON_FRAME_RATES
    : [...COMMON_FRAME_RATES, player.frameRate].sort((a, b) => a - b);

  return (
    <div
      className={styles.bar}
      role="toolbar"
      aria-label="Playback controls"
      // Clicking a transport button must not move keyboard focus onto it, or Space would
      // repeat that button instead of toggling playback.
      onMouseDown={(event) => {
        if (event.target instanceof Element && event.target.closest('button')) event.preventDefault();
      }}
    >
      <div className={styles.group}>
        <IconButton icon="rewind" label="Back 5 seconds (Shift + Left)" disabled={disabled} onClick={() => player.seekBy(-5)} />
        <IconButton icon="frameBack" label="Previous frame (,)" disabled={disabled} onClick={() => player.stepFrames(-1)} />
        <IconButton
          className={styles.play}
          icon={state.isPlaying ? 'pause' : 'play'}
          label={state.isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          size={22}
          disabled={disabled}
          onClick={player.togglePlay}
        />
        <IconButton icon="frameForward" label="Next frame (.)" disabled={disabled} onClick={() => player.stepFrames(1)} />
        <IconButton icon="forward" label="Forward 5 seconds (Shift + Right)" disabled={disabled} onClick={() => player.seekBy(5)} />
      </div>

      <TimeReadout player={player} />

      <div className={styles.spacer} />

      <label className={styles.field}>
        <span>Speed</span>
        <select
          value={state.playbackRate}
          disabled={disabled}
          onChange={(event) => player.setPlaybackRate(Number(event.target.value))}
        >
          {PLAYBACK_RATES.map((rate) => (
            <option key={rate} value={rate}>
              {rate}x
            </option>
          ))}
        </select>
      </label>

      <label className={styles.field} title="Frame rate of the recording. Detected during playback; change it if frame stepping skips or repeats frames.">
        <span>FPS</span>
        <select value={player.frameRate} onChange={(event) => onFrameRateChange(Number(event.target.value))}>
          {frameRates.map((rate) => (
            <option key={rate} value={rate}>
              {rate}
            </option>
          ))}
        </select>
      </label>

      <div className={styles.group}>
        <IconButton
          icon={state.isMuted || state.volume === 0 ? 'muted' : 'volume'}
          label={state.isMuted ? 'Unmute' : 'Mute'}
          onClick={player.toggleMute}
        />
        <input
          className={styles.volume}
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={state.isMuted ? 0 : state.volume}
          aria-label="Volume"
          onChange={(event) => player.setVolume(Number(event.target.value))}
        />
      </div>

      <div className={styles.group}>
        <IconButton icon="zoomOut" label="Zoom out (-)" disabled={!isZoomed(zoom.view)} onClick={zoom.zoomOut} />
        <output className={styles.zoomLevel} aria-label="Zoom level">
          {Math.round(zoom.view.scale * 100)}%
        </output>
        <IconButton icon="zoomIn" label="Zoom in (+)" onClick={zoom.zoomIn} />
        <IconButton icon="fit" label="Reset zoom (0)" disabled={!isZoomed(zoom.view)} onClick={zoom.reset} />
      </div>
    </div>
  );
}

/** Split out so that only this readout re-renders as the playhead moves. */
function TimeReadout({ player }: { player: Player }) {
  const currentTime = useCurrentTime(player);
  const frame = useCurrentFrame(player);
  const { duration } = player.state;

  return (
    <div className={styles.readout}>
      <span className={styles.time}>
        {formatTimecode(currentTime)} <span className={styles.dim}>/ {formatTimecode(duration)}</span>
      </span>
      <span className={styles.frame} title="Frame number">
        F {frame} <span className={styles.dim}>/ {duration > 0 ? frameCount(duration, player.frameRate) - 1 : 0}</span>
      </span>
    </div>
  );
}
