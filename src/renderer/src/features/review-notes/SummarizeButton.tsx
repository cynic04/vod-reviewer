import { useState } from 'react';
import type { SessionSummary } from '@shared/domain/schema';
import { Button } from '@renderer/components/Button';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError } from '@renderer/store/toastStore';

interface SummarizeButtonProps {
  sessionId: string;
  summary: SessionSummary | undefined;
  variant?: 'primary' | 'secondary';
}

/**
 * Starts the summarize agent for a session: a terminal window opens, GitHub Copilot runs
 * the `/summarize` skill there, and the result shows up in the app when it is saved.
 */
export function SummarizeButton({ sessionId, summary, variant = 'secondary' }: SummarizeButtonProps) {
  const requestSummary = useLibraryStore((state) => state.requestSummary);
  const [isStarting, setIsStarting] = useState(false);
  const isPending = summary?.status === 'pending';

  const start = (): void => {
    setIsStarting(true);
    requestSummary(sessionId)
      .catch(reportError)
      .finally(() => setIsStarting(false));
  };

  return (
    <Button
      variant={variant}
      icon="sparkle"
      disabled={isStarting || isPending}
      title="Opens a terminal window where GitHub Copilot turns this session's notes into coaching advice"
      onClick={start}
    >
      {isPending ? 'Summarizing...' : summary ? 'Summarize again' : 'Summarize'}
    </Button>
  );
}
