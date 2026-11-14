import { mkdtemp, open, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEmptyLibrary, updateSettings, type OperationContext } from './operations';
import { JsonLibraryRepository } from './repository';
import { LibraryService } from './service';

const ctx: OperationContext = {
  now: () => new Date('2026-11-14T10:00:00.000Z'),
  newId: () => 'fixed-id',
};

describe('JSON library persistence', () => {
  let directory: string;
  let filePath: string;

  beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'vod-reviewer-'));
    filePath = path.join(directory, 'library.json');
  });

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
  });

  it('returns null before anything was saved and round-trips a library', async () => {
    const repository = new JsonLibraryRepository(filePath);
    expect(await repository.load()).toBeNull();

    const library = createEmptyLibrary(ctx);
    await repository.save(library);

    expect(await repository.load()).toEqual(library);
    expect(await readdir(directory)).toEqual(['library.json']);
  });

  it('upgrades a library written by the first version of the app', async () => {
    const current = createEmptyLibrary(ctx);
    // Exactly what version 0.1.0 wrote: no summaries, and three settings.
    const v1 = {
      schemaVersion: 1,
      settings: { theme: 'dark', videosRoot: null, staleAfterDays: 15 },
      folders: current.folders,
      videos: [],
      timestamps: [],
      sessions: [],
      notes: [],
    };
    await writeFile(filePath, JSON.stringify(v1), 'utf8');

    const loaded = await new JsonLibraryRepository(filePath).load();
    expect(loaded).toMatchObject({
      schemaVersion: 2,
      settings: { theme: 'dark', playerCharacterId: null, summaryModel: 'claude-haiku-4.5' },
      summaries: [],
    });
    expect(loaded?.folders).toEqual(current.folders);
  });

  it('refuses a library from a newer version without touching it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeFile(filePath, JSON.stringify({ ...createEmptyLibrary(ctx), schemaVersion: 99 }), 'utf8');

    expect(await new JsonLibraryRepository(filePath).load()).toBeNull();
    const [backup] = await readdir(directory);
    expect(JSON.parse(await readFile(path.join(directory, backup ?? ''), 'utf8'))).toMatchObject({ schemaVersion: 99 });
  });

  it('sets an unreadable file aside instead of overwriting it', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await writeFile(filePath, '{ "schemaVersion": 1, "videos": "broken" }', 'utf8');

    expect(await new JsonLibraryRepository(filePath).load()).toBeNull();

    const [backup] = await readdir(directory);
    expect(backup).toMatch(/^library\.unreadable-\d+\.json$/);
    expect(await readFile(path.join(directory, backup ?? ''), 'utf8')).toContain('"broken"');
  });

  it('saves even while another process briefly holds the file open', async () => {
    // On Windows a file cannot be replaced while a scanner, indexer or sync tool has it open.
    const repository = new JsonLibraryRepository(filePath);
    await repository.save(createEmptyLibrary(ctx));
    const updated = updateSettings(createEmptyLibrary(ctx), { theme: 'light' });

    const handle = await open(filePath, 'r');
    const released = new Promise<void>((resolve) => {
      setTimeout(() => void handle.close().then(resolve), 60);
    });

    await repository.save(updated);
    await released;

    expect(await repository.load()).toEqual(updated);
    expect(await readdir(directory)).toEqual(['library.json']);
  });

  it('creates the library on first run and persists every mutation', async () => {
    const repository = new JsonLibraryRepository(filePath);
    const service = await LibraryService.open(repository, ctx);

    await service.update((library) => updateSettings(library, { theme: 'dark' }));

    expect(service.library.settings.theme).toBe('dark');
    expect((await repository.load())?.settings.theme).toBe('dark');
  });

  it('keeps the previous state when an operation fails, and keeps working afterwards', async () => {
    const service = await LibraryService.open(new JsonLibraryRepository(filePath), ctx);
    const before = service.library;

    await expect(
      service.update(() => {
        throw new Error('rule broken');
      }),
    ).rejects.toThrow('rule broken');
    expect(service.library).toBe(before);

    await service.update((library) => updateSettings(library, { staleAfterDays: 30 }));
    expect(service.library.settings.staleAfterDays).toBe(30);
  });
});
