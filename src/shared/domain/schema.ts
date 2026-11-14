import { z } from 'zod';
import { LIBRARY_SCHEMA_VERSION, THEME_PREFERENCES } from './constants';

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

export const settingsSchema = z.object({
  theme: themePreferenceSchema,
  /** Absolute path of the folder the import browser opens in. `null` means the OS Videos folder. */
  videosRoot: z.string().min(1).nullable(),
  staleAfterDays: z.number().int().min(1).max(3650),
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

export const reviewSessionSchema = z.object({
  id: idSchema,
  videoId: idSchema,
  startedAt: isoDateSchema,
  lastActivityAt: isoDateSchema,
});

export const noteSchema = z.object({
  id: idSchema,
  videoId: idSchema,
  sessionId: idSchema,
  timeSeconds: timeSecondsSchema,
  body: z.string().trim().min(1).max(5000),
  createdAt: isoDateSchema,
  updatedAt: isoDateSchema,
});

export const librarySchema = z.object({
  schemaVersion: z.literal(LIBRARY_SCHEMA_VERSION),
  settings: settingsSchema,
  folders: z.array(folderSchema),
  videos: z.array(videoSchema),
  timestamps: z.array(timestampSchema),
  sessions: z.array(reviewSessionSchema),
  notes: z.array(noteSchema),
});

export type ThemePreference = z.infer<typeof themePreferenceSchema>;
export type Settings = z.infer<typeof settingsSchema>;
export type FolderKind = z.infer<typeof folderKindSchema>;
export type Folder = z.infer<typeof folderSchema>;
export type FrameRateSource = z.infer<typeof frameRateSourceSchema>;
export type Video = z.infer<typeof videoSchema>;
export type TimestampKind = z.infer<typeof timestampKindSchema>;
export type Timestamp = z.infer<typeof timestampSchema>;
export type ReviewSession = z.infer<typeof reviewSessionSchema>;
export type Note = z.infer<typeof noteSchema>;
export type Library = z.infer<typeof librarySchema>;
