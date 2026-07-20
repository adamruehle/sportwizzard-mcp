#!/usr/bin/env node
// SportWizzard MCP server — stdio transport.
// Exposes a curated set of tools over the SportWizzard REST v1 API so any
// MCP-capable AI agent (Claude Desktop, Cursor, Claude Code, etc.) can query
// live odds, edges, arbitrage, stats and reference data with the customer's
// API key. For the hosted remote (Streamable HTTP) variant, see httpServer.ts.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./client.js";
import { buildServer } from "./server.js";
import { TOOLS } from "./tools.js";

const cfg = loadConfig();
const server = buildServer(cfg, TOOLS);

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stderr is safe for logs (stdout is the MCP protocol channel).
  console.error(
    `sportwizzard-mcp ready — base=${cfg.baseUrl} mode=${
      cfg.mock ? "MOCK" : cfg.apiKey ? "live(keyed)" : "live(no key)"
    } tools=${TOOLS.length}`
  );
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
