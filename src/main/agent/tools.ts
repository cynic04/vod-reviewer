import { z } from 'zod';
import { MAX_SUMMARY_LENGTH } from '@shared/domain/constants';
import type { Library } from '@shared/domain/schema';
import { completeSummary } from '../library/operations';
import type { LibraryService } from '../library/service';
import { buildSessionBrief } from './brief';
import { defineTool, type McpTool } from './mcp';
import { formatYouTubeResults, type YouTubeSearchPeriod, type YouTubeVideo } from './youtube';

/** Name the MCP server is registered under; the agent sees tools as `<server>-<tool>`. */
export const AGENT_SERVER_NAME = 'vod-reviewer';

export const AGENT_TOOL_NAMES = ['get_review_session', 'youtube_search', 'save_summary'] as const;

/** A run that searches more than this is looping, not researching. */
const MAX_SEARCHES_PER_RUN = 8;

export interface AgentToolDependencies {
  library: LibraryService;
  searchYouTube: (query: string, period: YouTubeSearchPeriod) => Promise<YouTubeVideo[]>;
  /** Called after the agent changed the library, so the UI can be told. */
  onLibraryChanged: (library: Library) => void;
  /** Called once a summary has been saved, for follow-up work such as emailing it. */
  onSummarySaved?: (summaryId: string) => void;
}

/**
 * The tools one agent run may use. They are bound to a single summary: the agent cannot
 * name a session, read anything else in the library, or write anywhere but that summary.
 */
export function createAgentTools(summaryId: string, deps: AgentToolDependencies): McpTool[] {
  let searches = 0;

  return [
    defineTool({
      name: 'get_review_session',
      description:
        'Returns the review session to summarize as JSON: the matchup, the video, the notes the player wrote (each with its time in the video) and the moments they flagged. Call this first.',
      input: z.object({}),
      run: () => JSON.stringify(buildSessionBrief(deps.library.library, summaryId), null, 2),
    }),

    defineTool({
      name: 'youtube_search',
      description:
        'Searches YouTube and returns up to 6 videos, one per line: title | channel | age | length | views | URL. Use period "year" for recent matchup footage and "any" for guides.',
      input: z.object({
        query: z.string().trim().min(3).max(200).describe('Search terms, e.g. "Guilty Gear Strive Millia vs Sol high level".'),
        period: z
          .enum(['month', 'year', 'any'])
          .default('year')
          .describe('Only videos uploaded within the last month or year, or at any time.'),
      }),
      run: async ({ query, period }) => {
        if (searches >= MAX_SEARCHES_PER_RUN) {
          throw new Error(`Search limit of ${MAX_SEARCHES_PER_RUN} reached. Write the summary with what you have.`);
        }
        searches += 1;
        return formatYouTubeResults(await deps.searchYouTube(query, period));
      },
    }),

    defineTool({
      name: 'save_summary',
      description:
        'Saves the finished coaching summary to VOD Reviewer, where the player reads it. Call exactly once, last, with the complete markdown.',
      input: z.object({
        markdown: z.string().trim().min(1).max(MAX_SUMMARY_LENGTH).describe('The whole summary, as markdown.'),
      }),
      run: async ({ markdown }) => {
        const library = await deps.library.update((current) =>
          completeSummary(current, summaryId, markdown, deps.library.context),
        );
        deps.onLibraryChanged(library);
        deps.onSummarySaved?.(summaryId);
        return 'Saved. The summary is now in VOD Reviewer under Session notes.';
      },
    }),
  ];
}
