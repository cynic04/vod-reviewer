export interface ByteRange {
  start: number;
  /** Inclusive. */
  end: number;
}

/**
 * Parses a single-range HTTP `Range` header (`bytes=0-499`, `bytes=500-`, `bytes=-500`).
 *
 * Returns `null` when there is no usable header (serve the whole file) and
 * `'unsatisfiable'` when the range lies outside the file (answer 416).
 */
export function parseRangeHeader(header: string | null, size: number): ByteRange | null | 'unsatisfiable' {
  if (header === null) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart = '', rawEnd = ''] = match;
  if (rawStart === '' && rawEnd === '') return null;

  if (rawStart === '') {
    const suffixLength = Number(rawEnd);
    if (suffixLength === 0 || size === 0) return 'unsatisfiable';
    return { start: Math.max(0, size - suffixLength), end: size - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === '' ? size - 1 : Math.min(Number(rawEnd), size - 1);
  if (start >= size || start > end) return 'unsatisfiable';
  return { start, end };
}
