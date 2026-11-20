import { z } from 'zod';
import { LIBRARY_SCHEMA_VERSION, MAX_SUMMARY_LENGTH, SUMMARY_MODEL_PATTERN, THEME_PREFERENCES } from './constants';

/**
 * Single source of truth for the persisted data model.
 *
 * Every entity is a flat record that refers to its relations by id, which keeps
 * the JSON file a 1:1 image of the relational schema described in docs/data-model.md.
 */

const idSchema = z.string().min(1);
const isoDateSchema = z.iso.datetime();
const timeSecondsSchema = z.number().nonnegative();

export const themePreferenceSchema = z.enum(THEME_PREFERENCES);

/**
 * Where summaries are emailed to and which account sends them. The account's password
 * is deliberately not part of the library: it is kept encrypted in a separate file.
 */
export const emailSettingsSchema = z.object({
  /** Address the summaries are sent to. */
  to: z.email(),
  /** Address of the sending account; also its SMTP user name. */
  from: z.email(),
  host: z.string().trim().min(1).max(253).regex(/^[A-Za-z0-9.-]+$/),
  port: z.number().int().min(1).max(65535),
  /** Email each summary as soon as the agent has written it, without being asked. */
  autoSend: z.boolean(),
});

export const settingsSchema = z.object({
  theme: themePreferenceSchema,
  /** Absolute path of the folder the import browser opens in. `null` means the OS Videos folder. */
  videosRoot: z.string().min(1).nullable(),
  staleAfterDays: z.number().int().min(1).max(3650),
  /** The character the user plays, so matchup advice can be specific. `null` if not set. */
  playerCharacterId: z.string().min(1).nullable(),
  /** GitHub Copilot model id the summarize agent runs on. */
  summaryModel: z.string().regex(SUMMARY_MODEL_PATTERN),
  /** `null` until email has been set up. */
  email: emailSettingsSchema.nullable(),
});

export const folderKindSchema = z.enum(['matchup', 'custom']);

export const folderSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(80),
  kind: folderKindSchema,
  /** Set for matchup folders; refers to the static character roster. */
  characterId: z.string().min(1).nullable(),
  createdAt: isoDateSchema,
});

export const frameRateSourceSchema = z.enum(['default', 'detected', 'manual']);

export const videoSchema = z.object({
  id: idSchema,
  folderId: idSchema,
  /** Absolute path of the source file. Videos are referenced in place, never copied. */
  filePath: z.string().min(1),
  fileName: z.string().min(1),
  title: z.string().trim().min(1).max(160),
  fileSizeBytes: z.number().int().nonnegative(),
  /** Last-modified time of the source file, i.e. when the recording finished. */
  recordedAt: isoDateSchema,
  importedAt: isoDateSchema,
  durationSeconds: z.number().positive().nullable(),
  frameRate: z.number().min(1).max(480),
  frameRateSource: frameRateSourceSchema,
});

export const timestampKindSchema = z.enum(['focus', 'bookmark']);

export const timestampSchema = z.object({
  id: idSchema,
  videoId: idSchema,
  timeSeconds: timeSecondsSchema,
  label: z.string().trim().max(120),
  /** `focus` points are set up front in the import flow; `bookmark`s are added during review. */
  kind: timestampKindSchema,
  createdAt: isoDateSchema,
});

export const noteSchema = z.object({
  id: idSchema,
  videoId: idSchema,
  timeSeconds: timeSecondsSchema,
  body: z.string().trim().min(1).max(5000),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const summaryStatusSchema = z.enum(['pending', 'ready']);

/** The AI-written coaching summary of all the notes on one video. At most one per video. */
export const videoSummarySchema = z.object({
  id: idSchema,
  videoId: idSchema,
  /** `pending` while the agent is working. A pending summary may still show the previous text. */
  status: summaryStatusSchema,
  /** Markdown written by the agent. Empty until the first run completes. */
  markdown: z.string().max(MAX_SUMMARY_LENGTH),
  model: z.string().min(1),
  requestedAt: isoDateSchema,
  completedAt: isoDateSchema.nullable(),
});

export const librarySchema = z.object({
  schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
  settings: settingsSchema,
  folders: z.array(folderSchema),
  videos: z.array(videoSchema),
  timestamps: z.array(timestampSchema),
  notes: z.array(noteSchema),
  summaries: z.array(videoSummarySchema),
});

export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type EmailSettings = z.infer<typeof emailSettingsSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type FolderKind = z.infer<typeof folderKindSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type FrameRateSource = z.infer<typeof frameRateSourceSchema>;
export type Video = z.infer<typeof videoSchema>;
export type TimestampKind = z.infer<typeof timestampKindSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
export type Note = z.infer<typeof noteSchema>;
export type SummaryStatus = z.infer<typeof summaryStatusSchema>;
export type VideoSummary = z.infer<typeof videoSummarySchema>;
export type Library = z.infer<typeof librarySchema>;
