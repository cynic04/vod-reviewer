import { Marked, type Token, type Tokens } from 'marked';
import { getCharacter } from '@shared/domain/characters';
import type { Library } from '@shared/domain/schema';
import { formatDuration } from '@shared/domain/time';
import { DomainError, notFound } from '../library/errors';

/**
 * Builds the email that carries a session summary to the user's phone.
 *
 * HTML email is its own dialect: no stylesheets, no flexbox or grid, and each client
 * strips something different. So the layout is nested tables and every style is inline,
 * which is the one form Gmail, Apple Mail and Outlook all render alike.
 */

export interface SummaryEmail {
  subject: string;
  html: string;
  /** Plain-text alternative, for clients and notifications that do not render HTML. */
  text: string;
  /** File to attach inline as the header portrait (`cid:` {@link PORTRAIT_CONTENT_ID}), if any. */
  portraitPath: string | null;
}

/** Content-ID of the inline portrait attachment referenced by the header. */
export const PORTRAIT_CONTENT_ID = 'portrait@vod-reviewer';

const COLOR = {
  ink: '#0b0b0d',
  inkSoft: '#1a1a1f',
  red: '#e8262a',
  redDark: '#c8161d',
  yellow: '#f5c518',
  bone: '#f3efe6',
  paper: '#fbf9f4',
  rule: '#d2cab8',
  text: '#121215',
  muted: '#5f5a50',
  onInk: '#f4f1ea',
  onInkMuted: '#a8a399',
} as const;

