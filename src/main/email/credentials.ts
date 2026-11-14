import { readFile, rm, writeFile } from 'node:fs/promises';
import { safeStorage } from 'electron';
import { DomainError } from '../library/errors';

/** Keeps the email account's password. The only place it ever exists outside of memory. */
export interface CredentialStore {
  get(): Promise<string | null>;
  set(password: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Stores the password encrypted with the operating system's key store (DPAPI on Windows,
 * Keychain on macOS), in its own file next to the library. Only this user account on
 * this machine can decrypt it, and it never appears in `library.json` or its backups.
 */
export class EncryptedFileCredentialStore implements CredentialStore {
  readonly #filePath: string;

  constructor(filePath: string) {
    this.#filePath = filePath;
  }

  async get(): Promise<string | null> {
    let encrypted: Buffer;
    try {
      encrypted = await readFile(this.#filePath);
    } catch {
      return null;
    }
    try {
      const { result, shouldReEncrypt } = await safeStorage.decryptStringAsync(encrypted);
      // The OS rotated its key: store the password again under the new one.
      if (shouldReEncrypt) await this.set(result);
      return result;
    } catch {
      // Written by another user account or machine; treat it as not stored.
      return null;
    }
  }

  async set(password: string): Promise<void> {
    if (!(await safeStorage.isAsyncEncryptionAvailable())) {
      throw new DomainError('UNAVAILABLE', 'This computer cannot store the password securely, so it was not saved.');
    }
    await writeFile(this.#filePath, await safeStorage.encryptStringAsync(password));
  }

  async clear(): Promise<void> {
    await rm(this.#filePath, { force: true });
  }
}
