/**
 * Plain constants of the domain. Kept apart from `schema.ts` so that code which only
 * needs a number does not pull the validation library into its bundle.
 */

export const LIBRARY_SCHEMA_VERSION = 1;

/** Fighting games run at 60fps, so that is assumed until a video's real rate is detected. */
export const DEFAULT_FRAME_RATE = 60;

/** Videos older than this many days are highlighted as old. */
export const DEFAULT_STALE_AFTER_DAYS = 15;

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;
