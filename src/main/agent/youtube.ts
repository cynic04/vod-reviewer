/**
 * YouTube search for the summarize agent.
 *
 * The agent's own web tool can fetch a page but cannot search, and YouTube's result page
 * is a megabyte of script that a small model cannot afford to read. So the app does the
 * search and hands the agent a few plain lines per query.
 *
 * There is no API key involved: this reads the same result page a browser would, from
 * the `ytInitialData` JSON embedded in it.
 */

export type YouTubeSearchPeriod = 'month' | 'year' | 'any';

export interface YouTubeVideo {
  title: string;
  channel: string;
  /** Relative age as YouTube words it, e.g. "3 weeks ago". Empty for live streams. */
  published: string;
  duration: string;
  views: string;
  url: string;
}

/** YouTube's `sp` filter values: videos only, optionally limited by upload date. */
const PERIOD_FILTERS: Record<YouTubeSearchPeriod, string> = {
  month: 'EgQIBBAB',
  year: 'EgQIBRAB',
  any: 'EgIQAQ==',
};

const REQUEST_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  'Accept-Language': 'en-US,en;q=0.9',
  // Skips the cookie-consent interstitial served in some regions.
  Cookie: 'SOCS=CAI',
};

type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type JsonObject = { [key: string]: Json };

function asObject(value: Json | undefined): JsonObject | undefined {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value : undefined;
}

/** Reads `{ simpleText }` or `{ runs: [{ text }] }`, the two shapes YouTube uses for text. */
function textOf(value: Json | undefined): string {
  const object = asObject(value);
  if (!object) return '';
  if (typeof object.simpleText === 'string') return object.simpleText;
  if (!Array.isArray(object.runs)) return '';
  return object.runs
    .map((run) => asObject(run)?.text)
    .filter((text) => typeof text === 'string')
    .join('');
}

/** Finds every `videoRenderer` in the page data, wherever the current layout nests them. */
function collectVideoRenderers(node: Json, found: JsonObject[] = []): JsonObject[] {
  if (Array.isArray(node)) {
    for (const item of node) collectVideoRenderers(item, found);
    return found;
  }
  const object = asObject(node);
  if (!object) return found;

  const renderer = asObject(object.videoRenderer);
  if (renderer) {
    found.push(renderer);
    return found;
  }
  for (const value of Object.values(object)) collectVideoRenderers(value, found);
  return found;
}

/** Extracts the videos from a YouTube search result page. */
export function parseYouTubeResults(html: string, limit: number): YouTubeVideo[] {
  const match = /var ytInitialData\s*=\s*(\{.*?\});\s*<\/script>/s.exec(html);
  if (!match?.[1]) throw new Error('YouTube returned a page without search results.');

  const videos: YouTubeVideo[] = [];
  for (const renderer of collectVideoRenderers(JSON.parse(match[1]) as Json)) {
    if (typeof renderer.videoId !== 'string') continue;
    videos.push({
      title: textOf(renderer.title),
      channel: textOf(renderer.ownerText) || textOf(renderer.longBylineText),
      published: textOf(renderer.publishedTimeText),
      duration: textOf(renderer.lengthText),
      views: textOf(renderer.viewCountText),
      url: `https://www.youtube.com/watch?v=${renderer.videoId}`,
    });
    if (videos.length >= limit) break;
  }
  return videos;
}

export async function searchYouTube(
  query: string,
  period: YouTubeSearchPeriod,
  limit = 6,
  fetchPage: typeof fetch = fetch,
): Promise<YouTubeVideo[]> {
  const url = new URL('https://www.youtube.com/results');
  url.searchParams.set('search_query', query);
  url.searchParams.set('sp', PERIOD_FILTERS[period]);
  url.searchParams.set('hl', 'en');

  const response = await fetchPage(url, { headers: REQUEST_HEADERS, signal: AbortSignal.timeout(15_000) });
  if (!response.ok) throw new Error(`YouTube answered ${response.status}.`);
  return parseYouTubeResults(await response.text(), limit);
}

/** One line per video: compact enough for a small model, complete enough to cite. */
export function formatYouTubeResults(videos: readonly YouTubeVideo[]): string {
  if (videos.length === 0) return 'No videos found. Try a shorter or differently worded query.';
  return videos
    .map((video, index) =>
      [`${index + 1}. ${video.title}`, video.channel, video.published, video.duration, video.views, video.url]
        .filter((part) => part !== '')
        .join(' | '),
    )
    .join('\n');
}
