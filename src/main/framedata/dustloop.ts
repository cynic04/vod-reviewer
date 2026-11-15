import { z } from 'zod';
import type { Character } from '@shared/domain/characters';
import { isMoveImageName, MOVE_TYPES, type FrameDataMove, type MoveType } from '@shared/domain/frameData';

/**
 * Reads Guilty Gear -Strive- frame data from the Dustloop wiki.
 *
 * Dustloop is a MediaWiki site that stores move data in Cargo tables, and MediaWiki's
 * public API can query those directly (`action=cargoquery`). That gives structured rows
 * per move, with no key and no page scraping.
 */

const API_URL = 'https://www.dustloop.com/wiki/api.php';
const TABLE = 'MoveData_GGST';
const FIELDS = [
  'input',
  'name',
  'type',
  'damage',
  'guard',
  'startup',
  'active',
  'recovery',
  'onBlock',
  'onHit',
  'level',
  'counter',
  'invuln',
  'notes',
  'images',
  'hitboxes',
] as const;

/** Characters whose name on the wiki differs from the one the app shows. */
const WIKI_NAME_OVERRIDES: Readonly<Record<string, string>> = {
  ask: 'Asuka R',
  bed: 'Bedman',
  jko: 'Jack-O',
};

export function wikiCharacterName(character: Character): string {
  return WIKI_NAME_OVERRIDES[character.id] ?? character.name;
}

export function dustloopFrameDataUrl(character: Character): string {
  const page = encodeURIComponent(wikiCharacterName(character).replaceAll(' ', '_'));
  return `https://www.dustloop.com/w/GGST/${page}/Frame_Data`;
}

const HTML_ENTITIES: Readonly<Record<string, string>> = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#039;': "'",
  '&#39;': "'",
  '&nbsp;': ' ',
};

