import { describe, expect, it } from 'vitest';
import { daysSince, formatDuration, formatTimecode, isStale } from './time';

describe('time formatting', () => {
  it('formats durations with and without hours', () => {
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(754)).toBe('12:34');
    expect(formatDuration(3723)).toBe('1:02:03');
  });

  it('formats timecodes with centiseconds', () => {
    expect(formatTimecode(65.25)).toBe('1:05.25');
    expect(formatTimecode(0.29)).toBe('0:00.29');
    expect(formatTimecode(-3)).toBe('0:00.00');
  });
});

describe('staleness', () => {
  const now = new Date('2026-11-14T12:00:00.000Z');

  it('counts whole days and never goes negative', () => {
    expect(daysSince('2026-11-13T12:00:00.000Z', now)).toBe(1);
    expect(daysSince('2026-11-13T12:00:01.000Z', now)).toBe(0);
    expect(daysSince('2026-12-01T00:00:00.000Z', now)).toBe(0);
  });

  it('treats a video as stale only once it is older than the threshold', () => {
    expect(isStale('2026-10-30T12:00:00.000Z', now, 15)).toBe(false);
    expect(isStale('2026-10-29T12:00:00.000Z', now, 15)).toBe(true);
  });
});
