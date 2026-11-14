import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { matchupFolderId } from '@shared/domain/characters';
import type { Library } from '@shared/domain/schema';
import {
  createEmptyLibrary,
  createNote,
  createTimestamp,
  importVideo,
  requestSummary,
  updateSettings,
  type OperationContext,
} from '../library/operations';
import type { LibraryRepository } from '../library/repository';
import { LibraryService } from '../library/service';
import type { SessionBrief } from './brief';
import { AGENT_AVAILABLE_TOOLS, buildCopilotArguments, buildLauncherScript, buildMcpConfig } from './launcher';
import { createMcpRequestListener, handleMcpMessage, type JsonRpcResponse, type McpTool } from './mcp';
import { createAgentTools } from './tools';
import { formatYouTubeResults, parseYouTubeResults, type YouTubeVideo } from './youtube';

const SERVER_INFO = { name: 'vod-reviewer', version: 'test' };

function testContext(): OperationContext {
  let counter = 0;
  return { now: () => new Date('2026-11-14T10:00:00.000Z'), newId: () => `id-${(counter += 1)}` };
}

/** A library with one video vs. Sol, one session with two notes, and a pending summary. */
async function agentFixture(): Promise<{
  service: LibraryService;
  summaryId: string;
  tools: McpTool[];
  pushed: Library[];
  searches: string[];
}> {
  const ctx = testContext();
  let library = updateSettings(createEmptyLibrary(ctx), { playerCharacterId: 'mll' });
  const imported = importVideo(
    library,
    {
      filePath: 'C:\\Videos\\set.mp4',
      fileName: 'set.mp4',
      fileSizeBytes: 1,
      recordedAt: '2026-11-10T21:00:00.000Z',
      folderId: matchupFolderId('sol'),
    },
    ctx,
  );
  const videoId = imported.video.id;
  library = createTimestamp(imported.library, { videoId, timeSeconds: 125, label: 'Round 2', kind: 'focus' }, ctx).library;
  const first = createNote(library, { videoId, sessionId: null, timeSeconds: 125, body: 'Never anti-aired' }, ctx);
  const second = createNote(
    first.library,
    { videoId, sessionId: first.note.sessionId, timeSeconds: 14, body: 'Jumped in, got 6P again' },
    ctx,
  );
  const requested = requestSummary(second.library, first.note.sessionId, ctx);

  const repository: LibraryRepository = {
    load: () => Promise.resolve(requested.library),
    save: () => Promise.resolve(),
  };
  const service = await LibraryService.open(repository, ctx);
  // Opening settles pending summaries from a previous launch; ask again as the running app would.
  const summary = await service.mutate((current) => {
    const next = requestSummary(current, first.note.sessionId, ctx);
    return { library: next.library, result: next.summary };
  });

  const pushed: Library[] = [];
  const searches: string[] = [];
  const video: YouTubeVideo = {
    title: 'Millia vs Sol',
    channel: 'High Level',
    published: '2 weeks ago',
    duration: '8:42',
    views: '4,571 views',
    url: 'https://www.youtube.com/watch?v=abc123',
  };
  const tools = createAgentTools(summary.id, {
    library: service,
    searchYouTube: (query, period) => {
      searches.push(`${period}:${query}`);
      return Promise.resolve([video]);
    },
    onLibraryChanged: (snapshot) => pushed.push(snapshot),
  });
  return { service, summaryId: summary.id, tools, pushed, searches };
}

const call = async (tools: readonly McpTool[], name: string, args: unknown = {}): Promise<JsonRpcResponse | null> =>
  handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, tools, SERVER_INFO);

const textOf = (response: JsonRpcResponse | null): { text: string; isError: boolean } => {
  const result = response?.result as { content: { text: string }[]; isError: boolean };
  return { text: result.content[0]?.text ?? '', isError: result.isError };
};

