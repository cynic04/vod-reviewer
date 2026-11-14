import { useRef, useState, type PointerEvent } from 'react';
import { formatTimecode } from '@shared/domain/time';
import { cx } from '@renderer/lib/cx';
import { useCurrentTime, type Player } from './usePlayer';
import styles from './Timeline.module.css';

export interface TimelineMarker {
  id: string;
  timeSeconds: number;
  kind: 'focus' | 'bookmark' | 'note';
  label: string;
}

interface TimelineProps {
  player: Player;
  markers: readonly TimelineMarker[];
}

/**
 * The scrubber. Drag anywhere to seek; markers show where timestamps and notes sit and
 * jump to them when clicked.
 */
export function Timeline({ player, markers }: TimelineProps) {
  const currentTime = useCurrentTime(player);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const { duration, isReady } = player.state;

  const fractionOf = (timeSeconds: number): number =>
    duration > 0 ? Math.min(1, Math.max(0, timeSeconds / duration)) : 0;

  const timeAt = (clientX: number): number => {
    const bounds = trackRef.current?.getBoundingClientRect();
    if (!bounds || bounds.width === 0) return 0;
    return Math.min(1, Math.max(0, (clientX - bounds.left) / bounds.width)) * duration;
  };

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (event.button !== 0 || !isReady) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    player.seek(timeAt(event.clientX));
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const time = timeAt(event.clientX);
    setHoverTime(time);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) player.seek(time);
  };

  return (
    <div className={styles.timeline}>
      <div
        ref={trackRef}
        className={styles.track}
        role="slider"
        tabIndex={0}
        aria-label="Seek"
        aria-valuemin={0}
        aria-valuemax={Math.round(duration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTimecode(currentTime)} of ${formatTimecode(duration)}`}
        aria-disabled={!isReady}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerLeave={() => setHoverTime(null)}
      >
        <div className={styles.rail}>
          <div className={styles.progress} style={{ width: `${fractionOf(currentTime) * 100}%` }} />
        </div>
        <div className={styles.playhead} style={{ left: `${fractionOf(currentTime) * 100}%` }} />

        {hoverTime !== null && isReady && (
          <div className={styles.hoverTime} style={{ left: `${fractionOf(hoverTime) * 100}%` }}>
            {formatTimecode(hoverTime)}
          </div>
        )}
      </div>

      {/* Markers sit above the track as real buttons so they are reachable by keyboard. */}
      <ul className={styles.markers}>
        {markers.map((marker) => (
          <li key={`${marker.kind}-${marker.id}`} style={{ left: `${fractionOf(marker.timeSeconds) * 100}%` }}>
            <button
              type="button"
              className={cx(styles.marker, styles[marker.kind])}
              title={`${formatTimecode(marker.timeSeconds)} - ${marker.label}`}
              aria-label={`Jump to ${marker.label} at ${formatTimecode(marker.timeSeconds)}`}
              onClick={() => player.seek(marker.timeSeconds)}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}
