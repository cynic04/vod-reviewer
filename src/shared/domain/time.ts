const MS_PER_DAY = 24 * 60 * 60 * 1000;

function pad(value: number, length = 2): string {
  return String(value).padStart(length, '0');
}

/** `1:05`, `12:34` or `1:02:03` - compact form for durations. */
export function formatDuration(totalSeconds: number): string {
  const whole = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const seconds = whole % 60;
  return hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${minutes}:${pad(seconds)}`;
}

/** `1:05.25` - duration with centiseconds, used wherever a precise position matters. */
export function formatTimecode(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const centiseconds = Math.floor(safe * 100 + 1e-6) % 100;
  return `${formatDuration(safe)}.${pad(centiseconds)}`;
}

/** Whole days elapsed between an ISO date and `now`. Never negative. */
export function daysSince(isoDate: string, now: Date): number {
  const elapsed = now.getTime() - new Date(isoDate).getTime();
  return Math.max(0, Math.floor(elapsed / MS_PER_DAY));
}

/** A video is stale once it is strictly older than the threshold. */
export function isStale(isoDate: string, now: Date, staleAfterDays: number): boolean {
  return daysSince(isoDate, now) > staleAfterDays;
}

export function describeAge(days: number): string {
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}
