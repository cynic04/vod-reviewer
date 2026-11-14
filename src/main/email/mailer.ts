import nodemailer from 'nodemailer';
import type { EmailSettings } from '@shared/domain/schema';
import { DomainError } from '../library/errors';

export interface OutgoingMessage {
  subject: string;
  html: string;
  text: string;
  /** Images referenced from the HTML as `cid:<cid>`. */
  inlineImages?: { cid: string; path: string }[];
}

/** Sends one message through the configured account. Rejects with a `DomainError`. */
export type SendMail = (settings: EmailSettings, password: string, message: OutgoingMessage) => Promise<void>;

/** The implicit-TLS submission port; every other port upgrades with STARTTLS. */
const IMPLICIT_TLS_PORT = 465;

function describeFailure(error: unknown, settings: EmailSettings): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
  switch (code) {
    case 'EAUTH':
      return settings.host.endsWith('gmail.com')
        ? 'Gmail rejected the sign-in. Use a 16-character app password (not your normal password), and check the address.'
        : 'The mail server rejected the sign-in. Check the address and password.';
    case 'EDNS':
    case 'ENOTFOUND':
      return `The mail server "${settings.host}" could not be found. Check the server name and your connection.`;
    case 'ECONNECTION':
    case 'ECONNREFUSED':
    case 'ETIMEDOUT':
    case 'ESOCKET':
      return `Could not connect to ${settings.host} on port ${settings.port}. Check the server, the port and your connection.`;
    case 'EENVELOPE':
      return 'The mail server did not accept the sender or recipient address.';
    default:
      return error instanceof Error ? `The email could not be sent: ${error.message}` : 'The email could not be sent.';
  }
}

/**
 * Creates the SMTP sender. `allowInsecure` exists for tests against a local server
 * without TLS; the app never sets it, so a password is only ever sent over TLS.
 */
export function createSmtpSender(options: { allowInsecure?: boolean } = {}): SendMail {
  return async (settings, password, message) => {
    const transport = nodemailer.createTransport({
      host: settings.host,
      port: settings.port,
      secure: settings.port === IMPLICIT_TLS_PORT,
      requireTLS: settings.port !== IMPLICIT_TLS_PORT && !options.allowInsecure,
      auth: { user: settings.from, pass: password },
      connectionTimeout: 15_000,
      greetingTimeout: 15_000,
      socketTimeout: 30_000,
    });

    try {
      await transport.sendMail({
        from: { name: 'VOD Reviewer', address: settings.from },
        to: settings.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        attachments: message.inlineImages?.map((image) => ({
          cid: image.cid,
          path: image.path,
          filename: 'portrait.jpg',
          contentDisposition: 'inline' as const,
        })),
      });
    } catch (error) {
      throw new DomainError('UNAVAILABLE', describeFailure(error, settings));
    } finally {
      transport.close();
    }
  };
}
