/**
 * Plain constants of the domain. Kept apart from `schema.ts` so that code which only
 * needs a number does not pull the validation library into its bundle.
 */

export const LIBRARY_SCHEMA_VERSION = 2;

/** Fighting games run at 60fps, so that is assumed until a video's real rate is detected. */
export const DEFAULT_FRAME_RATE = 60;

/** Videos older than this many days are highlighted as old. */
export const DEFAULT_STALE_AFTER_DAYS = 15;

export const THEME_PREFERENCES = ['system', 'light', 'dark'] as const;

/**
 * Model the summarize agent runs on unless changed in Settings. Deliberately a small,
 * inexpensive one: the job is reading a page of notes and writing a page of advice.
 */
export const DEFAULT_SUMMARY_MODEL = 'claude-haiku-4.5';

/** Model ids are written into a shell script, so only these characters are accepted. */
export const SUMMARY_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/** Upper bound on a summary the agent may hand back. */
export const MAX_SUMMARY_LENGTH = 30_000;