describe('MCP protocol', () => {
  it('negotiates, lists tools with JSON schemas, and ignores notifications', async () => {
    const { tools } = await agentFixture();

    const initialized = await handleMcpMessage(
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-11-25' } },
      tools,
      SERVER_INFO,
    );
    expect(initialized?.result).toMatchObject({ protocolVersion: '2025-11-25', capabilities: { tools: {} } });

    const listed = await handleMcpMessage({ jsonrpc: '2.0', id: 1, method: 'tools/list' }, tools, SERVER_INFO);
    const advertised = (listed?.result as { tools: { name: string; inputSchema: { type: string } }[] }).tools;
    expect(advertised.map((tool) => tool.name)).toEqual(['get_review_session', 'youtube_search', 'save_summary']);
    expect(advertised.every((tool) => tool.inputSchema.type === 'object')).toBe(true);

    expect(await handleMcpMessage({ jsonrpc: '2.0', method: 'notifications/initialized' }, tools, SERVER_INFO)).toBeNull();
    const unknown = await handleMcpMessage({ jsonrpc: '2.0', id: 2, method: 'server/discover' }, tools, SERVER_INFO);
    expect(unknown?.error?.code).toBe(-32601);
  });
});

describe('agent tools', () => {
  it('briefs the agent on exactly one session', async () => {
    const { tools } = await agentFixture();
    const brief = JSON.parse(textOf(await call(tools, 'get_review_session')).text) as SessionBrief;

    expect(brief.matchup).toEqual({ player: 'Millia Rage', opponent: 'Sol Badguy', folder: null });
    expect(brief.notes).toEqual([
      { time: '0:14', text: 'Jumped in, got 6P again' },
      { time: '2:05', text: 'Never anti-aired' },
    ]);
    expect(brief.markers).toEqual([{ time: '2:05', kind: 'focus', label: 'Round 2' }]);
  });

  it('searches with the requested period, defaults to the last year, and caps the number of searches', async () => {
    const { tools, searches } = await agentFixture();

    const result = textOf(await call(tools, 'youtube_search', { query: 'Millia vs Sol high level' }));
    expect(result.text).toContain('https://www.youtube.com/watch?v=abc123');
    await call(tools, 'youtube_search', { query: 'anti air guide', period: 'any' });
    expect(searches).toEqual(['year:Millia vs Sol high level', 'any:anti air guide']);

    for (let index = 0; index < 6; index += 1) await call(tools, 'youtube_search', { query: `query ${index}` });
    const capped = textOf(await call(tools, 'youtube_search', { query: 'one more' }));
    expect(capped).toMatchObject({ isError: true, text: expect.stringContaining('Search limit') as string });
    expect(searches).toHaveLength(8);
  });

  it('reports bad arguments to the agent instead of failing the request', async () => {
    const { tools } = await agentFixture();
    expect(textOf(await call(tools, 'youtube_search', { query: 'x' })).isError).toBe(true);
    expect(textOf(await call(tools, 'save_summary', { markdown: '   ' })).isError).toBe(true);
    expect((await call(tools, 'delete_everything'))?.error?.code).toBe(-32602);
  });

  it('saves the summary once and tells the UI', async () => {
    const { tools, service, summaryId, pushed } = await agentFixture();

    const saved = textOf(await call(tools, 'save_summary', { markdown: '## Overview\n\nAnti-air more.\n' }));
    expect(saved.isError).toBe(false);
    expect(service.library.summaries).toMatchObject([
      { id: summaryId, status: 'ready', markdown: '## Overview\n\nAnti-air more.' },
    ]);
    expect(pushed).toEqual([service.library]);

    expect(textOf(await call(tools, 'save_summary', { markdown: 'again' }))).toMatchObject({
      isError: true,
      text: expect.stringContaining('already been saved') as string,
    });
  });
});

describe('MCP endpoint', () => {
  let server: Server | undefined;

  afterEach(() => {
    server?.close();
    server = undefined;
  });

  async function listen(tools: readonly McpTool[]): Promise<string> {
    server = createServer(createMcpRequestListener(SERVER_INFO, (token) => (token === 'run-1' ? tools : null)));
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  const post = (url: string, body: unknown, headers: Record<string, string> = {}): Promise<Response> =>
    fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });

  it('serves a run at its own URL and nothing anywhere else', async () => {
    const { tools } = await agentFixture();
    const base = await listen(tools);
    const ping = { jsonrpc: '2.0', id: 7, method: 'ping' };

    const ok = await post(`${base}/mcp/run-1`, ping);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ jsonrpc: '2.0', id: 7, result: {} });

    expect((await post(`${base}/mcp/other-run`, ping)).status).toBe(404);
    expect((await post(`${base}/mcp`, ping)).status).toBe(404);
    expect((await fetch(`${base}/mcp/run-1`)).status).toBe(405);
    expect((await post(`${base}/mcp/run-1`, { jsonrpc: '2.0', method: 'notifications/initialized' })).status).toBe(202);
  });

  it('refuses requests that come from a web page', async () => {
    const { tools } = await agentFixture();
    const base = await listen(tools);
    const response = await post(`${base}/mcp/run-1`, { jsonrpc: '2.0', id: 1, method: 'ping' }, { Origin: 'https://evil.example' });
    expect(response.status).toBe(404);
  });
});

