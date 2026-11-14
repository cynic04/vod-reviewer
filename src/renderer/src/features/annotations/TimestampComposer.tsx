import { useState, type SyntheticEvent } from 'react';
import type { TimestampKind } from '@shared/domain/schema';
import { formatTimecode } from '@shared/domain/time';
import { Button } from '@renderer/components/Button';
import { useCurrentTime, type Player } from '@renderer/features/player/usePlayer';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError } from '@renderer/store/toastStore';
import styles from './annotations.module.css';

interface TimestampComposerProps {
  videoId: string;
  kind: TimestampKind;
  player: Player;
  /** Verb on the button, e.g. "Mark focus point". */
  actionLabel: string;
}

/** Adds a timestamp at the current playhead position, with an optional label. */
export function TimestampComposer({ videoId, kind, player, actionLabel }: TimestampComposerProps) {
  const createTimestamp = useLibraryStore((state) => state.createTimestamp);
  const [label, setLabel] = useState('');

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    createTimestamp({ videoId, kind, label: label.trim(), timeSeconds: player.getCurrentTime() })
      .then(() => setLabel(''))
      .catch(reportError);
  };

  return (
    <form className={styles.composer} onSubmit={onSubmit}>
      <input
        type="text"
        value={label}
        maxLength={120}
        placeholder="Label (optional)"
        aria-label="Timestamp label"
        onChange={(event) => setLabel(event.target.value)}
      />
      <Button type="submit" variant="primary" icon="flag" disabled={!player.state.isReady}>
        {actionLabel} <LiveTimecode player={player} />
      </Button>
    </form>
  );
}

/** Isolated so the playhead only re-renders this text, not the whole form. */
export function LiveTimecode({ player }: { player: Player }) {
  return <>{formatTimecode(useCurrentTime(player))}</>;
}
