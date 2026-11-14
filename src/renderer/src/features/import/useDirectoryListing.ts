import { useEffect, useState } from 'react';
import type { DirectoryListing } from '@shared/ipc/contract';
import { errorMessage, invoke } from '@renderer/lib/api';

export type DirectoryListingState =
  | { status: 'loading' }
  | { status: 'ready'; listing: DirectoryListing }
  | { status: 'error'; message: string };

interface Result {
  /** The request this result answers, so a stale result is never shown for a newer request. */
  key: string;
  state: DirectoryListingState;
}

/**
 * Lists a directory of the videos folder (`null` is its root). Pass a new `revision` to
 * re-read the same directory, for example after the videos folder itself was changed.
 */
export function useDirectoryListing(directory: string | null, revision: number): DirectoryListingState {
  const key = `${revision}:${directory ?? ''}`;
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let isCurrent = true;
    invoke('videos:browse', { directory })
      .then((listing) => {
        if (isCurrent) setResult({ key, state: { status: 'ready', listing } });
      })
      .catch((error: unknown) => {
        if (isCurrent) setResult({ key, state: { status: 'error', message: errorMessage(error) } });
      });
    return () => {
      isCurrent = false;
    };
  }, [directory, key]);

  return result?.key === key ? result.state : { status: 'loading' };
}
