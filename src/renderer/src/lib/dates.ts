const dateFormat = new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' });

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
});

/** `Nov 14, 2026` in the user's locale. */
export function formatDate(isoDate: string): string {
  return dateFormat.format(new Date(isoDate));
}

/** `Nov 14, 4:18 PM` in the user's locale. */
export function formatDateTime(isoDate: string): string {
  return dateTimeFormat.format(new Date(isoDate));
}

const SIZE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

export function formatFileSize(bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < SIZE_UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 || value >= 100 ? 0 : 1)} ${SIZE_UNITS[unit] ?? 'B'}`;
}
