import { createHash } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getCharacter, type Character } from '@shared/domain/characters';
import {
  isMoveImageName,
  MOVE_TYPES,
  type CharacterFrameData,
  type FrameDataMove,
} from '@shared/domain/frameData';
import { DomainError, notFound } from '../library/errors';
import { dustloopFrameDataUrl, type FetchImage, type FetchMoves } from './dustloop';

/** Frame data only changes with a balance patch, so a copy is good for a week. */
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** 2: moves carry the file names of their pictures. */
const CACHE_VERSION = 2;

const IMAGE_MIME_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
};

const moveSchema = z.object({
  input: z.string(),
  name: z.string(),
  type: z.enum(MOVE_TYPES),
  damage: z.string(),
  guard: z.string(),
  startup: z.string(),
  active: z.string(),
  recovery: z.string(),
  onBlock: z.string(),
  onHit: z.string(),
  level: z.string(),
  counter: z.string(),
  invuln: z.string(),
  notes: z.string(),
  images: z.array(z.string()),
  hitboxes: z.array(z.string()),
});

const cacheSchema = z.object({
  version: z.literal(CACHE_VERSION),
  fetchedAt: z.iso.datetime(),
  moves: z.array(moveSchema).min(1),
});

interface CachedFrameData {
  fetchedAt: string;
  moves: FrameDataMove[];
}

export interface FrameDataServiceDependencies {
  /** Directory holding one JSON file per character. */
  cacheDir: string;
  fetchMoves: FetchMoves;
  fetchImage: FetchImage;
  now: () => Date;
}

/**
 * Serves frame data from a local copy, downloading from Dustloop when there is none or
 * it is more than a week old. The app keeps working offline, and the wiki is asked at
 * most once per character per week (or when the user presses refresh). Move pictures
 * are downloaded one at a time, when first looked at, and then kept.
 */
export class FrameDataService {
  readonly #deps: FrameDataServiceDependencies;
  /** Downloads in progress, so simultaneous requests for a character share one. */
  readonly #downloads = new Map<string, Promise<CachedFrameData>>();
  readonly #imageDownloads = new Map<string, Promise<void>>();

  constructor(deps: FrameDataServiceDependencies) {
    this.#deps = deps;
  }

  async get(characterId: string, options: { refresh: boolean }): Promise<CharacterFrameData> {
    const character = getCharacter(characterId);
    if (!character) throw notFound('Character', characterId);

    const cached = await this.#read(character);
    const result = (data: CachedFrameData, isStale: boolean): CharacterFrameData => ({
      characterId: character.id,
      moves: data.moves,
      fetchedAt: data.fetchedAt,
      isStale,
      sourceUrl: dustloopFrameDataUrl(character),
    });

    const isFresh = cached !== null && this.#deps.now().getTime() - new Date(cached.fetchedAt).getTime() < MAX_AGE_MS;
    if (cached !== null && isFresh && !options.refresh) return result(cached, false);

    try {
      return result(await this.#download(character), false);
    } catch (error) {
      // An old copy beats no copy: balance patches are rare and being offline is not.
      if (cached !== null) return result(cached, true);
      const reason = error instanceof Error ? ` ${error.message}` : '';
      throw new DomainError('UNAVAILABLE', `Frame data for ${character.name} could not be downloaded.${reason}`);
    }
  }

  /**
   * A move picture as a local file, downloaded from Dustloop the first time it is asked
   * for and kept from then on. The name is validated and never used as a path: the file
   * is stored under a hash of it.
   */
  async getImage(fileName: string): Promise<{ filePath: string; mimeType: string }> {
    const extension = path.extname(fileName).toLowerCase();
    const mimeType = IMAGE_MIME_TYPES[extension];
    if (!isMoveImageName(fileName) || mimeType === undefined) throw notFound('Move image', fileName);

    const directory = path.join(this.#deps.cacheDir, 'images');
    const hash = createHash('sha256').update(fileName).digest('hex').slice(0, 32);
    const filePath = path.join(directory, `${hash}${extension}`);
    const isSaved = await access(filePath).then(
      () => true,
      () => false,
    );

    if (!isSaved) {
      let download = this.#imageDownloads.get(filePath);
      if (!download) {
        download = (async (): Promise<void> => {
          const { bytes } = await this.#deps.fetchImage(fileName);
          await mkdir(directory, { recursive: true });
          await writeFile(filePath, bytes);
        })().finally(() => this.#imageDownloads.delete(filePath));
        this.#imageDownloads.set(filePath, download);
      }
      await download;
    }
    return { filePath, mimeType };
  }

  #filePath(character: Character): string {
    return path.join(this.#deps.cacheDir, `${character.id}.json`);
  }

  async #read(character: Character): Promise<CachedFrameData | null> {
    try {
      const parsed = cacheSchema.safeParse(JSON.parse(await readFile(this.#filePath(character), 'utf8')));
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  }

  #download(character: Character): Promise<CachedFrameData> {
    const running = this.#downloads.get(character.id);
    if (running) return running;

    const download = (async (): Promise<CachedFrameData> => {
      const data = { fetchedAt: this.#deps.now().toISOString(), moves: await this.#deps.fetchMoves(character) };
      await mkdir(this.#deps.cacheDir, { recursive: true });
      await writeFile(this.#filePath(character), JSON.stringify({ version: CACHE_VERSION, ...data }, null, 2), 'utf8');
      return data;
    })().finally(() => this.#downloads.delete(character.id));

    this.#downloads.set(character.id, download);
    return download;
  }
}
