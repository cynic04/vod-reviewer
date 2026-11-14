import type { Library } from '@shared/domain/schema';
import { useLibraryStore } from './libraryStore';

/**
 * The loaded library. Only call below `<LibraryGate>`, which guarantees it is present.
 * Derive data from it with the pure queries in `selectors.ts`, wrapped in `useMemo`.
 */
export function useLibrary(): Library {
  const library = useLibraryStore((state) => state.library);
  if (library === null) throw new Error('useLibrary was called before the library finished loading.');
  return library;
}
