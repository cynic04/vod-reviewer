/**
 * Frame data for a character's moves, as published on the Dustloop wiki.
 *
 * Every value is kept as the text Dustloop gives, because many are not plain numbers:
 * "5, 11" (two hits), "Until Landing+16", "-4~+2", "KD +37 (IAD)".
 */

export const MOVE_TYPES = ['normal', 'special', 'super', 'other'] as const;
export type MoveType = (typeof MOVE_TYPES)[number];

export interface FrameDataMove {
  /** Numpad notation, e.g. `236K`, `c.S`, `j.H`. */
  input: string;
  /** Name of a special or super; empty for normals. */
  name: string;
  type: MoveType;
  damage: string;
  /** How it must be blocked: `All`, `Low`, `High`, `Throw`... */
  guard: string;
  startup: string;
  active: string;
  recovery: string;
  /** Frame advantage for the attacker when the move is blocked. */
  onBlock: string;
  onHit: string;
  /** Attack level, which decides blockstun and hitstun. */
  level: string;
  /** Counter-hit type. */
  counter: string;
  invuln: string;
  notes: string;
  /** File names of the move's pictures on Dustloop; load them with `moveImageUrl`. */
  images: string[];
  /** File names of its hitbox pictures. */
  hitboxes: string[];
}

/**
 * Whether a name is a plain image file name of the kind Dustloop uses for moves. Checked
 * wherever a name is turned into a request or a path, so it can never smuggle one in.
 */
export function isMoveImageName(name: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9 _.()'!&+,[\]-]{0,150}\.(?:png|jpe?g|gif|webp)$/i.test(name) && !name.includes('..');
}

export interface CharacterFrameData {
  characterId: string;
  moves: FrameDataMove[];
  /** When this copy was downloaded from Dustloop. */
  fetchedAt: string;
  /** True when a refresh was due but failed, so an older copy is being shown. */
  isStale: boolean;
  /** The character's frame data page on Dustloop. */
  sourceUrl: string;
}

export type AdvantageSign = 'plus' | 'minus' | 'even';

/**
 * Whether a frame advantage value leaves the attacker ahead, behind or even. Reads the
 * first number in the text; `null` when there is none (throws, "Until Landing"...).
 */
export function advantageSign(value: string): AdvantageSign | null {
  const match = /[+-]\d+|±\s*0|(?<![\d.])0(?![\d.])/.exec(value);
  if (!match) return null;
  const amount = Number(match[0].replace('±', '').trim());
  return amount > 0 ? 'plus' : amount < 0 ? 'minus' : 'even';
}

const normalise = (text: string): string => text.toLowerCase().replace(/\s+/g, '');

/** True when a move's input or name contains the query, ignoring case and spaces. */
export function moveMatches(move: FrameDataMove, query: string): boolean {
  const wanted = normalise(query);
  return wanted === '' || normalise(move.input).includes(wanted) || normalise(move.name).includes(wanted);
}
