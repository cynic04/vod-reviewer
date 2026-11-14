import { execFile } from 'node:child_process';
import { shell } from 'electron';
import { DomainError } from '../library/errors';

/**
 * The parts of the agent harness that touch the operating system. Kept out of
 * `harness.ts` so that it can be exercised in tests with stand-ins.
 */

function isOnPath(command: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('where.exe', [command], { windowsHide: true }, (error) => resolve(error === null));
  });
}

/** Rejects, with a message for the user, when the summarize agent cannot run here. */
export async function assertAgentAvailable(): Promise<void> {
  if (process.platform !== 'win32') {
    throw new DomainError('UNAVAILABLE', 'Summaries are only supported on Windows for now.');
  }
  if (!(await isOnPath('copilot'))) {
    throw new DomainError(
      'UNAVAILABLE',
      'The GitHub Copilot CLI was not found. Install it, run "copilot" once to sign in, then try again.',
    );
  }
}

/**
 * Opens a batch file the way double-clicking it would: in a new window of the user's
 * default terminal.
 */
export async function openTerminal(scriptPath: string): Promise<void> {
  const failure = await shell.openPath(scriptPath);
  if (failure !== '') throw new DomainError('UNAVAILABLE', `The terminal could not be opened: ${failure}`);
}