/** Reduces a wiki field (line breaks, links, templates, entities) to plain text. */
export function cleanWikiText(value: string): string {
  return value
    .replace(/<br\s*\/?>/gi, '; ')
    .replace(/<[^>]+>/g, '')
    .replace(/\[\[(?:[^\]|]*\|)?([^\]]*)\]\]/g, '$1')
    .replace(/\{\{[^{}]*\}\}/g, '')
    .replace(/'{2,}/g, '')
    .replace(/&(?:amp|lt|gt|quot|#0?39|nbsp);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
    .replace(/\s*;\s*/g, '; ')
    .replace(/\s+/g, ' ')
    .trim();
}

const responseSchema = z.object({
  cargoquery: z.array(z.object({ title: z.record(z.string(), z.unknown()) })),
});

const TYPE_ORDER: Readonly<Record<MoveType, number>> = { normal: 0, special: 1, super: 2, other: 3 };

/** Normals in the order players think of them; specials and the rest go by name. */
const NORMAL_ORDER = [
  '5P', '5K', 'c.S', 'f.S', '5H', '5D', '5[D]', '6P', '6K', '6S', '6H',
  '2P', '2K', '2S', '2H', '2D', 'j.P', 'j.K', 'j.S', 'j.H', 'j.D',
];

function normalRank(input: string): number {
  const index = NORMAL_ORDER.indexOf(input);
  return index === -1 ? NORMAL_ORDER.length : index;
}

function compareMoves(a: FrameDataMove, b: FrameDataMove): number {
  if (a.type !== b.type) return TYPE_ORDER[a.type] - TYPE_ORDER[b.type];
  if (a.type === 'normal') return normalRank(a.input) - normalRank(b.input) || a.input.localeCompare(b.input);
  return a.name.localeCompare(b.name) || a.input.localeCompare(b.input);
}

function toMoveType(value: string): MoveType {
  const type = value.toLowerCase();
  return MOVE_TYPES.find((candidate) => candidate === type) ?? 'other';
}

/** Turns a `cargoquery` response into sorted moves. Throws if the response is not one. */
export function parseMoves(response: unknown): FrameDataMove[] {
  const parsed = responseSchema.safeParse(response);
  if (!parsed.success) throw new Error('Dustloop returned frame data in an unexpected format.');

  const moves: FrameDataMove[] = [];
  for (const { title } of parsed.data.cargoquery) {
    const field = (name: (typeof FIELDS)[number]): string => {
      const value = title[name];
      return typeof value === 'string' ? cleanWikiText(value) : '';
    };
    /** A `;`-separated list of file names, keeping only ones that are safe to request. */
    const files = (name: 'images' | 'hitboxes'): string[] => {
      const value = title[name];
      if (typeof value !== 'string') return [];
      return value
        .split(';')
        .map((file) => file.trim())
        .filter(isMoveImageName);
    };
    const input = field('input');
    const name = field('name');
    if (input === '' && name === '') continue;

    moves.push({
      input,
      name,
      type: toMoveType(field('type')),
      damage: field('damage'),
      guard: field('guard'),
      startup: field('startup'),
      active: field('active'),
      recovery: field('recovery'),
      onBlock: field('onBlock'),
      onHit: field('onHit'),
      level: field('level'),
      counter: field('counter'),
      invuln: field('invuln'),
      notes: field('notes'),
      images: files('images'),
      hitboxes: files('hitboxes'),
    });
  }
  return moves.sort(compareMoves);
}

export type FetchMoves = (character: Character) => Promise<FrameDataMove[]>;

/** Downloads every move of a character. `userAgent` identifies the app to the wiki. */
export function createDustloopFetcher(userAgent: string, fetchPage: typeof fetch = fetch): FetchMoves {
  return async (character) => {
    const url = new URL(API_URL);
    url.search = new URLSearchParams({
      action: 'cargoquery',
      format: 'json',
      limit: '500',
      tables: TABLE,
      fields: FIELDS.join(','),
      // Names come from the app's own roster, never from user input.
      where: `chara="${wikiCharacterName(character)}"`,
    }).toString();

    const response = await fetchPage(url, {
      headers: { 'User-Agent': userAgent, Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`Dustloop answered ${response.status}.`);

    const moves = parseMoves(await response.json());
    if (moves.length === 0) throw new Error(`Dustloop has no frame data for ${character.name}.`);
    return moves;
  };
}

export interface MoveImage {
  bytes: Uint8Array;
}

export type FetchImage = (fileName: string) => Promise<MoveImage>;

const IMAGE_WIDTH = 480;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const imageInfoSchema = z.object({
  query: z.object({
    pages: z.record(
      z.string(),
      z.object({ imageinfo: z.array(z.object({ thumburl: z.string().optional(), url: z.string() })).optional() }),
    ),
  }),
});

/**
 * Downloads a move picture, scaled down by the wiki. The API is asked where the file
 * lives; the answer is only followed if it points back at Dustloop over HTTPS.
 */
export function createDustloopImageFetcher(userAgent: string, fetchPage: typeof fetch = fetch): FetchImage {
  const headers = { 'User-Agent': userAgent };

  return async (fileName) => {
    if (!isMoveImageName(fileName)) throw new Error('Not a move image name.');

    const lookup = new URL(API_URL);
    lookup.search = new URLSearchParams({
      action: 'query',
      format: 'json',
      prop: 'imageinfo',
      iiprop: 'url',
      iiurlwidth: String(IMAGE_WIDTH),
      titles: `File:${fileName}`,
    }).toString();
    const info = await fetchPage(lookup, { headers, signal: AbortSignal.timeout(15_000) });
    if (!info.ok) throw new Error(`Dustloop answered ${info.status}.`);

    const parsed = imageInfoSchema.safeParse(await info.json());
    const location = parsed.success ? Object.values(parsed.data.query.pages)[0]?.imageinfo?.[0] : undefined;
    if (!location) throw new Error(`Dustloop has no image named "${fileName}".`);

    const imageUrl = new URL(location.thumburl ?? location.url);
    if (imageUrl.protocol !== 'https:' || imageUrl.hostname !== 'www.dustloop.com') {
      throw new Error('Dustloop pointed at an unexpected image location.');
    }

    const image = await fetchPage(imageUrl, { headers, signal: AbortSignal.timeout(20_000) });
    if (!image.ok) throw new Error(`Dustloop answered ${image.status}.`);
    if (!(image.headers.get('content-type') ?? '').startsWith('image/')) throw new Error('Dustloop did not return an image.');

    const bytes = new Uint8Array(await image.arrayBuffer());
    if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error('The image has an unexpected size.');
    return { bytes };
  };
}
