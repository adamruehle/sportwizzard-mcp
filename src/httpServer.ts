#!/usr/bin/env node
// SportWizzard MCP server — remote Streamable HTTP transport.
//
// Same tool set as the stdio server (index.ts), minus `download_snapshot`
// (see tools.ts `remoteSafe` — writing to the *server's* filesystem doesn't
// make sense for a hosted multi-tenant process). Auth: every request must
// carry `Authorization: Bearer <sportwizzard-api-key>`; the key is validated
// against SB (see auth.ts) and passed straight through as `X-Api-Key` on the
// downstream REST calls the tools make, exactly like the stdio server passes
// its env-var key. This is the shape documented in docs/AI_NATIVE_PLAN.md's
// hosted-MCP section (bearer-key-in-header, matching Stripe/Cloudflare/Neon).
//
// Stateless mode: each HTTP POST is handled independently (no MCP session
// state kept server-side between calls) — the SDK's documented pattern for
// a server that's a thin, idempotent wrapper over a REST API with nothing to
// resume. See node_modules/@modelcontextprotocol/sdk .../examples/server/
// simpleStatelessStreamableHttp.js for the upstream reference this mirrors.

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import type { Request, Response } from "express";
import { buildServer } from "./server.js";
import { REMOTE_TOOLS } from "./tools.js";
import { DEFAULT_BASE_URL } from "./client.js";
import { validateApiKey, checkRateLimit, extractBearerToken } from "./auth.js";

const PORT = Number(process.env.MCP_HTTP_PORT ?? 8091);
const BASE_URL = process.env.SPORTWIZZARD_BASE_URL || DEFAULT_BASE_URL;
// Hostnames the request's Host header is allowed to present as (DNS-rebinding
// guard). mcp.sportwizzard.com is the public hostname via the cloudflared
// tunnel; localhost/127.0.0.1 are for local/container-internal testing.
const ALLOWED_HOSTS = (process.env.MCP_ALLOWED_HOSTS || "mcp.sportwizzard.com,localhost,127.0.0.1")
  .split(",")
  .map((h) => h.trim())
  .filter(Boolean);

const app = createMcpExpressApp({ host: "0.0.0.0", allowedHosts: ALLOWED_HOSTS });

function rpcError(res: Response, status: number, message: string, requestId: string | number | null = null) {
  res.status(status).json({ jsonrpc: "2.0", error: { code: -32000, message }, id: requestId });
}

// No auth required — container healthcheck + uptime probes.
app.get("/healthz", (_req, res) => {
  res.status(200).json({ status: "ok", tools: REMOTE_TOOLS.length, base_url: BASE_URL });
});

async function withAuth(req: Request, res: Response): Promise<string | null> {
  const token = extractBearerToken(req.headers.authorization);
  const id = (req.body && typeof req.body === "object" && "id" in req.body) ? req.body.id : null;

  if (!token) {
    rpcError(res, 401, "Missing API key. Send 'Authorization: Bearer <sportwizzard-api-key>'. Get a key at https://sportwizzard.com/account.", id);
    return null;
  }

  const rate = checkRateLimit(token);
  if (!rate.ok) {
    rpcError(res, rate.status, rate.message, id);
    return null;
  }

  const auth = await validateApiKey(token, BASE_URL);
  if (!auth.ok) {
    rpcError(res, auth.status, auth.message, id);
    return null;
  }

  return token;
}

const mcpPostHandler = async (req: Request, res: Response) => {
  const token = await withAuth(req, res);
  if (!token) return; // response already sent

  try {
    const server = buildServer({ baseUrl: BASE_URL, apiKey: token, mock: false }, REMOTE_TOOLS);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined, // stateless: no session continuity needed
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on("close", () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    console.error("Error handling MCP request:", error);
    if (!res.headersSent) {
      res.status(500).json({ jsonrpc: "2.0", error: { code: -32603, message: "Internal server error" }, id: null });
    }
  }
};

app.post("/mcp", mcpPostHandler);

// Stateless mode has no server-initiated stream / session to resume.
app.get("/mcp", (_req, res) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server has no GET stream)." }, id: null }));
});
app.delete("/mcp", (_req, res) => {
  res.writeHead(405).end(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "Method not allowed (stateless server has no session to end)." }, id: null }));
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `sportwizzard-mcp (Streamable HTTP) listening on 0.0.0.0:${PORT} — base=${BASE_URL} tools=${REMOTE_TOOLS.length} allowedHosts=${ALLOWED_HOSTS.join(",")}`
  );
});

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));
