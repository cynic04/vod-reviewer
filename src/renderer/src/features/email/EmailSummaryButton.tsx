import { useState } from 'react';
import type { SessionSummary } from '@shared/domain/schema';
import { Button } from '@renderer/components/Button';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import { reportError, useToastStore } from '@renderer/store/toastStore';
import { EmailSetupDialog } from './EmailSetupDialog';

interface EmailSummaryButtonProps {
  summary: SessionSummary;
}

/**
 * Emails a finished summary - with the session's notes and its study videos - to the
 * address from the email setup. Opens the setup first if no account is connected yet.
 */
export function EmailSummaryButton({ summary }: EmailSummaryButtonProps) {
  const isSetUp = useLibrary().settings.email !== null;
  const sendSummaryEmail = useLibraryStore((state) => state.sendSummaryEmail);
  const [isSending, setIsSending] = useState(false);
  const [isSettingUp, setIsSettingUp] = useState(false);

  const send = (): void => {
    if (!isSetUp) {
      setIsSettingUp(true);
      return;
    }
    setIsSending(true);
    sendSummaryEmail(summary.id)
      .then(({ sentTo }) => useToastStore.getState().push('info', `Summary emailed to ${sentTo}.`))
      .catch(reportError)
      .finally(() => setIsSending(false));
  };

  return (
    <>
      <Button
        icon="mail"
        disabled={isSending || summary.markdown === ''}
        title="Send this summary, your notes and the study videos to your email"
        onClick={send}
      >
        {isSending ? 'Sending...' : 'Email'}
      </Button>
      {isSettingUp && <EmailSetupDialog onClose={() => setIsSettingUp(false)} />}
    </>
  );
}
