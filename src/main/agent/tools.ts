import { z } from 'zod';
import { MAX_SUMMARY_LENGTH } from '@shared/domain/constants';
import type { CharacterFrameData } from '@shared/domain/frameData';
import type { Library } from '@shared/domain/schema';
import { completeSummary } from '../library/operations';
import type { LibraryService } from '../library/service';
import { formatFrameData } from '../framedata/format';
import { buildReviewBrief, matchupCharacterIds } from './brief';
import { defineTool, type McpTool } from './mcp';
import { formatYouTubeResults, type YouTubeSearchPeriod, type YouTubeVideo } from './youtube';

/** Name the MCP server is registered under; the agent sees tools as `<server>-<tool>`. */
export const AGENT_SERVER_NAME = 'vod-reviewer';

export const AGENT_TOOL_NAMES = ['get_review_notes', 'frame_data', 'youtube_search', 'save_summary'] as const;

/** A run that searches more than this is looping, not researching. */
const MAX_SEARCHES_PER_RUN = 8;

export interface AgentToolDependencies {
  library: LibraryService;
  searchYouTube: (query: string, period: YouTubeSearchPeriod) => Promise<YouTubeVideo[]>;
  getFrameData: (characterId: string) => Promise<CharacterFrameData>;
  /** Called after the agent changed the library, so the UI can be told. */
  onLibraryChanged: (library: Library) => void;
  /** Called once a summary has been saved, for follow-up work such as emailing it. */
  onSummarySaved?: (summaryId: string) => void;
}

/**
 * The tools one agent run may use. They are bound to a single summary: the agent cannot
 * name a video, read anything else in the library, look up characters outside the
 * matchup, or write anywhere but that summary.
 */
export function createAgentTools(summaryId: string, deps: AgentToolDependencies): McpTool[] {
  let searches = 0;

  return [
    defineTool({
      name: 'get_review_notes',
      description:
        'Returns the review to summarize as JSON: the matchup, the video, every note the player wrote on it (each with its time in the video) and the moments they flagged. Call this first.',
      input: z.object({}),
      run: () => JSON.stringify(buildReviewBrief(deps.library.library, summaryId), null, 2),
    }),

    defineTool({
      name: 'frame_data',
      description:
        "Returns frame data from Dustloop for one side of the matchup, one move per line: startup, active, recovery, on block, on hit, guard, invulnerability. For the opponent's moves it also says which of the player's moves punish each one on block.",
      input: z.object({
        character: z.enum(['opponent', 'player']).describe("Whose moves: the opponent's character or the player's own."),
        moves: z
          .string()
          .trim()
          .max(120)
          .optional()
          .describe('Comma-separated inputs or move names to look up, e.g. "236K, Bandit Revolver, 6P". Omit to list every move.'),
      }),
      run: async ({ character, moves }) => {
        const characterId = matchupCharacterIds(deps.library.library, summaryId)[character];
        if (characterId === null) {
          throw new Error(
            character === 'player'
              ? 'The player has not set their character in Settings, so their frame data is not available. Do not guess it.'
              : 'This video is not filed under a matchup, so there is no opponent character.',
          );
        }
        const data = await deps.getFrameData(characterId);
        if (character === 'player') return formatFrameData(data, moves);

        // For the opponent's moves, also work out what the player can punish each with.
        const playerId = matchupCharacterIds(deps.library.library, summaryId).player;
        const defender = playerId === null ? undefined : await deps.getFrameData(playerId).catch(() => undefined);
        return formatFrameData(data, moves, defender);
      },
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
        return 'Saved. The summary is now in VOD Reviewer under Review notes.';
      },
    }),
  ];
}
