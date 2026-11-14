import { describe, expect, it } from 'vitest';
import { parseRangeHeader } from './range';

describe('parseRangeHeader', () => {
  it('serves the whole file when there is no usable header', () => {
    expect(parseRangeHeader(null, 1000)).toBeNull();
    expect(parseRangeHeader('items=0-5', 1000)).toBeNull();
    expect(parseRangeHeader('bytes=0-5,10-15', 1000)).toBeNull();
  });

  it('parses bounded, open-ended and suffix ranges', () => {
    expect(parseRangeHeader('bytes=0-499', 1000)).toEqual({ start: 0, end: 499 });
    expect(parseRangeHeader('bytes=500-', 1000)).toEqual({ start: 500, end: 999 });
    expect(parseRangeHeader('bytes=-200', 1000)).toEqual({ start: 800, end: 999 });
  });

  it('clamps an end beyond the file and rejects a start beyond it', () => {
    expect(parseRangeHeader('bytes=900-5000', 1000)).toEqual({ start: 900, end: 999 });
    expect(parseRangeHeader('bytes=1000-', 1000)).toBe('unsatisfiable');
    expect(parseRangeHeader('bytes=5-2', 1000)).toBe('unsatisfiable');
  });
});
