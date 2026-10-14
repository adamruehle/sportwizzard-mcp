# SportWizzard MCP Server

Query live sports-betting data — **odds, player props, +EV edges, arbitrage, stats and reference data** from 35+ sportsbooks and DFS apps — from any MCP-capable AI agent (Claude Code, Claude Desktop, Codex, Cursor, …).

20 read-only tools over the [SportWizzard REST v1 API](https://sportwizzard.com/developers), available two ways: a **hosted remote server** (zero install) and a **stdio server** via `npx`. Get a free API key at <https://sportwizzard.com/account> (API Keys tab — no card required).

## Hosted (recommended — zero install)

```bash
claude mcp add --transport http sportwizzard https://mcp.sportwizzard.com/mcp \
  --header "Authorization: Bearer sw_live_your_api_key_here"
```

```bash
codex mcp add sportwizzard --transport http --url https://mcp.sportwizzard.com/mcp \
  --header "Authorization: Bearer sw_live_your_api_key_here"
```

The hosted server is a thin proxy: your key is forwarded to the SportWizzard API, which enforces auth and rate limits. All 20 tools work on both transports. (`download_snapshot` on the hosted server returns a CDN download URL + a ready-to-run command your agent executes locally; on stdio it writes the file directly.)

## Stdio (local)

```bash
npx -y sportwizzard-mcp
```

Claude Code:

```bash
claude mcp add sportwizzard -e SPORTWIZZARD_API_KEY=sw_live_your_api_key_here -- npx -y sportwizzard-mcp
```

Claude Desktop (`claude_desktop_config.json` — macOS: `~/Library/Application Support/Claude/`, Windows: `%APPDATA%\Claude\`):

```json
{
  "mcpServers": {
    "sportwizzard": {
      "command": "npx",
      "args": ["-y", "sportwizzard-mcp"],
      "env": { "SPORTWIZZARD_API_KEY": "sw_live_your_api_key_here" }
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
| `get_odds` / `get_event_odds` / `get_player_odds` / `get_team_odds` | Current prices, scoped by event, player, team, sportsbook, market, or league. `get_odds` also takes `scope`: `event` (game markets), `season` (season-long futures), `tournament` (golf/tennis outrights); omit for all. |
| `get_edges` | +EV edges vs. devigged fair market (league, source, min_edge filters). |
| `get_arbitrage` | Arbitrage opportunities with legs and stake fractions (two/three-way). |
| `list_players` / `list_teams` / `get_player_stats` / `get_team_stats` | Reference data and season/historical stats. |
| `get_player_game_logs` | Bulk per-game stat rows — the model-training feed. |
| `download_snapshot` | Save the full live board to disk (tens of MB gzip). `include_history: true` also populates every selection's `priceHistory` (same schema; 5 credits flat vs 1). |
| `list_sportsbooks` / `list_leagues` / `list_markets` / `status` | Coverage: books, leagues, market types, live counts. |
| `get_account_usage` | Your plan tier, rate limit, and monthly usage. |

Every response uses the envelope `{ success, data, nextCursor, meta }`; when `nextCursor` is present the tool appends a `_paging` hint so agents know to continue.

### Futures (season-scope markets)

`get_odds` with `scope=season` returns season-long futures — division/conference/championship winners, award odds, team win totals, season leaders and full-season player props. Three orthogonal axes describe them:

- **`marketScope`** — which anchor the market hangs off: `SEASON` or `TOURNAMENT`. Omitted entirely on ordinary game rows.
- **`period`** — the window within that anchor: `REG_SEASON` (settles at the end of the regular season) or `FULL` (runs through the playoffs).
- **`segment`** — which slice of the competition: `AFC_EAST`, `NL`, `SEC`, … Present only when the market is segment-scoped, and load-bearing: all 32 NFL `DIVISION_WINNER` selections share **one** season-anchor `eventId`, so without `segment` they read as a single 32-team race instead of 8 divisions.

Notes: winner/award markets are categorical (one `YES` selection per competitor, `teamSide: "NONE"`, usually no NO side); `eventStartTime` on a futures row is the season anchor / settlement date, **not** a kickoff; every book's futures for a competition share the same season `eventId`; and futures are deliberately excluded from `get_edges` / `get_arbitrage` (they never enter de-vig or edge math). Scope matching is exact — `season` does not include `TOURNAMENT` — and an invalid value returns HTTP 400 naming the valid ones.

## From source

```bash
git clone https://github.com/sportwizzard-admin/sportwizzard-mcp.git
cd sportwizzard-mcp && npm install && npm run build
SPORTWIZZARD_MOCK=1 node dist/index.js   # or set SPORTWIZZARD_API_KEY
```

## Maintainer publishing

The hosted HTTP service has a separate container publisher:
`publish-container.yml` runs on `main`, builds tracked source, and publishes a
source-labeled GHCR image with an `image-release` receipt. Promote that digest
in `sportwizzard-ops/deployment/releases/api.yaml` to deploy through Ops.
Production placement, resource limits and credentials references belong there.
Publishing the npm launcher below does not update the hosted container.

Publishing is a manual GitHub Actions release. First bump `version` in `package.json`, update `package-lock.json` with `npm install --package-lock-only`, synchronize `server.json`, and merge the change to `main`. Then run **Publish npm package** from the repository's Actions tab with `main` selected. The build job verifies package/lock/registry metadata and the unused version, installs dependencies without lifecycle scripts, builds once, and packs a tarball. It installs that tarball in a disposable consumer and runs the mock stdio smoke below. A separate publish job receives OIDC permission, verifies the tarball checksum, and publishes those exact bytes with lifecycle scripts disabled; it does not check out source or install application dependencies. The workflow retains the tarball and smoke receipt and does not run on pushes.

### Package smoke (no production API)

After `npm ci --ignore-scripts` and `npm run build`, pack and install the artifact
in a temporary consumer directory, then exercise its actual stdio entry point:

```bash
release_dir="$(mktemp -d)"
npm pack --ignore-scripts --pack-destination "$release_dir"
npm install --prefix "$release_dir/consumer" --omit=dev --ignore-scripts --no-audit --no-fund "$release_dir"/*.tgz
npm run smoke -- "$release_dir/consumer/node_modules/sportwizzard-mcp/dist/index.js" "$release_dir/smoke.json" "$release_dir"/*.tgz
```

The smoke has a 20-second protocol timeout and uses a loopback mock HTTP API
with no credentials. It checks `tools/list`, forwards `get_odds scope=season`,
and downloads/decompresses a snapshot with `include_history=true`. The JSON
receipt records artifact hash, inputs, server version, outputs and duration.
It verifies transport, packaging and parameter forwarding; it does not establish
live API data quality. Retain the receipt, then remove the temporary directory.

The repository moved to the personal GitHub account `sportwizzard-admin`. Its npm trusted-publisher connection has not yet been reconnected or qualified for the new owner; the prior `adamruehle/sportwizzard-mcp` trust does not transfer. After the owner completes the pending npm passkey login, configure a trusted publisher in the package's npm settings for GitHub Actions, repository `sportwizzard-admin/sportwizzard-mcp`, workflow file `publish-npm.yml`, and allow `npm publish`. The equivalent command is `npx --yes npm@11.15.0 trust github --file publish-npm.yml --repository sportwizzard-admin/sportwizzard-mcp --allow-publish`. This command changes npm account settings and requires package write access and account 2FA; it is deliberately not run as part of source setup. The workflow uses Node 24 and npm 11.15.0, which support npm's OIDC publishing. Do not dispatch or claim a new-owner publish until the connection is qualified.

To refresh local npm CLI access, use `npx --yes npm@11 login`, then confirm the identity with `npm whoami`. The installed npm 10 login command crashes in the maintainer environment; npm 11 login is the working refresh path. On Adam's workstation, `~/.npmrc` is a symlink to `/home/adamr/Development/sportwizzard-account-secrets/npm/npmrc`. Keep that symlink and target local, never print or commit the file contents, and do not copy its token into the repository. The local login is separate from workflow publishing, which uses short-lived OIDC credentials and needs no npm token secret.

## License

MIT © SportWizzard LLC
