import { daysSince, describeAge } from '@shared/domain/time';
import { cx } from '@renderer/lib/cx';
import { formatDate } from '@renderer/lib/dates';
import { useNow } from '@renderer/lib/useNow';
import { useLibrary } from '@renderer/store/hooks';
import styles from './VideoDate.module.css';

interface VideoDateProps {
  /** ISO date the video was recorded. */
  recordedAt: string;
  className?: string | undefined;
}

/**
 * A video's date with its age. Videos older than the "stale" threshold from the
 * settings are highlighted: old footage shows habits you may already have fixed.
 */
export function VideoDate({ recordedAt, className }: VideoDateProps) {
  const now = useNow();
  const { staleAfterDays } = useLibrary().settings;
  const days = daysSince(recordedAt, now);
  const stale = days > staleAfterDays;

  return (
    <span className={cx(styles.date, className)}>
      <time dateTime={recordedAt}>{formatDate(recordedAt)}</time>
      <span
        className={cx(styles.age, stale && styles.stale)}
        title={stale ? `Older than ${staleAfterDays} days` : undefined}
      >
        {stale && <span className="visually-hidden">Old video: </span>}
        {describeAge(days)}
      </span>
    </span>
  );
}
