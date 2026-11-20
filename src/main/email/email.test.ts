import type { AddressInfo } from 'node:net';
import { simpleParser, type ParsedMail } from 'mailparser';
import { SMTPServer } from 'smtp-server';
import { afterEach, describe, expect, it } from 'vitest';
import { matchupFolderId } from '@shared/domain/characters';
import type { EmailSettings, Library } from '@shared/domain/schema';
import {
  completeSummary,
  createEmptyLibrary,
  createFolder,
  createNote,
  importVideo,
  requestSummary,
  updateSettings,
  type OperationContext,
} from '../library/operations';
import type { LibraryRepository } from '../library/repository';
import { LibraryService } from '../library/service';
import { buildSummaryEmail, extractVideos, PORTRAIT_CONTENT_ID, renderSummaryMarkdown } from './content';
import type { CredentialStore } from './credentials';
import { createSmtpSender, type OutgoingMessage } from './mailer';
import { EmailService } from './service';

const SUMMARY = `## Overview

You lost to **anti-airs** & jump-ins.

### Jumping at round start (neutral)

- **What happens:** you jump (0:14).

## Study material

**Matchup footage**

- [WALTER (Millia) vs Totsubunger (Sol)](https://www.youtube.com/watch?v=jOEraCUU4aw) - watch the anti-airs.
- [Same video again](https://youtu.be/jOEraCUU4aw) - duplicate.
- [Dustloop](https://www.dustloop.com/w/GGST/Sol_Badguy/Counterstrategy) - not a video.
- [Sneaky](javascript:alert(1)) - not a link.

<img src=x onerror="alert(1)">
`;

function testContext(): OperationContext {
  let counter = 0;
  return { now: () => new Date('2026-11-14T10:00:00.000Z'), newId: () => `id-${(counter += 1)}` };
}

/** A library with one summarized video vs. Sol (or in a custom folder). */
function summarizedLibrary(options: { customFolder?: boolean } = {}): { library: Library; summaryId: string } {
  const ctx = testContext();
  let library = updateSettings(createEmptyLibrary(ctx), { playerCharacterId: 'mll' });
  let folderId = matchupFolderId('sol');
  if (options.customFolder) {
    library = createFolder(library, 'Tournament sets', ctx);
    folderId = library.folders.at(-1)?.id ?? '';
  }
  const imported = importVideo(
    library,
    {
      filePath: 'C:\\Videos\\set.mp4',
      fileName: 'set.mp4',
      fileSizeBytes: 1,
      recordedAt: '2026-11-10T21:00:00.000Z',
      folderId,
    },
    ctx,
  );
  const videoId = imported.video.id;
  const first = createNote(imported.library, { videoId, timeSeconds: 125, body: 'Never anti-aired <him>' }, ctx);
  const second = createNote(
    first.library,
    { videoId, timeSeconds: 14, body: 'Jumped in,\ngot 6P again' },
    ctx,
  );
  const requested = requestSummary(second.library, videoId, ctx);
  return {
    library: completeSummary(requested.library, requested.summary.id, SUMMARY, ctx),
    summaryId: requested.summary.id,
  };
}

const portraitOf = (characterId: string): string => `C:\\portraits\\${characterId}.jpg`;

