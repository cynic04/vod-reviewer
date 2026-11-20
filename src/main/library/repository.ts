import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { DEFAULT_SUMMARY_MODEL, LIBRARY_SCHEMA_VERSION } from '@shared/domain/constants';
import { librarySchema, type Library } from '@shared/domain/schema';

export interface LibraryRepository {
  /** Resolves to `null` when nothing has been stored yet. */
  load(): Promise<Library | null>;
  save(library: Library): Promise<void>;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

const RENAME_RETRY_DELAYS_MS = [20, 50, 100, 200, 400];
const TRANSIENT_RENAME_ERRORS = new Set(['EPERM', 'EBUSY', 'EACCES']);

/**
 * `rename` that tolerates the target being briefly held open by another process. On
 * Windows, replacing a file fails while a virus scanner, indexer or backup tool reads it.
 */
async function renameWithRetry(from: string, to: string): Promise<void> {
  for (const delay of RENAME_RETRY_DELAYS_MS) {
    try {
      await rename(from, to);
      return;
    } catch (error) {
      if (!isNodeError(error) || !TRANSIENT_RENAME_ERRORS.has(error.code ?? '')) throw error;
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  await rename(from, to);
}

type RawLibrary = Record<string, unknown> & { schemaVersion: number };

/**
 * One step per schema version: `MIGRATIONS[n]` turns a version `n` file into version
 * `n + 1`. Steps only add what the newer schema needs; validation happens afterwards.
 */
const MIGRATIONS: Record<number, (library: RawLibrary) => RawLibrary> = {
  // 2: session summaries, and the settings the summarize agent needs.
  1: (library) => ({
    ...library,
    schemaVersion: 2,
    settings: {
      ...(typeof library.settings === 'object' ? library.settings : {}),
      playerCharacterId: null,
      summaryModel: DEFAULT_SUMMARY_MODEL,
    },
    summaries: [],
  }),
  // 3: the email account summaries are sent with.
  2: (library) => ({
    ...library,
    schemaVersion: 3,
    settings: { ...(typeof library.settings === 'object' ? library.settings : {}), email: null },
  }),
  // 4: review sessions are gone. Notes belong to their video only, and a video has one summary.
  3: (library) => ({
    ...without(library, 'sessions'),
    schemaVersion: 4,
    notes: records(library.notes).map((note) => without(note, 'sessionId')),
    summaries: onePerVideo(records(library.summaries).map((summary) => without(summary, 'sessionId'))),
  }),
};

type RawRecord = Record<string, unknown>;

function without<T extends RawRecord>(record: T, key: string): T {
  return Object.fromEntries(Object.entries(record).filter(([name]) => name !== key)) as T;
}

function records(value: unknown): RawRecord[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is RawRecord => typeof item === 'object' && item !== null);
}

/**
 * Where a video had a summary for each of several sessions, keeps the one written last:
 * it is the nearest thing to a summary of all the video's notes.
 */
function onePerVideo(summaries: RawRecord[]): RawRecord[] {
  const writtenAt = (summary: RawRecord): string =>
    [summary.completedAt, summary.requestedAt].find((value) => typeof value === 'string') ?? '';
  const kept = new Map<unknown, RawRecord>();
  for (const summary of summaries) {
    const current = kept.get(summary.videoId);
    if (!current || writtenAt(summary) > writtenAt(current)) kept.set(summary.videoId, summary);
  }
  return [...kept.values()];
}

function isRawLibrary(raw: unknown): raw is RawLibrary {
  return typeof raw === 'object' && raw !== null && 'schemaVersion' in raw && typeof raw.schemaVersion === 'number';
}

/** Brings a parsed file up to the current schema version, one version at a time. */
export function migrate(raw: unknown): unknown {
  if (!isRawLibrary(raw)) return raw;
  if (raw.schemaVersion > LIBRARY_SCHEMA_VERSION) {
    throw new Error(
      `The library file was written by a newer version of the app (schema ${raw.schemaVersion}).`,
    );
  }

  let library = raw;
  while (library.schemaVersion < LIBRARY_SCHEMA_VERSION) {
    const step = MIGRATIONS[library.schemaVersion];
    if (!step) throw new Error(`No migration from library schema ${library.schemaVersion}.`);
    library = step(library);
  }
  return library;
}

/** Stores the whole library as one human-readable JSON document. */
export class JsonLibraryRepository implements LibraryRepository {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async load(): Promise<Library | null> {
    let contents: string;
    try {
      contents = await readFile(this.#filePath, 'utf8');
    } catch (error) {
      if (isNodeError(error) && error.code === 'ENOENT') return null;
      throw error;
    }

    try {
      const raw: unknown = JSON.parse(contents);
      const library = librarySchema.parse(migrate(raw));
      // A migration can drop data the newer schema has no place for; keep the file as it was.
      if (isRawLibrary(raw) && raw.schemaVersion < LIBRARY_SCHEMA_VERSION) {
        const backupPath = this.#filePath.replace(/\.json$/, `.v${String(raw.schemaVersion)}-backup.json`);
        await writeFile(backupPath, contents, { encoding: 'utf8', flag: 'wx' }).catch((error: unknown) => {
          if (!isNodeError(error) || error.code !== 'EEXIST') throw error;
        });
      }
      return library;
    } catch (error) {
      // Never overwrite a file we could not read: set it aside so nothing is lost.
      const backupPath = this.#filePath.replace(/\.json$/, `.unreadable-${Date.now()}.json`);
      await rename(this.#filePath, backupPath);
      console.error(`Library file could not be read and was moved to ${backupPath}.`, error);
      return null;
    }
  }

  /** Writes to a temporary file first and renames it, so a crash cannot leave a half-written library. */
  async save(library: Library): Promise<void> {
    await mkdir(path.dirname(this.#filePath), { recursive: true });
    const temporaryPath = `${this.#filePath}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporaryPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
      await renameWithRetry(temporaryPath, this.#filePath);
    } catch (error) {
      await rm(temporaryPath, { force: true });
      throw error;
    }
  }
}