describe('launcher', () => {
  const options = {
    workspaceDir: 'C:\\Users\\100% me\\AppData\\Roaming\\vod-reviewer\\agent',
    mcpConfigPath: 'C:\\Users\\100% me\\AppData\\Roaming\\vod-reviewer\\agent\\runs\\abc.mcp.json',
    model: 'claude-haiku-4.5',
  };

  it('runs the summarize skill on the chosen model with only the harness tools', () => {
    const args = buildCopilotArguments(options);
    expect(args.slice(0, 4)).toEqual(['--prompt', '/summarize', '--model', 'claude-haiku-4.5']);
    expect(args.slice(args.indexOf('--available-tools') + 1)).toEqual([...AGENT_AVAILABLE_TOOLS]);
    expect(AGENT_AVAILABLE_TOOLS).toEqual([
      'skill',
      'web_fetch',
      'vod-reviewer-get_review_session',
      'vod-reviewer-youtube_search',
      'vod-reviewer-save_summary',
    ]);
  });

  it('quotes paths for a batch file, including percent signs', () => {
    const script = buildLauncherScript(options);
    expect(script).toContain('cd /d "C:\\Users\\100%% me\\AppData\\Roaming\\vod-reviewer\\agent"');
    expect(script).toContain('--additional-mcp-config "@C:\\Users\\100%% me\\AppData\\Roaming\\vod-reviewer\\agent\\runs\\abc.mcp.json"');
    expect(script).toContain('copilot --prompt /summarize --model claude-haiku-4.5 ');
  });

  it('refuses a model id that could break out of the command line', () => {
    expect(() => buildLauncherScript({ ...options, model: 'x & del /q *' })).toThrow(/not a valid model/);
  });

  it('points the agent at the run endpoint', () => {
    expect(JSON.parse(buildMcpConfig('http://127.0.0.1:5000/mcp/abc'))).toEqual({
      mcpServers: { 'vod-reviewer': { type: 'http', url: 'http://127.0.0.1:5000/mcp/abc', tools: ['*'] } },
    });
  });
});

describe('YouTube results', () => {
  const page = (data: unknown): string => `<html><script>var ytInitialData = ${JSON.stringify(data)};</script></html>`;
  const renderer = (id: string, title: string): unknown => ({
    videoRenderer: {
      videoId: id,
      title: { runs: [{ text: title }] },
      ownerText: { runs: [{ text: 'GGST: High Level Gameplay' }] },
      publishedTimeText: { simpleText: '7 months ago' },
      lengthText: { simpleText: '8:42' },
      viewCountText: { simpleText: '4,571 views' },
    },
  });

  it('finds videos wherever the layout nests them, skipping other result types', () => {
    const html = page({
      contents: { sections: [{ items: [renderer('a1', 'WALTER (Millia) vs Totsubunger (Sol)'), { channelRenderer: {} }] }, { more: [renderer('b2', 'Second')] }] },
    });

    const videos = parseYouTubeResults(html, 5);
    expect(videos).toHaveLength(2);
    expect(videos[0]).toEqual({
      title: 'WALTER (Millia) vs Totsubunger (Sol)',
      channel: 'GGST: High Level Gameplay',
      published: '7 months ago',
      duration: '8:42',
      views: '4,571 views',
      url: 'https://www.youtube.com/watch?v=a1',
    });
    expect(parseYouTubeResults(html, 1)).toHaveLength(1);
    expect(formatYouTubeResults(videos).split('\n')[1]).toBe(
      '2. Second | GGST: High Level Gameplay | 7 months ago | 8:42 | 4,571 views | https://www.youtube.com/watch?v=b2',
    );
  });

  it('fails clearly when the page has no result data, and says so when a search is empty', () => {
    expect(() => parseYouTubeResults('<html>consent wall</html>', 5)).toThrow(/without search results/);
    expect(formatYouTubeResults([])).toMatch(/No videos found/);
  });
});