describe('summary email content', () => {
  it('addresses the matchup and carries the summary, the notes and a text alternative', () => {
    const { library, summaryId } = summarizedLibrary();
    const email = buildSummaryEmail(library, summaryId, portraitOf);

    expect(email.subject).toBe('VOD review: vs. Sol Badguy - set (Nov 14, 2026)');
    expect(email.portraitPath).toBe('C:\\portraits\\sol.jpg');
    expect(email.html).toContain(`src="cid:${PORTRAIT_CONTENT_ID}"`);
    expect(email.html).toContain('Playing Millia Rage');
    expect(email.html).toContain('Recorded Nov 10, 2026');
    // Notes in video order, escaped, with line breaks kept.
    expect(email.html.indexOf('Jumped in,<br>got 6P again')).toBeLessThan(email.html.indexOf('Never anti-aired &lt;him&gt;'));
    expect(email.text).toContain('0:14  Jumped in,\ngot 6P again');
    expect(email.text).toContain('## Overview');
  });

  it('uses the folder name and no portrait for a video outside a matchup', () => {
    const { library, summaryId } = summarizedLibrary({ customFolder: true });
    const email = buildSummaryEmail(library, summaryId, portraitOf);

    expect(email.subject).toContain('VOD review: Tournament sets - set');
    expect(email.portraitPath).toBeNull();
    expect(email.html).not.toContain('cid:');
    expect(email.html).not.toContain('Playing Millia Rage');
  });

  it('leaves the portrait out when its file is missing', () => {
    const { library, summaryId } = summarizedLibrary();
    const email = buildSummaryEmail(library, summaryId, () => null);
    expect(email.portraitPath).toBeNull();
    expect(email.html).not.toContain('cid:');
  });

  it('turns linked YouTube videos into cards, once each', () => {
    expect(extractVideos(SUMMARY)).toEqual([
      {
        id: 'jOEraCUU4aw',
        title: 'WALTER (Millia) vs Totsubunger (Sol)',
        url: 'https://www.youtube.com/watch?v=jOEraCUU4aw',
      },
    ]);
    const { library, summaryId } = summarizedLibrary();
    const { html } = buildSummaryEmail(library, summaryId, portraitOf);
    expect(html).toContain('Watch on your phone');
    expect(html.match(/i\.ytimg\.com\/vi\/jOEraCUU4aw\/mqdefault\.jpg/g)).toHaveLength(1);
  });

  it('renders markdown with inline styles and neutralises anything executable', () => {
    const html = renderSummaryMarkdown(SUMMARY);

    expect(html).toMatch(/<h2 style="[^"]+">Overview<\/h2>/);
    expect(html).toMatch(/<h3 style="[^"]+">Jumping at round start \(neutral\)<\/h3>/);
    expect(html).toMatch(/<strong style="[^"]+">anti-airs<\/strong> &amp; jump-ins/);
    expect(html).toMatch(/<a href="https:\/\/www\.dustloop\.com\/w\/GGST\/Sol_Badguy\/Counterstrategy" style="[^"]+">Dustloop<\/a>/);
    // A javascript: link keeps its text but loses its target; raw HTML is shown as text.
    expect(html).toContain('Sneaky');
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;img src=x onerror=');
  });

  it('refuses a video that has no summary text', () => {
    const { library, summaryId } = summarizedLibrary();
    const pending = requestSummary(library, library.videos[0]?.id ?? '', testContext());
    const empty = { ...pending.library, summaries: [{ ...pending.summary, markdown: '' }] };
    expect(() => buildSummaryEmail(empty, pending.summary.id, portraitOf)).toThrow(/not been summarized/);
    expect(() => buildSummaryEmail(library, 'missing', portraitOf)).toThrow(/does not exist/);
    expect(summaryId).not.toBe(pending.summary.id);
  });
});

function memoryCredentials(initial: string | null = null): CredentialStore & { value: string | null } {
  const store = {
    value: initial,
    get: () => Promise.resolve(store.value),
    set: (password: string) => {
      store.value = password;
      return Promise.resolve();
    },
    clear: () => {
      store.value = null;
      return Promise.resolve();
    },
  };
  return store;
}

async function serviceFixture(credentials = memoryCredentials()): Promise<{
  service: EmailService;
  library: LibraryService;
  summaryId: string;
  sent: { settings: EmailSettings; password: string; message: OutgoingMessage }[];
  credentials: ReturnType<typeof memoryCredentials>;
}> {
  const { library: initial, summaryId } = summarizedLibrary();
  const repository: LibraryRepository = { load: () => Promise.resolve(initial), save: () => Promise.resolve() };
  const library = await LibraryService.open(repository, testContext());
  const sent: { settings: EmailSettings; password: string; message: OutgoingMessage }[] = [];
  const service = new EmailService({
    library,
    credentials,
    send: (settings, password, message) => {
      sent.push({ settings, password, message });
      return Promise.resolve();
    },
    resolvePortrait: portraitOf,
  });
  return { service, library, summaryId, sent, credentials };
}

const ACCOUNT = { to: 'me@example.com', from: 'sender@gmail.com', host: 'smtp.gmail.com', port: 465, autoSend: true };

