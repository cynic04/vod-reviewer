import { mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import type { Library, SessionSummary } from '@shared/domain/schema';
import summarizeSkill from '../../../resources/agent/skills/summarize/SKILL.md?raw';
import { removeSummary, requestSummary } from '../library/operations';
import type { LibraryService } from '../library/service';
import { buildLauncherScript, buildMcpConfig } from './launcher';
import { createMcpRequestListener, type McpTool } from './mcp';
import { AGENT_SERVER_NAME, createAgentTools } from './tools';
import type { YouTubeSearchPeriod, YouTubeVideo } from './youtube';

export interface AgentHarnessDependencies {
  library: LibraryService;
  /** Directory the agent runs in. The harness owns it and rewrites its contents freely. */
  workspaceDir: string;
  appVersion: string;
  /** Rejects with a `DomainError` when the agent cannot be started on this machine. */
  assertAgentAvailable: () => Promise<void>;
  /** Opens a new terminal window running the given script. */
  openTerminal: (scriptPath: string) => Promise<void>;
  searchYouTube: (query: string, period: YouTubeSearchPeriod) => Promise<YouTubeVideo[]>;
  /** Tells the UI about a change the agent made. */
  onLibraryChanged: (library: Library) => void;
  /** Called once the agent has saved a summary. */
  onSummarySaved?: (summaryId: string) => void;
}

/**
 * Runs the summarize agent and is the only thing it can talk to.
 *
 * The agent is the GitHub Copilot CLI in a terminal window, started with the `/summarize`
 * skill. It gets no access to the library file: instead the app serves three tools to it
 * over a loopback MCP endpoint that exists only for that run - read the session, search
 * YouTube, hand in the summary. See docs/agent-harness.md.
 */
export class AgentHarness {
  readonly #deps: AgentHarnessDependencies;
  /** Tools of the runs started since launch, keyed by summary id (which is also the URL token). */
  readonly #runs = new Map<string, McpTool[]>();
  #server: Server | null = null;

  constructor(deps: AgentHarnessDependencies) {
    this.#deps = deps;
  }

  /** Starts the MCP endpoint on a free loopback port. */
  async start(): Promise<void> {
    const server = createServer(
      createMcpRequestListener({ name: AGENT_SERVER_NAME, version: this.#deps.appVersion }, (token) =>
        this.#runs.get(token) ?? null,
      ),
    );
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    this.#server = server;
  }

  stop(): void {
    this.#server?.close();
    this.#server = null;
  }

  /** Opens a pending summary for the session and starts an agent run to fill it in. */
  async requestSummary(sessionId: string): Promise<{ library: Library; summary: SessionSummary }> {
    const { library } = this.#deps;
    await this.#deps.assertAgentAvailable();

    const summary = await library.mutate((current) => {
      const next = requestSummary(current, sessionId, library.context);
      return { library: next.library, result: next.summary };
    });

    try {
      this.#runs.set(summary.id, createAgentTools(summary.id, this.#deps));
      await this.#deps.openTerminal(await this.#prepareRun(summary));
    } catch (error) {
      // Nothing is going to complete this summary; do not leave it spinning.
      this.#runs.delete(summary.id);
      await library.update((current) => removeSummary(current, summary.id));
      throw error;
    }
    return { library: library.library, summary };
  }

  /** Cancels a pending summary or deletes a finished one, and closes its endpoint. */
  async removeSummary(summaryId: string): Promise<Library> {
    this.#runs.delete(summaryId);
    return this.#deps.library.update((current) => removeSummary(current, summaryId));
  }

  /** Writes the skill, the MCP configuration and the launcher script for one run. */
  async #prepareRun(summary: SessionSummary): Promise<string> {
    const address = this.#server?.address() as AddressInfo | null | undefined;
    if (!address) throw new Error('The agent endpoint is not running.');

    const { workspaceDir } = this.#deps;
    const skillDir = path.join(workspaceDir, '.github', 'skills', 'summarize');
    const runsDir = path.join(workspaceDir, 'runs');
    await Promise.all([mkdir(skillDir, { recursive: true }), mkdir(runsDir, { recursive: true })]);

    // Files of earlier runs point at endpoints that no longer exist.
    const stale = (await readdir(runsDir)).filter((file) => !this.#runs.has(file.split('.')[0] ?? ''));
    await Promise.all(stale.map((file) => rm(path.join(runsDir, file), { force: true })));

    const mcpConfigPath = path.join(runsDir, `${summary.id}.mcp.json`);
    const scriptPath = path.join(runsDir, `${summary.id}.cmd`);
    await Promise.all([
      // Rewritten every time, so an app update also updates the skill.
      writeFile(path.join(skillDir, 'SKILL.md'), summarizeSkill, 'utf8'),
      writeFile(mcpConfigPath, buildMcpConfig(`http://127.0.0.1:${address.port}/mcp/${summary.id}`), 'utf8'),
      writeFile(scriptPath, buildLauncherScript({ workspaceDir, mcpConfigPath, model: summary.model }), 'utf8'),
    ]);
    return scriptPath;
  }
}
