import { useCallback, useEffect, useState } from 'react';
import type { CharacterFrameData } from '@shared/domain/frameData';
import { errorMessage, invoke } from '@renderer/lib/api';

export type FrameDataState =
  | { status: 'loading' }
  | { status: 'ready'; data: CharacterFrameData }
  | { status: 'error'; message: string };

interface Request {
  characterId: string;
  /** Bumped to ask again for the same character. */
  attempt: number;
  refresh: boolean;
}

/**
 * Loads a character's frame data from the main process, which serves a saved copy when
 * it has a recent one. `refresh` downloads a new copy from Dustloop.
 */
export function useFrameData(characterId: string): { state: FrameDataState; refresh: () => void } {
  const [request, setRequest] = useState<Request>({ characterId, attempt: 0, refresh: false });
  const [result, setResult] = useState<{ key: string; state: FrameDataState } | null>(null);

  // A refresh belongs to the character it was asked for, not to whichever is picked next.
  const current = request.characterId === characterId ? request : { characterId, attempt: 0, refresh: false };
  const { attempt, refresh: shouldRefresh } = current;
  const key = `${characterId}:${attempt}`;

  useEffect(() => {
    let isCurrent = true;
    invoke('frameData:get', { characterId, refresh: shouldRefresh })
      .then((data) => {
        if (isCurrent) setResult({ key, state: { status: 'ready', data } });
      })
      .catch((error: unknown) => {
        if (isCurrent) setResult({ key, state: { status: 'error', message: errorMessage(error) } });
      });
    return () => {
      isCurrent = false;
    };
  }, [characterId, key, shouldRefresh]);

  const refresh = useCallback(
    () => setRequest({ characterId, attempt: attempt + 1, refresh: true }),
    [characterId, attempt],
  );

  return { state: result?.key === key ? result.state : { status: 'loading' }, refresh };
}