describe('email service', () => {
  it('will not send, or claim to be set up, without an account and a password', async () => {
    const { service, library, summaryId, sent } = await serviceFixture();

    await expect(service.sendSummary(summaryId)).rejects.toThrow(/not set up/);
    await expect(service.configure({ ...ACCOUNT, password: null })).rejects.toThrow(/Enter the password/);
    expect(library.library.settings.email).toBeNull();
    expect(sent).toEqual([]);
  });

  it('keeps the password out of the library and sends the summary with its portrait', async () => {
    const { service, library, summaryId, sent, credentials } = await serviceFixture();

    await service.configure({ ...ACCOUNT, password: 'app-password' });
    expect(library.library.settings.email).toEqual(ACCOUNT);
    expect(JSON.stringify(library.library)).not.toContain('app-password');
    expect(credentials.value).toBe('app-password');

    expect(await service.sendSummary(summaryId)).toEqual({ sentTo: 'me@example.com' });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ settings: ACCOUNT, password: 'app-password' });
    expect(sent[0]?.message.subject).toContain('vs. Sol Badguy');
    expect(sent[0]?.message.inlineImages).toEqual([{ cid: PORTRAIT_CONTENT_ID, path: 'C:\\portraits\\sol.jpg' }]);
  });

  it('keeps the stored password when the account is edited without one, and forgets it on removal', async () => {
    const { service, library, credentials } = await serviceFixture(memoryCredentials('old-password'));

    await service.configure({ ...ACCOUNT, to: 'phone@example.com', password: null });
    expect(library.library.settings.email?.to).toBe('phone@example.com');
    expect(credentials.value).toBe('old-password');

    await service.remove();
    expect(library.library.settings.email).toBeNull();
    expect(credentials.value).toBeNull();
    await expect(service.sendTest()).rejects.toThrow(/not set up/);
  });
});

describe('SMTP delivery', () => {
  let server: SMTPServer | undefined;

  afterEach(async () => {
    await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
    server = undefined;
  });

  /** A local SMTP server that accepts one account and collects what it receives. */
  async function listen(): Promise<{ port: number; received: Promise<ParsedMail> }> {
    let deliver: (mail: ParsedMail) => void = () => undefined;
    const received = new Promise<ParsedMail>((resolve) => {
      deliver = resolve;
    });
    server = new SMTPServer({
      authOptional: false,
      disabledCommands: ['STARTTLS'],
      onAuth: (auth, _session, callback) => {
        if (auth.username === 'sender@example.com' && auth.password === 'app-password') callback(null, { user: 'ok' });
        else callback(Object.assign(new Error('Invalid login'), { responseCode: 535 }));
      },
      onData: (stream, _session, callback) => {
        simpleParser(stream).then(
          (mail) => {
            deliver(mail);
            callback();
          },
          (error: unknown) => callback(error instanceof Error ? error : new Error(String(error))),
        );
      },
    });
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return { port: (server.server.address() as AddressInfo).port, received };
  }

  const message: OutgoingMessage = {
    subject: 'VOD review: vs. Sol Badguy - set (Nov 14, 2026)',
    html: '<h2>Overview</h2><p>Anti-air more.</p>',
    text: 'Overview\nAnti-air more.',
  };

  it('delivers an HTML message with a text alternative', async () => {
    const { port, received } = await listen();
    const settings = { to: 'me@example.com', from: 'sender@example.com', host: '127.0.0.1', port, autoSend: false };

    await createSmtpSender({ allowInsecure: true })(settings, 'app-password', message);

    const mail = await received;
    expect(mail.subject).toBe(message.subject);
    expect(mail.from?.text).toBe('"VOD Reviewer" <sender@example.com>');
    expect(mail.to).toMatchObject({ text: 'me@example.com' });
    expect(mail.html).toContain('<h2>Overview</h2>');
    expect(mail.text).toContain('Anti-air more.');
  });

  it('explains a rejected sign-in, and refuses to send a password without TLS', async () => {
    const { port } = await listen();
    const settings = { to: 'me@example.com', from: 'sender@example.com', host: '127.0.0.1', port, autoSend: false };

    await expect(createSmtpSender({ allowInsecure: true })(settings, 'wrong', message)).rejects.toThrow(
      /rejected the sign-in/,
    );
    // The default sender requires TLS, which this server does not offer.
    await expect(createSmtpSender()(settings, 'app-password', message)).rejects.toThrow(/could not be sent|Could not connect/);
  });

  it('explains an unreachable server', async () => {
    const settings = { to: 'me@example.com', from: 'sender@example.com', host: '127.0.0.1', port: 1, autoSend: false };
    await expect(createSmtpSender({ allowInsecure: true })(settings, 'app-password', message)).rejects.toThrow(
      /Could not connect to 127\.0\.0\.1 on port 1/,
    );
  });
});
