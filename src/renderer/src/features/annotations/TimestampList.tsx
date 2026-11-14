import { useMemo } from 'react';
import type { Timestamp } from '@shared/domain/schema';
import { formatTimecode } from '@shared/domain/time';
import { IconButton } from '@renderer/components/Button';
import { cx } from '@renderer/lib/cx';
import { useActiveItemId, type Player } from '@renderer/features/player/usePlayer';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError } from '@renderer/store/toastStore';
import styles from './annotations.module.css';

interface TimestampListProps {
  /** Sorted by time. */
  timestamps: readonly Timestamp[];
  player: Player;
  emptyMessage: string;
}

/** Clickable timestamps: the time jumps the video there, the label is edited in place. */
export function TimestampList({ timestamps, player, emptyMessage }: TimestampListProps) {
  const activeId = useActiveItemId(player, timestamps);

  if (timestamps.length === 0) return <p className={styles.empty}>{emptyMessage}</p>;

  return (
    <ol className={styles.list}>
      {timestamps.map((timestamp) => (
        <TimestampRow
          key={timestamp.id}
          timestamp={timestamp}
          isActive={timestamp.id === activeId}
          onJump={player.seek}
        />
      ))}
    </ol>
  );
}

interface TimestampRowProps {
  timestamp: Timestamp;
  isActive: boolean;
  onJump: (timeSeconds: number) => void;
}

function TimestampRow({ timestamp, isActive, onJump }: TimestampRowProps) {
  const updateTimestamp = useLibraryStore((state) => state.updateTimestamp);
  const removeTimestamp = useLibraryStore((state) => state.removeTimestamp);
  const timecode = useMemo(() => formatTimecode(timestamp.timeSeconds), [timestamp.timeSeconds]);

  const commitLabel = (value: string): void => {
    const label = value.trim();
    if (label !== timestamp.label) void updateTimestamp(timestamp.id, { label }).catch(reportError);
  };

  return (
    <li className={cx(styles.item, styles.timestampItem, isActive && styles.active)}>
      <button
        type="button"
        className={cx(styles.timeChip, timestamp.kind === 'focus' && styles.focusChip)}
        aria-label={`Jump to ${timecode}${timestamp.label ? `, ${timestamp.label}` : ''}`}
        title={timestamp.kind === 'focus' ? 'Focus point - click to jump' : 'Click to jump'}
        onClick={() => onJump(timestamp.timeSeconds)}
      >
        {timecode}
      </button>
      <input
        // Re-mount when the stored label changes so the field never shows a stale draft.
        key={timestamp.label}
        type="text"
        className={styles.labelInput}
        defaultValue={timestamp.label}
        placeholder={timestamp.kind === 'focus' ? 'Focus point' : 'Timestamp'}
        maxLength={120}
        aria-label={`Label for timestamp at ${timecode}`}
        onBlur={(event) => commitLabel(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === 'Escape') event.currentTarget.blur();
        }}
      />
      <IconButton
        icon="trash"
        label={`Delete timestamp at ${timecode}`}
        size={16}
        onClick={() => void removeTimestamp(timestamp.id).catch(reportError)}
      />
    </li>
  );
}
