import { getCharacter } from '@shared/domain/characters';
import type { Folder } from '@shared/domain/schema';

/**
 * Portrait URLs keyed by character id, resolved by Vite at build time from
 * `assets/characters/<id>.jpg`. A character without a file simply has no entry.
 */
const portraitModules = import.meta.glob<string>('../../assets/characters/*.jpg', {
  eager: true,
  import: 'default',
});

const portraitUrls: ReadonlyMap<string, string> = new Map(
  Object.entries(portraitModules).map(([path, url]) => [path.replace(/^.*\/([^/]+)\.jpg$/, '$1'), url]),
);

export function portraitUrl(characterId: string | null): string | undefined {
  return characterId === null ? undefined : portraitUrls.get(characterId);
}

/** `vs. Sol Badguy` for a matchup folder, the folder's own name otherwise. */
export function folderLabel(folder: Folder): string {
  const character = getCharacter(folder.characterId);
  return character ? `vs. ${character.name}` : folder.name;
}