const FONT = {
  display: "'Arial Black', Impact, 'Helvetica Neue', Arial, sans-serif",
  body: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  mono: "'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace",
} as const;

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Only web links are kept; anything else (`javascript:`, `file:`...) is dropped. */
function safeUrl(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * Markdown renderer for the summary body. The summary is written by an AI agent, so it
 * is treated as untrusted: raw HTML is shown as text and non-web links lose their target.
 */
const summaryRenderer = new Marked({
  gfm: true,
  renderer: {
    heading({ tokens, depth }: Tokens.Heading): string {
      const content = this.parser.parseInline(tokens);
      if (depth <= 2) {
        return `<h2 style="margin:28px 0 12px;padding:0 0 8px;border-bottom:2px solid ${COLOR.ink};font-family:${FONT.display};font-size:19px;font-style:italic;line-height:1.2;letter-spacing:0.5px;text-transform:uppercase;color:${COLOR.ink};">${content}</h2>`;
      }
      return `<h3 style="margin:22px 0 8px;padding:0 0 0 10px;border-left:4px solid ${COLOR.red};font-family:${FONT.body};font-size:16px;font-weight:700;line-height:1.3;color:${COLOR.text};">${content}</h3>`;
    },
    paragraph({ tokens }: Tokens.Paragraph): string {
      return `<p style="margin:0 0 12px;">${this.parser.parseInline(tokens)}</p>`;
    },
    list(token: Tokens.List): string {
      const tag = token.ordered ? 'ol' : 'ul';
      const items = token.items.map((item) => this.listitem(item)).join('');
      return `<${tag} style="margin:0 0 14px;padding:0 0 0 22px;">${items}</${tag}>`;
    },
    listitem(item: Tokens.ListItem): string {
      return `<li style="margin:0 0 8px;padding:0 0 0 2px;">${this.parser.parse(item.tokens)}</li>`;
    },
    strong({ tokens }: Tokens.Strong): string {
      return `<strong style="font-weight:700;color:${COLOR.ink};">${this.parser.parseInline(tokens)}</strong>`;
    },
    link({ href, tokens }: Tokens.Link): string {
      const content = this.parser.parseInline(tokens);
      const url = safeUrl(href);
      if (url === null) return content;
      return `<a href="${escapeHtml(url)}" style="color:${COLOR.redDark};font-weight:600;text-decoration:underline;">${content}</a>`;
    },
    codespan({ text }: Tokens.Codespan): string {
      return `<code style="padding:1px 5px;background:${COLOR.bone};font-family:${FONT.mono};font-size:13px;">${escapeHtml(text)}</code>`;
    },
    code({ text }: Tokens.Code): string {
      return `<pre style="margin:0 0 14px;padding:10px 12px;background:${COLOR.bone};font-family:${FONT.mono};font-size:13px;white-space:pre-wrap;">${escapeHtml(text)}</pre>`;
    },
    blockquote({ tokens }: Tokens.Blockquote): string {
      return `<blockquote style="margin:0 0 14px;padding:2px 0 2px 14px;border-left:3px solid ${COLOR.rule};color:${COLOR.muted};">${this.parser.parse(tokens)}</blockquote>`;
    },
    hr(): string {
      return `<hr style="margin:20px 0;border:0;border-top:1px solid ${COLOR.rule};">`;
    },
    image({ text }: Tokens.Image): string {
      return escapeHtml(text);
    },
    html({ text }: Tokens.HTML | Tokens.Tag): string {
      return escapeHtml(text);
    },
  },
});

export function renderSummaryMarkdown(markdown: string): string {
  return summaryRenderer.parse(markdown, { async: false });
}

export interface LinkedVideo {
  id: string;
  title: string;
  url: string;
}

function youTubeId(href: string): string | null {
  const url = safeUrl(href);
  if (url === null) return null;
  const { hostname, pathname, searchParams } = new URL(url);
  const host = hostname.replace(/^(www|m)\./, '');
  const id = host === 'youtu.be' ? pathname.slice(1) : host === 'youtube.com' ? searchParams.get('v') : null;
  return id !== null && /^[A-Za-z0-9_-]{6,20}$/.test(id) ? id : null;
}

/** The YouTube videos a summary links to, in order, without duplicates. */
export function extractVideos(markdown: string): LinkedVideo[] {
  const videos = new Map<string, LinkedVideo>();
  const visit = (tokens: readonly Token[]): void => {
    for (const token of tokens) {
      if (token.type === 'link') {
        const link = token as Tokens.Link;
        const id = youTubeId(link.href);
        if (id !== null && !videos.has(id)) {
          videos.set(id, { id, title: link.text, url: `https://www.youtube.com/watch?v=${id}` });
        }
      }
      if (token.type === 'list') visit((token as Tokens.List).items);
      if ('tokens' in token && Array.isArray(token.tokens)) visit(token.tokens);
    }
  };
  visit(summaryRenderer.lexer(markdown));
  return [...videos.values()];
}

const dateFormat = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

function sectionHeading(title: string): string {
  return `<h2 style="margin:0 0 14px;font-family:${FONT.display};font-size:19px;font-style:italic;line-height:1.2;letter-spacing:0.5px;text-transform:uppercase;color:${COLOR.ink};">${escapeHtml(title)}</h2>`;
}

function videoCard(video: LinkedVideo): string {
  const url = escapeHtml(video.url);
  return `
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 12px;background:${COLOR.ink};">
        <tr>
          <td width="132" valign="top" style="padding:0;">
            <a href="${url}"><img src="https://i.ytimg.com/vi/${video.id}/mqdefault.jpg" width="132" height="74" alt="" style="display:block;border:0;width:132px;height:74px;"></a>
          </td>
          <td valign="middle" style="padding:8px 12px;">
            <a href="${url}" style="display:block;margin:0 0 6px;font-family:${FONT.body};font-size:14px;font-weight:700;line-height:1.3;color:${COLOR.onInk};text-decoration:none;">${escapeHtml(video.title)}</a>
            <a href="${url}" style="font-family:${FONT.display};font-size:11px;font-style:italic;letter-spacing:1px;text-transform:uppercase;color:${COLOR.yellow};text-decoration:none;">Watch on YouTube &#9654;</a>
          </td>
        </tr>
      </table>`;
}

function noteRow(time: string, body: string): string {
  return `
        <tr>
          <td valign="top" width="58" style="padding:0 10px 10px 0;">
            <span style="display:inline-block;padding:2px 7px;background:${COLOR.ink};font-family:${FONT.mono};font-size:12px;color:${COLOR.onInk};">${escapeHtml(time)}</span>
          </td>
          <td valign="top" style="padding:1px 0 10px;font-family:${FONT.body};font-size:14px;line-height:1.5;color:${COLOR.text};">${escapeHtml(body).replaceAll('\n', '<br>')}</td>
        </tr>`;
}

function metaChip(text: string): string {
  return `<span style="display:inline-block;margin:0 6px 6px 0;padding:3px 9px;background:${COLOR.bone};font-family:${FONT.body};font-size:12px;color:${COLOR.muted};">${escapeHtml(text)}</span>`;
}

/**
 * Builds the subject, HTML and plain-text bodies for one finished summary.
 * `resolvePortrait` maps a character id to its portrait file, or `null` if there is none.
 */
export function buildSummaryEmail(
  library: Library,
  summaryId: string,
  resolvePortrait: (characterId: string) => string | null,
): SummaryEmail {
  const summary = library.summaries.find((candidate) => candidate.id === summaryId);
  if (!summary) throw notFound('Summary', summaryId);
  if (summary.markdown === '') {
    throw new DomainError('CONFLICT', 'This session has not been summarized yet.');
  }

  const session = library.sessions.find((candidate) => candidate.id === summary.sessionId);
  const video = library.videos.find((candidate) => candidate.id === summary.videoId);
  if (!session || !video) throw notFound('Review session', summary.sessionId);

  const folder = library.folders.find((candidate) => candidate.id === video.folderId);
  const opponent = getCharacter(folder?.characterId ?? null);
  const player = getCharacter(library.settings.playerCharacterId);
  const heading = opponent ? `vs. ${opponent.name}` : (folder?.name ?? 'Review');
  const notes = library.notes
    .filter((note) => note.sessionId === session.id)
    .sort((a, b) => a.timeSeconds - b.timeSeconds);
  const videos = extractVideos(summary.markdown);
  const reviewedOn = dateFormat.format(new Date(session.startedAt));

  const subject = `VOD review: ${heading} - ${video.title} (${reviewedOn})`;
  const preheader = `${notes.length === 1 ? '1 note' : `${notes.length} notes`} from your review of ${video.title}, with an action plan${videos.length > 0 ? ` and ${videos.length} videos to watch` : ''}.`;

  const portraitPath = opponent ? resolvePortrait(opponent.id) : null;
  const portraitCell = opponent && portraitPath !== null
    ? `<td width="76" valign="middle" style="padding:0 16px 0 0;"><img src="cid:${PORTRAIT_CONTENT_ID}" width="76" height="76" alt="${escapeHtml(opponent.name)}" style="display:block;border:0;width:76px;height:76px;"></td>`
    : '';

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:${COLOR.bone};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${COLOR.bone};">
  <tr>
    <td align="center" style="padding:20px 10px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;">

        <tr>
          <td style="padding:22px 24px;background:${COLOR.ink};border-bottom:5px solid ${COLOR.red};">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              <tr>
                ${portraitCell}
                <td valign="middle">
                  <div style="margin:0 0 6px;font-family:${FONT.display};font-size:12px;font-style:italic;letter-spacing:2px;text-transform:uppercase;color:${COLOR.onInkMuted};">VOD<span style="color:${COLOR.red};">//</span>Reviewer &middot; Session notes</div>
                  <div style="font-family:${FONT.display};font-size:30px;font-style:italic;line-height:1.05;letter-spacing:0.5px;text-transform:uppercase;color:${COLOR.onInk};">${escapeHtml(heading)}</div>
                  ${player && opponent ? `<div style="margin:6px 0 0;font-family:${FONT.body};font-size:13px;color:${COLOR.yellow};">Playing ${escapeHtml(player.name)}</div>` : ''}
                </td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:20px 24px 4px;background:${COLOR.paper};">
            <div style="margin:0 0 10px;font-family:${FONT.body};font-size:18px;font-weight:700;line-height:1.3;color:${COLOR.text};">${escapeHtml(video.title)}</div>
            ${metaChip(`Recorded ${dateFormat.format(new Date(video.recordedAt))}`)}${metaChip(`Reviewed ${reviewedOn}`)}${metaChip(notes.length === 1 ? '1 note' : `${notes.length} notes`)}
          </td>
        </tr>

        <tr>
          <td style="padding:0 24px 24px;background:${COLOR.paper};font-family:${FONT.body};font-size:15px;line-height:1.6;color:${COLOR.text};">
            ${renderSummaryMarkdown(summary.markdown)}
          </td>
        </tr>
${
  videos.length === 0
    ? ''
    : `
        <tr>
          <td style="padding:22px 24px 12px;background:${COLOR.paper};border-top:1px solid ${COLOR.rule};">
            ${sectionHeading('Watch on your phone')}
            ${videos.map(videoCard).join('')}
          </td>
        </tr>
`
}
        <tr>
          <td style="padding:22px 24px 14px;background:${COLOR.paper};border-top:1px solid ${COLOR.rule};">
            ${sectionHeading('Your notes')}
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${notes.map((note) => noteRow(formatDuration(note.timeSeconds), note.body)).join('')}
            </table>
          </td>
        </tr>

        <tr>
          <td style="padding:16px 24px;background:${COLOR.inkSoft};font-family:${FONT.body};font-size:12px;line-height:1.5;color:${COLOR.onInkMuted};">
            Sent from VOD Reviewer. Summary written by ${escapeHtml(summary.model)} from your own notes; check specific claims about moves before you rely on them.
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>
`;

  const text = [
    `${heading.toUpperCase()} - ${video.title}`,
    `Reviewed ${reviewedOn} - ${notes.length === 1 ? '1 note' : `${notes.length} notes`}`,
    '',
    summary.markdown,
    '',
    'YOUR NOTES',
    ...notes.map((note) => `${formatDuration(note.timeSeconds)}  ${note.body}`),
  ].join('\n');

  return { subject, html, text, portraitPath };
}
