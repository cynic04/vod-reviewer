import { z } from 'zod';
import type { CharacterFrameData } from '../domain/frameData';
import {
  emailSettingsSchema,
  folderSchema,
  noteSchema,
  settingsSchema,
  timestampSchema,
  videoSchema,
  type Library,
  type Note,
  type SessionSummary,
  type Timestamp,
  type Video,
} from '../domain/schema';

/**
 * The typed contract between the renderer and the main process.
 *
 * Each channel declares a zod schema for its request. The main process validates every
 * incoming payload against it, and both sides derive their TypeScript types from it, so
 * the two processes cannot drift apart.
 *
 * Mutations answer with the full library snapshot: the main process owns the data and
 * the renderer simply replaces its copy. The library is small enough for this to be cheap.
 */

const id = z.string().min(1);

export const ipcRequestSchemas = {
  'library:get': z.undefined(),

  'settings:update': settingsSchema
    .pick({ theme: true, staleAfterDays: true, playerCharacterId: true, summaryModel: true })
    .partial(),
  'settings:chooseVideosRoot': z.undefined(),

  'videos:browse': z.object({ directory: z.string().min(1).nullable() }),
  'videos:import': z.object({
    filePath: z.string().min(1),
    folderId: id,
  }),
  'videos:update': z.object({
    id,
    patch: videoSchema
      .pick({ title: true, folderId: true, durationSeconds: true, frameRate: true, frameRateSource: true })
      .partial(),
  }),
  'videos:remove': z.object({ id }),
  'videos:showInFolder': z.object({ id }),

  'folders:create': folderSchema.pick({ name: true }),
  'folders:rename': folderSchema.pick({ id: true, name: true }),
  'folders:remove': z.object({ id }),

  'timestamps:create': timestampSchema.pick({ videoId: true, timeSeconds: true, label: true, kind: true }),
  'timestamps:update': z.object({
    id,
    patch: timestampSchema.pick({ timeSeconds: true, label: true }).partial(),
  }),
  'timestamps:remove': z.object({ id }),

  'notes:create': noteSchema.pick({ videoId: true, timeSeconds: true, body: true }).extend({
    /** `null` starts a new review session for the note. */
    sessionId: id.nullable(),
  }),
  'notes:update': noteSchema.pick({ id: true, body: true }),
  'notes:remove': z.object({ id }),

  /** Starts the summarize agent for a review session, in a new terminal window. */
  'summaries:request': z.object({ sessionId: id }),
  'summaries:remove': z.object({ id }),

  /**
   * Saves the email account. `password: null` keeps the stored one, which is only
   * allowed once one has been stored.
   */
  'email:configure': emailSettingsSchema.extend({ password: z.string().min(1).max(256).nullable() }),
  'email:remove': z.undefined(),
  'email:sendTest': z.undefined(),
  'email:sendSummary': z.object({ summaryId: id }),

  /** A character's frame data. `refresh` downloads a new copy instead of using the saved one. */
  'frameData:get': z.object({ characterId: id, refresh: z.boolean() }),
} as const;

export type IpcChannel = keyof typeof ipcRequestSchemas;

export function isIpcChannel(value: unknown): value is IpcChannel {
  return typeof value === 'string' && Object.hasOwn(ipcRequestSchemas, value);
}

export interface DirectoryEntry {
  name: string;
  path: string;
}

export interface VideoFileEntry extends DirectoryEntry {
  sizeBytes: number;
  modifiedAt: string;
  /** Id of the library video that already references this file, if any. */
  importedVideoId: string | null;
}

export interface DirectoryListing {
  root: string;
  path: string;
  /** `null` at the root: the browser never walks above it. */
  parent: string | null;
  directories: DirectoryEntry[];
  videos: VideoFileEntry[];
}

interface IpcResponses {
  'library:get': Library;
  'settings:update': Library;
  /** `null` when the folder picker was dismissed. */
  'settings:chooseVideosRoot': Library | null;
  'videos:browse': DirectoryListing;
  'videos:import': { library: Library; video: Video };
  'videos:update': Library;
  'videos:remove': Library;
  'videos:showInFolder': null;
  'folders:create': Library;
  'folders:rename': Library;
  'folders:remove': Library;
  'timestamps:create': { library: Library; timestamp: Timestamp };
  'timestamps:update': Library;
  'timestamps:remove': Library;
  'notes:create': { library: Library; note: Note };
  'notes:update': Library;
  'notes:remove': Library;
  'summaries:request': { library: Library; summary: SessionSummary };
  'summaries:remove': Library;
  'email:configure': Library;
  'email:remove': Library;
  'email:sendTest': { sentTo: string };
  'email:sendSummary': { sentTo: string };
  'frameData:get': CharacterFrameData;
}

export type IpcRequest<C extends IpcChannel> = z.infer<(typeof ipcRequestSchemas)[C]>;
export type IpcResponse<C extends IpcChannel> = IpcResponses[C];

/**
 * Errors cross the process boundary as data rather than as rejected promises, because
 * Electron strips everything but the message from errors thrown inside `ipcMain.handle`.
 */
export type IpcErrorCode = 'INVALID_REQUEST' | 'NOT_FOUND' | 'CONFLICT' | 'FORBIDDEN' | 'UNAVAILABLE' | 'INTERNAL';

export type IpcResult<T> = { ok: true; value: T } | { ok: false; error: { code: IpcErrorCode; message: string } };

/** The API the preload script exposes on `window.vodReviewer`. */
export interface VodReviewerApi {
  invoke<C extends IpcChannel>(
    channel: C,
    ...args: IpcRequest<C> extends undefined ? [] : [request: IpcRequest<C>]
  ): Promise<IpcResult<IpcResponse<C>>>;

  /**
   * Called when the library changes for a reason other than a request from this window -
   * today, when the summarize agent hands in a summary. Returns the unsubscribe function.
   */
  onLibraryChanged(listener: (library: Library) => void): () => void;

  /**
   * Called when something the user did not directly ask for has finished in the
   * background, such as a summary being emailed automatically.
   */
  onNotice(listener: (notice: Notice) => void): () => void;
}

/** A short message from the main process, shown as a toast. */
export interface Notice {
  kind: 'info' | 'error';
  message: string;
}
