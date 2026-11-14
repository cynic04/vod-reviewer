import { SUMMARY_MODEL_PATTERN } from '@shared/domain/constants';
import { AGENT_SERVER_NAME, AGENT_TOOL_NAMES } from './tools';

/** The slash command the agent is started with; it must match the skill's `name`. */
export const SUMMARIZE_PROMPT = '/summarize';

/**
 * Everything the model is allowed to see. Listing tools explicitly, instead of starting
 * from the CLI's full set, does two things: the agent cannot run shell commands, edit
 * files or spawn (more expensive) sub-agents, and its prompt shrinks by tens of thousands
 * of tokens per turn because unused tool descriptions are never sent.
 */
export const AGENT_AVAILABLE_TOOLS: readonly string[] = [
  'skill',
  'web_fetch',
  ...AGENT_TOOL_NAMES.map((tool) => `${AGENT_SERVER_NAME}-${tool}`),
];

export interface LauncherOptions {
  /** Directory the agent runs in; holds `.github/skills/summarize`. */
  workspaceDir: string;
  /** File with the MCP server entry for this run. */
  mcpConfigPath: string;
  model: string;
}

/** Arguments for `copilot`, in order. Exposed separately so they can be inspected in tests. */
export function buildCopilotArguments({ mcpConfigPath, model }: Omit<LauncherOptions, 'workspaceDir'>): string[] {
  if (!SUMMARY_MODEL_PATTERN.test(model)) throw new Error(`"${model}" is not a valid model id.`);
  return [
    '--prompt', SUMMARIZE_PROMPT,
    '--model', model,
    // Non-interactive runs cannot answer the folder-trust prompt; the workspace is ours.
    '--trust-folder',
    '--no-ask-user',
    // Keep the user's personal instructions and GitHub tools out of a coaching task.
    '--no-custom-instructions',
    '--disable-builtin-mcps',
    '--additional-mcp-config', `@${mcpConfigPath}`,
    '--allow-tool', AGENT_SERVER_NAME,
    '--allow-all-urls',
    '--available-tools', ...AGENT_AVAILABLE_TOOLS,
  ];
}

/** Quotes a value for a Windows batch file. Paths cannot contain `"`, so only `%` needs care. */
function quoteForBatch(value: string): string {
  if (value.includes('"')) throw new Error('Paths containing double quotes are not supported.');
  return `"${value.replaceAll('%', '%%')}"`;
}

/**
 * The batch file that a new terminal window runs. It is a file rather than a command
 * line because that is the one form of "open a terminal and run this" on Windows with no
 * quoting pitfalls, and it leaves something inspectable behind when a run goes wrong.
 */
export function buildLauncherScript(options: LauncherOptions): string {
  const args = buildCopilotArguments(options)
    .map((argument) => (/^[A-Za-z0-9._/-]+$/.test(argument) ? argument : quoteForBatch(argument)))
    .join(' ');

  return [
    '@echo off',
    'title VOD Reviewer - Summarize session',
    `cd /d ${quoteForBatch(options.workspaceDir)}`,
    'echo.',
    `echo   VOD Reviewer is summarizing your review session with GitHub Copilot (${options.model}).`,
    'echo   The summary will appear in the app under Session notes when it is done.',
    'echo.',
    `copilot ${args}`,
    'if errorlevel 1 (',
    '  echo.',
    '  echo   The summary did not finish. Check the message above, then try again from VOD Reviewer.',
    ') else (',
    '  echo.',
    '  echo   Done. You can close this window.',
    ')',
    'echo.',
    'pause',
    '',
  ].join('\r\n');
}

/** Contents of the per-run MCP configuration handed to `--additional-mcp-config`. */
export function buildMcpConfig(serverUrl: string): string {
  return JSON.stringify(
    { mcpServers: { [AGENT_SERVER_NAME]: { type: 'http', url: serverUrl, tools: ['*'] } } },
    null,
    2,
  );
}
