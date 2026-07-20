# SportWizzard MCP Server

Query live sports-betting data — **odds, player props, +EV edges, arbitrage, stats and reference data** from 35+ sportsbooks and DFS apps — from any MCP-capable AI agent (Claude Code, Claude Desktop, Codex, Cursor, …).

20 read-only tools over the [SportWizzard REST v1 API](https://sportwizzard.com/developers), available two ways: a **hosted remote server** (zero install) and a **stdio server** via `npx`. Get a free API key at <https://sportwizzard.com/account> (API Keys tab — no card required).

## Hosted (recommended — zero install)

```bash
claude mcp add --transport http sportwizzard https://mcp.sportwizzard.com/mcp \
  --header "Authorization: Bearer sk_your_key_here"
```

```bash
codex mcp add sportwizzard --transport http --url https://mcp.sportwizzard.com/mcp \
  --header "Authorization: Bearer sk_your_key_here"
```

The hosted server is a thin proxy: your key is forwarded to the SportWizzard API, which enforces auth and rate limits. All 20 tools work on both transports. (`download_snapshot` on the hosted server returns a CDN download URL + a ready-to-run command your agent executes locally; on stdio it writes the file directly.)

## Stdio (local)

```bash
npx -y sportwizzard-mcp
```

Claude Code:

```bash
claude mcp add sportwizzard -e SPORTWIZZARD_API_KEY=sk_your_key_here -- npx -y sportwizzard-mcp
```

Claude Desktop (`claude_desktop_config.json` — macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "sportwizzard": {
      "command": "npx",
      "args": ["-y", "sportwizzard-mcp"],
      "env": { "SPORTWIZZARD_API_KEY": "sk_your_key_here" }
    }
  }
}
```

### Mock mode (no key, no network)

Set `SPORTWIZZARD_MOCK=1` to get canned sample responses — useful for wiring up an integration before you have a key.

## Configuration

| Env var | Default | Purpose |
|---|---|---|
| `SPORTWIZZARD_API_KEY` | _(none)_ | Your API key, sent as `X-Api-Key`. |
| `SPORTWIZZARD_BASE_URL` | `https://api.sportwizzard.com` | Override the API base URL. |
| `SPORTWIZZARD_MOCK` | _(off)_ | `1` = canned sample data, no network. |

## Tools

| Tool | What it does |
|---|---|
| `list_events` / `get_event` | Events/fixtures — filter by league, team, status, time; full detail incl. weather, lineups, probable pitchers. |
| `get_event_stats` | Box score: every player's stat line + team results for one event. |
| `get_odds` / `get_event_odds` / `get_player_odds` / `get_team_odds` | Current prices, scoped by event, player, team, sportsbook, market, or league. |
| `get_edges` | +EV edges vs. devigged fair market (league, source, min_edge filters). |
| `get_arbitrage` | Arbitrage opportunities with legs and stake fractions (two/three-way). |
| `list_players` / `list_teams` / `get_player_stats` / `get_team_stats` | Reference data and season/historical stats. |
| `get_player_game_logs` | Bulk per-game stat rows — the model-training feed. |
| `download_snapshot` | The FULL live board (80k+ markets, ~70MB gzip) to a file — never enters the context window; ETag-aware for cheap re-syncs. Hosted returns a CDN URL + save command; stdio writes directly. |
| `list_sportsbooks` / `list_leagues` / `list_markets` / `status` | Coverage: books, leagues, market types, live counts. |
| `get_account_usage` | Your plan tier, rate limit, and monthly usage. |

Every response uses the envelope `{ success, data, nextCursor, meta }`; when `nextCursor` is present the tool appends a `_paging` hint so agents know to continue.

## From source

```bash
git clone https://github.com/adamruehle/sportwizzard-mcp.git
cd sportwizzard-mcp && npm install && npm run build
SPORTWIZZARD_MOCK=1 node dist/index.js   # or set SPORTWIZZARD_API_KEY
```

## License

MIT © SportWizzard LLC
