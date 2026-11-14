import { useEffect, useSyncExternalStore } from 'react';
import type { ThemePreference } from '@shared/domain/schema';

export type ResolvedTheme = 'light' | 'dark';

const darkSchemeQuery = window.matchMedia('(prefers-color-scheme: dark)');

function subscribeToSystemTheme(listener: () => void): () => void {
  darkSchemeQuery.addEventListener('change', listener);
  return () => darkSchemeQuery.removeEventListener('change', listener);
}

/**
 * Resolves the stored preference against the OS setting and applies it to the document,
 * where the `data-theme` attribute switches the colour tokens in `styles/tokens.css`.
 */
export function useTheme(preference: ThemePreference): ResolvedTheme {
  const systemPrefersDark = useSyncExternalStore(subscribeToSystemTheme, () => darkSchemeQuery.matches);
  const resolved: ResolvedTheme =
    preference === 'system' ? (systemPrefersDark ? 'dark' : 'light') : preference;

  useEffect(() => {
    document.documentElement.dataset.theme = resolved;
  }, [resolved]);

  return resolved;
}
