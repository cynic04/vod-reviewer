/**
 * Plain constants of the domain. Kept apart from `schema.ts` so that code which only
 * needs a number does not pull the validation library into its bundle.
 */

export const LIBRARY_SCHEMA_VERSION = 3;

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

/** Outgoing mail servers offered in the email setup. Port 465 is SMTP over TLS. */
export const EMAIL_PROVIDERS = [
  { id: 'gmail', name: 'Gmail', host: 'smtp.gmail.com', port: 465 },
  { id: 'outlook', name: 'Outlook / Microsoft 365', host: 'smtp.office365.com', port: 587 },
  { id: 'icloud', name: 'iCloud', host: 'smtp.mail.me.com', port: 587 },
  { id: 'yahoo', name: 'Yahoo', host: 'smtp.mail.yahoo.com', port: 465 },
] as const;

/** Prefilled in the email setup, as both the recipient and the sending account. */
export const DEFAULT_EMAIL_ADDRESS = 'firegate0@gmail.com';
