import type { IncomingMessage, ServerResponse } from 'node:http';
import { z } from 'zod';

/**
 * A minimal Model Context Protocol server over HTTP ("Streamable HTTP" without the
 * optional streaming): JSON-RPC requests are POSTed and answered with plain JSON.
 *
 * It implements exactly what an agent needs to discover and call tools - `initialize`,
 * `ping`, `tools/list`, `tools/call` - which keeps the protocol surface small enough to
 * own and test instead of pulling in an SDK.
 */

export interface McpTool {
  name: string;
  description: string;
  /** JSON Schema of the arguments, as advertised to the agent. */
  inputSchema: unknown;
  /** Validates the arguments and returns the text shown to the agent. Throw to report a failure. */
  call: (rawArguments: unknown) => Promise<string>;
}

/** Declares a tool whose arguments are validated by, and typed from, a zod schema. */
export function defineTool<Schema extends z.ZodType>(definition: {
  name: string;
  description: string;
  input: Schema;
  run: (input: z.infer<Schema>) => Promise<string> | string;
}): McpTool {
  return {
    name: definition.name,
    description: definition.description,
    inputSchema: z.toJSONSchema(definition.input),
    call: async (rawArguments) => {
      const input = definition.input.safeParse(rawArguments ?? {});
      if (!input.success) throw new Error(`Invalid arguments: ${z.prettifyError(input.error)}`);
      return definition.run(input.data);
    },
  };
}

const jsonRpcRequestSchema = z.object({
  jsonrpc: z.literal('2.0'),
  id: z.union([z.string(), z.number()]).optional(),
  method: z.string(),
  params: z.unknown().optional(),
});

export type JsonRpcRequest = z.infer<typeof jsonRpcRequestSchema>;

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: { code: number; message: string };
}

const initializeParamsSchema = z.object({ protocolVersion: z.string() });
const toolCallParamsSchema = z.object({ name: z.string(), arguments: z.unknown().optional() });

const FALLBACK_PROTOCOL_VERSION = '2025-06-18';
const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const MAX_BODY_BYTES = 1024 * 1024;

export interface McpServerInfo {
  name: string;
  version: string;
}

/**
 * Answers one JSON-RPC message. Returns `null` for notifications, which get no reply.
 * A failure inside a tool is reported as a tool result with `isError`, as the protocol
 * asks, so the agent can read the message and react to it.
 */
export async function handleMcpMessage(
  message: JsonRpcRequest,
  tools: readonly McpTool[],
  serverInfo: McpServerInfo,
): Promise<JsonRpcResponse | null> {
  const { id } = message;
  if (id === undefined) return null;

  const result = (value: unknown): JsonRpcResponse => ({ jsonrpc: '2.0', id, result: value });
  const error = (code: number, text: string): JsonRpcResponse => ({
    jsonrpc: '2.0',
    id,
    error: { code, message: text },
  });

  switch (message.method) {
    case 'initialize': {
      const params = initializeParamsSchema.safeParse(message.params);
      return result({
        // Agreeing to the client's version is safe: nothing here is version-specific.
        protocolVersion: params.success ? params.data.protocolVersion : FALLBACK_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo,
      });
    }

    case 'ping':
      return result({});

    case 'tools/list':
      return result({
        tools: tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
      });

    case 'tools/call': {
      const params = toolCallParamsSchema.safeParse(message.params);
      if (!params.success) return error(INVALID_PARAMS, 'Expected { name, arguments }.');

      const tool = tools.find((candidate) => candidate.name === params.data.name);
      if (!tool) return error(INVALID_PARAMS, `Unknown tool "${params.data.name}".`);

      try {
        const text = await tool.call(params.data.arguments);
        return result({ content: [{ type: 'text', text }], isError: false });
      } catch (failure) {
        const text = failure instanceof Error ? failure.message : 'The tool failed.';
        return result({ content: [{ type: 'text', text }], isError: true });
      }
    }

    default:
      return error(METHOD_NOT_FOUND, `Method "${message.method}" is not supported.`);
  }
}

async function readBody(request: IncomingMessage): Promise<string | null> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request as AsyncIterable<Buffer>) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) return null;
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'Content-Type': 'application/json' });
  response.end(JSON.stringify(body));
}

function sendRpcError(response: ServerResponse, code: number, message: string): void {
  sendJson(response, 400, { jsonrpc: '2.0', id: null, error: { code, message } });
}

/**
 * Loopback callers only. Browsers always send `Origin` on cross-site POSTs, so refusing
 * it (and any non-loopback `Host`) keeps web pages from reaching this server.
 */
function isLocalRequest(request: IncomingMessage): boolean {
  const isLoopbackHost = /^(127\.0\.0\.1|localhost)(:\d+)?$/.test(request.headers.host ?? '');
  return isLoopbackHost && request.headers.origin === undefined;
}

/**
 * Creates the HTTP request listener. Each agent run gets its own URL, `/mcp/<token>`;
 * `resolveTools` maps the token to that run's tools, or `null` if the token is not valid.
 */
export function createMcpRequestListener(
  serverInfo: McpServerInfo,
  resolveTools: (token: string) => readonly McpTool[] | null,
): (request: IncomingMessage, response: ServerResponse) => void {
  const handle = async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    const token = /^\/mcp\/([A-Za-z0-9-]+)$/.exec(request.url ?? '')?.[1];
    const tools = token && isLocalRequest(request) ? resolveTools(token) : null;
    if (!tools) {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== 'POST') {
      // GET would open a server-to-client stream, which this server does not offer.
      response.writeHead(405, { Allow: 'POST' }).end();
      return;
    }

    const body = await readBody(request);
    if (body === null) {
      response.writeHead(413).end();
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      sendRpcError(response, -32700, 'Parse error');
      return;
    }
    const message = jsonRpcRequestSchema.safeParse(parsed);
    if (!message.success) {
      sendRpcError(response, -32600, 'Invalid request');
      return;
    }

    const reply = await handleMcpMessage(message.data, tools, serverInfo);
    if (reply === null) response.writeHead(202).end();
    else sendJson(response, 200, reply);
  };

  return (request, response) => {
    handle(request, response).catch((error: unknown) => {
      console.error('MCP request failed.', error);
      if (!response.headersSent) response.writeHead(500);
      response.end();
    });
  };
}
