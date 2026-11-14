/**
 * Guilty Gear -Strive- roster, in character-select order (base roster, then season passes).
 * Source: https://www.guiltygear.com/ggst/en/character/
 *
 * The roster is static reference data that ships with the app rather than user data,
 * so it lives in code. Folders point at it through `Folder.characterId`.
 */

export type BattleType = 'Balance' | 'Rushdown' | 'Power' | 'Zoning' | 'Unique' | 'One Shot' | 'Shooting';

export interface Character {
  /** Stable slug, also the portrait file name (`assets/characters/<id>.jpg`). */
  readonly id: string;
  readonly name: string;
  readonly battleType: BattleType;
  /** 0 is the base roster; 1+ is the season pass that added the character. */
  readonly season: number;
}

export const CHARACTERS = [
  { id: 'sol', name: 'Sol Badguy', battleType: 'Balance', season: 0 },
  { id: 'kyk', name: 'Ky Kiske', battleType: 'Balance', season: 0 },
  { id: 'may', name: 'May', battleType: 'Power', season: 0 },
  { id: 'axl', name: 'Axl Low', battleType: 'Zoning', season: 0 },
  { id: 'chp', name: 'Chipp Zanuff', battleType: 'Rushdown', season: 0 },
  { id: 'pot', name: 'Potemkin', battleType: 'Power', season: 0 },
  { id: 'fau', name: 'Faust', battleType: 'Unique', season: 0 },
  { id: 'mll', name: 'Millia Rage', battleType: 'Rushdown', season: 0 },
  { id: 'zat', name: 'Zato-1', battleType: 'Unique', season: 0 },
  { id: 'ram', name: 'Ramlethal Valentine', battleType: 'Balance', season: 0 },
  { id: 'leo', name: 'Leo Whitefang', battleType: 'Rushdown', season: 0 },
  { id: 'nag', name: 'Nagoriyuki', battleType: 'One Shot', season: 0 },
  { id: 'gio', name: 'Giovanna', battleType: 'Rushdown', season: 0 },
  { id: 'anji', name: 'Anji Mito', battleType: 'Balance', season: 0 },
  { id: 'ino', name: 'I-No', battleType: 'Rushdown', season: 0 },
  { id: 'gld', name: 'Goldlewis Dickinson', battleType: 'Power', season: 1 },
  { id: 'jko', name: "Jack-O'", battleType: 'Unique', season: 1 },
  { id: 'cos', name: 'Happy Chaos', battleType: 'Shooting', season: 1 },
  { id: 'bkn', name: 'Baiken', battleType: 'Balance', season: 1 },
  { id: 'tst', name: 'Testament', battleType: 'Zoning', season: 1 },
  { id: 'bgt', name: 'Bridget', battleType: 'Balance', season: 2 },
  { id: 'sin', name: 'Sin Kiske', battleType: 'Balance', season: 2 },
  { id: 'bed', name: 'Bedman?', battleType: 'Unique', season: 2 },
  { id: 'ask', name: 'Asuka R#', battleType: 'Unique', season: 2 },
  { id: 'jhn', name: 'Johnny', battleType: 'Zoning', season: 3 },
  { id: 'elp', name: 'Elphelt Valentine', battleType: 'Rushdown', season: 3 },
  { id: 'aba', name: 'A.B.A', battleType: 'Unique', season: 3 },
  { id: 'sly', name: 'Slayer', battleType: 'Power', season: 3 },
  { id: 'dzy', name: 'Queen Dizzy', battleType: 'Unique', season: 4 },
  { id: 'ven', name: 'Venom', battleType: 'Zoning', season: 4 },
  { id: 'uni', name: 'Unika', battleType: 'Balance', season: 4 },
  { id: 'luc', name: 'Lucy', battleType: 'Balance', season: 4 },
  { id: 'jam', name: 'Jam Kuradoberi', battleType: 'Rushdown', season: 5 },
  { id: 'rbk', name: 'Robo-Ky', battleType: 'Unique', season: 5 },
] as const satisfies readonly Character[];

export type CharacterId = (typeof CHARACTERS)[number]['id'];

const charactersById: ReadonlyMap<string, Character> = new Map(CHARACTERS.map((c) => [c.id, c]));

export function getCharacter(id: string | null): Character | undefined {
  return id === null ? undefined : charactersById.get(id);
}

/** Deterministic id of the matchup folder that belongs to a character. */
export function matchupFolderId(characterId: string): string {
  return `matchup-${characterId}`;
}
