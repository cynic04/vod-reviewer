import type { EmailSettings, Library } from '@shared/domain/schema';
import type { IpcRequest } from '@shared/ipc/contract';
import { DomainError } from '../library/errors';
import { updateSettings } from '../library/operations';
import type { LibraryService } from '../library/service';
import { buildSummaryEmail, escapeHtml, PORTRAIT_CONTENT_ID } from './content';
import type { CredentialStore } from './credentials';
import type { OutgoingMessage, SendMail } from './mailer';

export interface EmailServiceDependencies {
  library: LibraryService;
  credentials: CredentialStore;
  send: SendMail;
  /** Path of a character's portrait file, or `null` if there is none. */
  resolvePortrait: (characterId: string) => string | null;
}

const NOT_SET_UP = 'Email is not set up yet. Add your account in Settings first.';

/** Sends summaries to the user's own inbox through their email account. */
export class EmailService {
  readonly #deps: EmailServiceDependencies;

  constructor(deps: EmailServiceDependencies) {
    this.#deps = deps;
  }

  /**
   * Saves the account. The password is stored first, so the library never claims email
   * is set up while no password exists.
   */
  async configure({ password, ...settings }: IpcRequest<'email:configure'>): Promise<Library> {
    const { library, credentials } = this.#deps;
    if (password !== null) {
      await credentials.set(password);
    } else if ((await credentials.get()) === null) {
      throw new DomainError('INVALID_REQUEST', 'Enter the password for the sending account.');
    }
    return library.update((current) => updateSettings(current, { email: settings }));
  }

  async remove(): Promise<Library> {
    await this.#deps.credentials.clear();
    return this.#deps.library.update((current) => updateSettings(current, { email: null }));
  }

  async sendTest(): Promise<{ sentTo: string }> {
    return this.#send((settings) => ({
      subject: 'VOD Reviewer: email is set up',
      text: `Email is working. Summaries will be sent to ${settings.to}.`,
      html: `<div style="font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.6;color:#121215;"><p style="margin:0 0 8px;font-family:'Arial Black',Impact,sans-serif;font-style:italic;font-size:22px;text-transform:uppercase;">VOD<span style="color:#e8262a;">//</span>Reviewer</p><p style="margin:0;">Email is working. Summaries will be sent to <strong>${escapeHtml(settings.to)}</strong>.</p></div>`,
    }));
  }

  async sendSummary(summaryId: string): Promise<{ sentTo: string }> {
    return this.#send(() => {
      const { subject, text, html, portraitPath } = buildSummaryEmail(
        this.#deps.library.library,
        summaryId,
        this.#deps.resolvePortrait,
      );
      return {
        subject,
        text,
        html,
        ...(portraitPath === null ? {} : { inlineImages: [{ cid: PORTRAIT_CONTENT_ID, path: portraitPath }] }),
      };
    });
  }

  async #send(build: (settings: EmailSettings) => OutgoingMessage): Promise<{ sentTo: string }> {
    const settings = this.#deps.library.library.settings.email;
    if (settings === null) throw new DomainError('CONFLICT', NOT_SET_UP);

    const password = await this.#deps.credentials.get();
    if (password === null) {
      throw new DomainError('CONFLICT', 'The saved email password could not be read. Enter it again in Settings.');
    }

    await this.#deps.send(settings, password, build(settings));
    return { sentTo: settings.to };
  }
}
