// Shared MCP `Server` construction — used by both the stdio entry point
// (index.ts) and the remote Streamable HTTP entry point (httpServer.ts).
// Keeping this in one place means both transports register the exact same
// tool set, schemas and call semantics; only the transport differs.

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { apiGet, downloadSnapshot, ClientConfig, SportWizzardError } from "./client.js";
import { mockFor } from "./mock.js";
import { TOOLS, ToolDef, ToolParam } from "./tools.js";

function jsonSchemaType(t: ToolParam["type"]): string {
  return t === "integer" ? "integer" : t; // string | number | integer | boolean
}

function inputSchema(def: ToolDef) {
  const properties: Record<string, any> = {};
  const required: string[] = [];
  for (const p of def.pathParams ?? []) {
    const s: any = { type: jsonSchemaType(p.type), description: p.description };
    if (p.enum) s.enum = p.enum;
    properties[p.name] = s;
    required.push(p.name);
  }
  for (const p of def.localParams ?? []) {
    properties[p.name] = { type: jsonSchemaType(p.type), description: p.description };
    if (p.name === "save_path") required.push(p.name); // only save_path is mandatory
  }
  for (const p of def.queryParams ?? []) {
    const s: any = { type: jsonSchemaType(p.type), description: p.description };
    if (p.enum) s.enum = p.enum;
    properties[p.name] = s;
  }
  return {
    type: "object" as const,
    properties,
    ...(required.length ? { required } : {}),
    additionalProperties: false,
  };
}

function okResult(body: any) {
  // Surface pagination explicitly so the agent knows when/how to page.
  const hint =
    body && typeof body === "object" && body.nextCursor
      ? { _paging: `More rows available. Call again with cursor="${body.nextCursor}".` }
      : undefined;
  const payload = hint ? { ...body, ...hint } : body;
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
  };
}

function errorResult(message: string) {
  return {
    isError: true,
    content: [{ type: "text" as const, text: message }],
  };
}

/**
 * Build a fully-wired MCP `Server` bound to a specific caller's config
 * (base URL / API key / mock flag) and tool set. Callers connect it to
 * whichever `Transport` they're using (stdio, Streamable HTTP, ...).
 *
 * @param cfg   Per-connection client config (the caller's API key, for HTTP).
 * @param tools Tool set to expose. Defaults to the full TOOLS registry
 *              (stdio); the HTTP transport passes a filtered subset that
 *              excludes tools that don't make sense over a remote connection
 *              (see tools.ts `remoteSafe`).
 */
export function buildServer(cfg: ClientConfig, tools: ToolDef[] = TOOLS): Server {
  const byName = new Map(tools.map((t) => [t.name, t]));

  const server = new Server(
    { name: "sportwizzard-mcp", version: "0.1.0" },
    { capabilities: { tools: {} } }
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      inputSchema: inputSchema(t),
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const def = byName.get(req.params.name);
    if (!def) {
      return errorResult(`Unknown tool: ${req.params.name}`);
    }
    const args = (req.params.arguments ?? {}) as Record<string, unknown>;

    // Custom handler: snapshot download streams to disk instead of returning the body.
    if (def.name === "download_snapshot") {
      const savePath = String(args.save_path ?? "");
      if (!savePath || !savePath.startsWith("/")) {
        return errorResult("Parameter 'save_path' must be an absolute file path (e.g. /tmp/snapshot.json or /tmp/snapshot.json.gz).");
      }
      try {
        const meta = await downloadSnapshot(cfg, savePath, args.etag ? String(args.etag) : undefined);
        return okResult(meta);
      } catch (e) {
        const msg = e instanceof SportWizzardError ? e.message : `Unexpected error: ${String(e)}`;
        return errorResult(msg);
      }
    }

    // Build path (fill {placeholders}) and split remaining args into query.
    let path = def.path;
    const pathNames = new Set((def.pathParams ?? []).map((p) => p.name));
    for (const p of def.pathParams ?? []) {
      const v = args[p.name];
      if (v === undefined || v === null || v === "") {
        return errorResult(`Missing required parameter '${p.name}' for ${def.name}`);
      }
      path = path.replace(`{${p.name}}`, encodeURIComponent(String(v)));
    }
    const query: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
      if (!pathNames.has(k)) query[k] = v;
    }

    // Mock mode: return canned data, no network, no key required.
    if (cfg.mock) {
      return okResult(mockFor(def.mockKey));
    }

    // Live mode. Data endpoints are currently permitAll (pre-billing), so we make
    // the call even without a key. Once metering is enforced the server replies
    // 401/403 and the client turns that into a clear "set your API key" message.
    try {
      const body = await apiGet(cfg, path, query);
      return okResult(body);
    } catch (e) {
      const msg =
        e instanceof SportWizzardError ? e.message : `Unexpected error: ${String(e)}`;
      return errorResult(msg);
    }
  });

  return server;
}
