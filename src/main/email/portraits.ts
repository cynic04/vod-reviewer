/**
 * Character portraits as files the main process can attach to an email. electron-vite's
 * `?asset` imports copy each image next to the built main process and yield its path.
 */
const portraitFiles = import.meta.glob<string>('../../renderer/src/assets/characters/*.jpg', {
  query: '?asset',
  import: 'default',
  eager: true,
});

const portraitPaths: ReadonlyMap<string, string> = new Map(
  Object.entries(portraitFiles).map(([source, filePath]) => [source.replace(/^.*\/([^/]+)\.jpg$/, '$1'), filePath]),
);

export function resolvePortrait(characterId: string): string | null {
  return portraitPaths.get(characterId) ?? null;
}
