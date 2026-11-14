import { useId, useState, type SyntheticEvent } from 'react';
import { DEFAULT_EMAIL_ADDRESS, EMAIL_PROVIDERS } from '@shared/domain/constants';
import { Button } from '@renderer/components/Button';
import { Dialog } from '@renderer/components/Dialog';
import { errorMessage } from '@renderer/lib/api';
import { useLibrary } from '@renderer/store/hooks';
import { useLibraryStore } from '@renderer/store/libraryStore';
import styles from './EmailSetupDialog.module.css';

const OTHER_PROVIDER = 'other';
const GMAIL = EMAIL_PROVIDERS[0];

interface EmailSetupDialogProps {
  onClose: () => void;
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'done'; message: string } | { kind: 'error'; message: string };

/**
 * Connects the email account that sends session summaries. The password goes straight
 * to the main process, which stores it encrypted; it is never kept in this window.
 */
export function EmailSetupDialog({ onClose }: EmailSetupDialogProps) {
  const current = useLibrary().settings.email;
  const configureEmail = useLibraryStore((state) => state.configureEmail);
  const removeEmail = useLibraryStore((state) => state.removeEmail);
  const sendTestEmail = useLibraryStore((state) => state.sendTestEmail);
  const formId = useId();

  const [to, setTo] = useState(current?.to ?? DEFAULT_EMAIL_ADDRESS);
  const [from, setFrom] = useState(current?.from ?? DEFAULT_EMAIL_ADDRESS);
  const [host, setHost] = useState(current?.host ?? GMAIL.host);
  const [port, setPort] = useState(String(current?.port ?? GMAIL.port));
  const [password, setPassword] = useState('');
  const [autoSend, setAutoSend] = useState(current?.autoSend ?? true);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const provider = EMAIL_PROVIDERS.find((candidate) => candidate.host === host && String(candidate.port) === port);
  const [isCustomServer, setIsCustomServer] = useState(provider === undefined);
  const isGmail = !isCustomServer && provider?.id === 'gmail';
  const isBusy = status.kind === 'busy';

  const chooseProvider = (id: string): void => {
    const chosen = EMAIL_PROVIDERS.find((candidate) => candidate.id === id);
    setIsCustomServer(chosen === undefined);
    if (chosen) {
      setHost(chosen.host);
      setPort(String(chosen.port));
    }
  };

  const save = (): Promise<void> =>
    configureEmail({
      to: to.trim(),
      from: from.trim(),
      host: host.trim(),
      port: Number(port),
      autoSend,
      password: password === '' ? null : password,
    }).then(() => setPassword(''));

  const run = (action: () => Promise<string>): void => {
    setStatus({ kind: 'busy' });
    action().then(
      (message) => setStatus({ kind: 'done', message }),
      (error: unknown) => setStatus({ kind: 'error', message: errorMessage(error) }),
    );
  };

  const onSubmit = (event: SyntheticEvent): void => {
    event.preventDefault();
    run(async () => {
      await save();
      return 'Saved.';
    });
  };

  const saveAndTest = (): void =>
    run(async () => {
      await save();
      const { sentTo } = await sendTestEmail();
      return `Saved. A test email is on its way to ${sentTo}.`;
    });

  const remove = (): void =>
    run(async () => {
      await removeEmail();
      onClose();
      return '';
    });

  return (
    <Dialog
      title="Email setup"
      onClose={onClose}
      footer={
        <>
          {current && (
            <Button variant="danger" className={styles.remove} disabled={isBusy} onClick={remove}>
              Remove account
            </Button>
          )}
          <Button disabled={isBusy} onClick={saveAndTest}>
            Save and send test
          </Button>
          <Button type="submit" form={formId} variant="primary" disabled={isBusy}>
            Save
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={onSubmit}>
        <p className={styles.intro}>
          Session summaries are emailed from your own account, so they reach your phone like any other mail.
        </p>

        <div className={styles.field}>
          <label htmlFor={`${formId}-to`}>Send summaries to</label>
          <input
            id={`${formId}-to`}
            type="email"
            required
            value={to}
            data-autofocus
            onChange={(event) => setTo(event.target.value)}
          />
        </div>

        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={`${formId}-provider`}>Sending account</label>
            <select
              id={`${formId}-provider`}
              value={isCustomServer ? OTHER_PROVIDER : (provider?.id ?? OTHER_PROVIDER)}
              onChange={(event) => chooseProvider(event.target.value)}
            >
              {EMAIL_PROVIDERS.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </option>
              ))}
              <option value={OTHER_PROVIDER}>Other</option>
            </select>
          </div>
          <div className={styles.field}>
            <label htmlFor={`${formId}-from`}>Account address</label>
            <input
              id={`${formId}-from`}
              type="email"
              required
              value={from}
              onChange={(event) => setFrom(event.target.value)}
            />
          </div>
        </div>

        {isCustomServer && (
          <div className={styles.row}>
            <div className={styles.field}>
              <label htmlFor={`${formId}-host`}>SMTP server</label>
              <input
                id={`${formId}-host`}
                type="text"
                required
                value={host}
                placeholder="smtp.example.com"
                spellCheck={false}
                onChange={(event) => setHost(event.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label htmlFor={`${formId}-port`}>Port</label>
              <input
                id={`${formId}-port`}
                type="number"
                required
                min={1}
                max={65535}
                value={port}
                onChange={(event) => setPort(event.target.value)}
              />
            </div>
          </div>
        )}

        <div className={styles.field}>
          <label htmlFor={`${formId}-password`}>{isGmail ? 'App password' : 'Password'}</label>
          <input
            id={`${formId}-password`}
            type="password"
            required={current === null}
            value={password}
            autoComplete="off"
            placeholder={current ? 'Saved - leave blank to keep it' : ''}
            onChange={(event) => setPassword(event.target.value)}
          />
          <p className={styles.help}>
            {isGmail ? (
              <>
                Gmail needs a 16-character <strong>app password</strong>, not your normal one. Create it at{' '}
                <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer noopener">
                  myaccount.google.com/apppasswords
                </a>{' '}
                (2-Step Verification must be on).{' '}
              </>
            ) : (
              'Most providers require an app password when two-factor sign-in is on. '
            )}
            It is stored encrypted on this PC and only ever sent to the mail server.
          </p>
        </div>

        <label className={styles.checkbox}>
          <input type="checkbox" checked={autoSend} onChange={(event) => setAutoSend(event.target.checked)} />
          <span>Email each summary automatically as soon as it is written</span>
        </label>

        {status.kind === 'done' && status.message !== '' && (
          <p className={styles.done} role="status">
            {status.message}
          </p>
        )}
        {status.kind === 'error' && (
          <p className={styles.error} role="alert">
            {status.message}
          </p>
        )}
      </form>
    </Dialog>
  );
}
