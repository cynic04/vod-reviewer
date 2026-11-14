import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { LIBRARY_SCHEMA_VERSION, librarySchema, type Library } from '@shared/domain/schema';

export interface LibraryRepository {
  /** Resolves to `null` when nothing has been stored yet. */
  load(): Promise<Library | null>;
  save(library: Library): Promise<void>;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error;
}

/**
 * Brings a parsed file up to the current schema version. There is only one version so
 * far; when the schema changes, add a step per version here (`1 -> 2`, `2 -> 3`, ...).
 */
function migrate(raw: unknown): unknown {
  if (typeof raw !== 'object' || raw === null || !('schemaVersion' in raw)) return raw;
  if (typeof raw.schemaVersion === 'number' && raw.schemaVersion > LIBRARY_SCHEMA_VERSION) {
    throw new Error(
      `The library file was written by a newer version of the app (schema ${raw.schemaVersion}).`,
    );
  }
  return raw;
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
      return librarySchema.parse(migrate(JSON.parse(contents)));
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
    await writeFile(temporaryPath, `${JSON.stringify(library, null, 2)}\n`, 'utf8');
    await rename(temporaryPath, this.#filePath);
  }
}
