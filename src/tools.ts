// Curated tool registry for the SportWizzard REST v1 API.
//
// Each descriptor maps one MCP tool onto one REST endpoint. We deliberately
// expose a *curated* high-value subset of the 27 v1 endpoints (data: odds,
// stats, events/context; derived: edges, arbitrage; discovery/reference)
// rather than one tool per path. The one endpoint we intentionally do NOT
// expose is /api/v1/snapshot — it's a ~40MB gzip blob of every live market,
// meant for bulk consumers, and would overflow any agent context window.

export type ParamType = "string" | "number" | "integer" | "boolean";

export interface ToolParam {
  name: string; // snake_case — matches both the MCP arg and the REST query/path param
  type: ParamType;
  description: string;
  enum?: string[];
}

export interface ToolDef {
  name: string;
  description: string;
  /** REST path template. `{param}` placeholders are filled from pathParams. */
  path: string;
  pathParams?: ToolParam[];
  queryParams?: ToolParam[];
  /** mock-mode fixture key (see mock.ts). */
  mockKey: string;
  /** Params that are consumed by a custom handler, not sent to the API. Required in the schema. */
  localParams?: ToolParam[];
  /**
   * Whether this tool makes sense over a remote (Streamable HTTP) connection.
   * Defaults to true. `download_snapshot` writes to a path on the *server's*
   * filesystem — meaningful for stdio (server runs on the caller's machine)
   * but not for the hosted multi-tenant server, so it's excluded there.
   */
  remoteSafe?: boolean;
}

const LIMIT: ToolParam = {
  name: "limit",
  type: "integer",
  description: "Max rows to return (page size). Default 50, server caps apply.",
};
const CURSOR: ToolParam = {
  name: "cursor",
  type: "string",
  description:
    "Opaque pagination cursor. Pass the `nextCursor` from a previous response to fetch the next page.",
};

export const TOOLS: ToolDef[] = [
  // ---- Events (the spine) ---------------------------------------------------
  {
    name: "list_events",
    description:
      "List sporting events / fixtures (the spine of the API). Each event carries home/away team, start time, status and whether live odds exist (hasOdds). Filter by league, team, status or start-time window, then use the returned event id with get_event_odds. Paginate with cursor.",
    path: "/api/v1/events",
    queryParams: [
      { name: "league", type: "string", description: "League slug (e.g. mlb, wnba, mls, pga-tour, fifa-world-cup). See list_leagues." },
      { name: "team_id", type: "string", description: "Filter to events involving this team UUID (from list_teams)." },
      { name: "status", type: "string", description: "Event status filter (e.g. scheduled, live, final)." },
      { name: "starts_after", type: "string", description: "ISO-8601 timestamp; only events starting at/after this time." },
      { name: "starts_before", type: "string", description: "ISO-8601 timestamp; only events starting at/before this time." },
      CURSOR,
      LIMIT,
    ],
    mockKey: "events",
  },
  {
    name: "get_event",
    description:
      "Full detail for a single event: teams, start time, status, league, venue, season year, final scores (when final), and rich game context — weather, confirmed/projected lineups, probable pitchers, and officials where the league provides them. The model-builder's pre-game context endpoint. Use an event id from list_events.",
    path: "/api/v1/events/{event_id}",
    pathParams: [
      { name: "event_id", type: "string", description: "Event UUID (from list_events)." },
    ],
    mockKey: "event_detail",
  },
  {
    name: "get_event_stats",
    description:
      "The box score for a single event: every player's stat line (e.g. batting_stats/pitching_stats JSON per player) plus the team-level result row (scores, team stats). Use an event id from list_events; works for final and in-progress events that have stats.",
    path: "/api/v1/events/{event_id}/stats",
    pathParams: [
      { name: "event_id", type: "string", description: "Event UUID (from list_events)." },
    ],
    mockKey: "event_stats",
  },
  {
    name: "get_event_odds",
    description:
      "Get every sportsbook price for a single event: one flat row per book x market x selection, with american+decimal price, line, side, player/team, and SportWizzard's devigged fair odds where available. Use an event id from list_events.",
    path: "/api/v1/events/{event_id}/odds",
    pathParams: [
      { name: "event_id", type: "string", description: "Event UUID (from list_events)." },
    ],
    mockKey: "odds",
  },

  // ---- Odds (core, entity-scoped) ------------------------------------------
  {
    name: "get_odds",
    description:
      "Core odds query. Returns a flat array of book prices scoped by any combination of event_id, player_id, team_id, sportsbook, market and league. Called unscoped it paginates hard — prefer scoping to at least one entity. Paginate with cursor.",
    path: "/api/v1/odds",
    queryParams: [
      { name: "event_id", type: "string", description: "Scope to one event (UUID from list_events)." },
      { name: "player_id", type: "string", description: "Scope to one player (UUID from list_players)." },
      { name: "team_id", type: "string", description: "Scope to one team (UUID from list_teams)." },
      { name: "sportsbook", type: "string", description: "Sportsbook / DFS source id (e.g. draftkings, prizepicks). See list_sportsbooks." },
      { name: "market", type: "string", description: "Market type filter (e.g. MONEYLINE, SPREAD, PLAYER_TOTAL). See list_markets." },
      { name: "league", type: "string", description: "League slug filter." },
      CURSOR,
      LIMIT,
    ],
    mockKey: "odds",
  },
  {
    name: "get_player_odds",
    description:
      "All current book prices for a single player across events and markets (player props). Use a player id from list_players. Paginate with cursor.",
    path: "/api/v1/players/{player_id}/odds",
    pathParams: [
      { name: "player_id", type: "string", description: "Player UUID (from list_players)." },
    ],
    queryParams: [CURSOR, LIMIT],
    mockKey: "odds",
  },
  {
    name: "get_team_odds",
    description:
      "All current book prices for a single team across its events and markets. Use a team id from list_teams. Paginate with cursor.",
    path: "/api/v1/teams/{team_id}/odds",
    pathParams: [
      { name: "team_id", type: "string", description: "Team UUID (from list_teams)." },
    ],
    queryParams: [CURSOR, LIMIT],
    mockKey: "odds",
  },

  // ---- Derived (the moat) ---------------------------------------------------
  {
    name: "get_edges",
    description:
      "SportWizzard's edge finder: DFS/book offers that are +EV versus the devigged fair market, with the edge %, the book(s) setting fair value, and per-book odds. Filter by league, source (DFS/book), minimum edge, or a single event. Paginate with cursor.",
    path: "/api/v1/edges",
    queryParams: [
      { name: "league", type: "string", description: "League slug filter." },
      { name: "source", type: "string", description: "DFS/book source id to find edges for (e.g. prizepicks, underdog)." },
      { name: "min_edge", type: "number", description: "Minimum edge threshold (e.g. 5 for 5%)." },
      { name: "event_id", type: "string", description: "Scope to a single event UUID." },
      CURSOR,
      LIMIT,
    ],
    mockKey: "edges",
  },
  {
    name: "get_arbitrage",
    description:
      "Arbitrage scanner: cross-book opportunities with a guaranteed profit, including each leg (source, selection, odds) and the optimal stake fractions. Filter by type (two_way | three_way) and minimum profit %. Paginate with cursor.",
    path: "/api/v1/arbitrage",
    queryParams: [
      { name: "type", type: "string", description: "Arbitrage type.", enum: ["two_way", "three_way"] },
      { name: "min_profit", type: "number", description: "Minimum guaranteed profit % (e.g. 1 for 1%)." },
      CURSOR,
      LIMIT,
    ],
    mockKey: "arbitrage",
  },

  // ---- Reference / discovery ------------------------------------------------
  {
    name: "list_players",
    description:
      "List players (reference resource). Filter by league and/or team. Returns player UUIDs to use with get_player_odds and get_player_stats. Paginate with cursor.",
    path: "/api/v1/players",
    queryParams: [
      { name: "league", type: "string", description: "League slug filter." },
      { name: "team", type: "string", description: "Team UUID filter." },
      CURSOR,
      LIMIT,
    ],
    mockKey: "players",
  },
  {
    name: "list_teams",
    description:
      "List teams (reference resource). Filter by league. Returns team UUIDs to use with list_events(team_id), get_team_odds and get_team_stats. Paginate with cursor.",
    path: "/api/v1/teams",
    queryParams: [
      { name: "league", type: "string", description: "League slug filter." },
      CURSOR,
      LIMIT,
    ],
    mockKey: "teams",
  },
  {
    name: "get_player_stats",
    description:
      "Historical / season statistics for a single player. Use a player id from list_players; optionally scope to one season.",
    path: "/api/v1/players/{player_id}/stats",
    pathParams: [
      { name: "player_id", type: "string", description: "Player UUID (from list_players)." },
    ],
    queryParams: [
      { name: "season", type: "integer", description: "Season year (e.g. 2026). Omit for all available." },
    ],
    mockKey: "player_stats",
  },
  {
    name: "get_team_stats",
    description:
      "Per-game team stats and results for a single team (scores, result, team stat JSON per event). Use a team id from list_teams; optionally scope to one season.",
    path: "/api/v1/teams/{team_id}/stats",
    pathParams: [
      { name: "team_id", type: "string", description: "Team UUID (from list_teams)." },
    ],
    queryParams: [
      { name: "season", type: "integer", description: "Season year (e.g. 2026). Omit for all available." },
    ],
    mockKey: "team_stats",
  },
  {
    name: "get_player_game_logs",
    description:
      "Bulk per-game player stat rows (game logs) filtered by player, team, or event — the model-training data feed. At least one of player_id / team_id / event_id is required. Each row is one player-game with the raw stat JSON. Paginate with cursor.",
    path: "/api/v1/stats/players",
    queryParams: [
      { name: "player_id", type: "string", description: "Player UUID (from list_players)." },
      { name: "team_id", type: "string", description: "Team UUID (from list_teams)." },
      { name: "event_id", type: "string", description: "Event UUID (from list_events)." },
      CURSOR,
      LIMIT,
    ],
    mockKey: "player_game_logs",
  },
  {
    name: "download_snapshot",
    description:
      "Download the FULL live board — every market from every sportsbook (tens of MB gzip, 80k+ markets) — and save it to a file on disk instead of returning it (it would not fit in a context window). Provide an absolute save_path: a path ending in .gz keeps the gzip; any other path writes decompressed JSON. Returns the saved path, byte count and ETag. Re-poll cheaply by passing the returned etag: unchanged data returns not_modified without downloading.",
    path: "/api/v1/snapshot",
    localParams: [
      { name: "save_path", type: "string", description: "Absolute file path to write the snapshot to. `.gz` suffix keeps it gzip-compressed; otherwise decompressed JSON is written." },
      { name: "etag", type: "string", description: "Optional: the etag from a previous download. If the board hasn't changed the server returns 304 and nothing is downloaded." },
    ],
    mockKey: "snapshot_file",
    remoteSafe: false,
  },
  {
    name: "get_account_usage",
    description:
      "Your API plan and usage: plan tier, per-minute rate limit, monthly usage/cap where metered. Works without a key (shows the effective anonymous plan).",
    path: "/api/v1/account/usage",
    mockKey: "usage",
  },
  {
    name: "list_sportsbooks",
    description:
      "List the sportsbooks and DFS platforms SportWizzard tracks, with a live market count each. Reference/discovery — call this to learn valid `sportsbook` filter values.",
    path: "/api/v1/sportsbooks",
    mockKey: "sportsbooks",
  },
  {
    name: "list_leagues",
    description:
      "List the leagues currently covered (with live markets). Reference/discovery — call this to learn valid `league` filter values.",
    path: "/api/v1/leagues",
    mockKey: "leagues",
  },
  {
    name: "list_markets",
    description:
      "List the market types SportWizzard supports, each with a live market count. Reference/discovery — call this to learn valid `market` filter values.",
    path: "/api/v1/markets",
    mockKey: "markets",
  },
  {
    name: "status",
    description:
      "Platform status: total live markets and number of sportsbooks currently ingesting. A cheap health/coverage check.",
    path: "/api/v1/status",
    mockKey: "status",
  },
];

/** The subset of TOOLS exposed over the remote Streamable HTTP transport. */
export const REMOTE_TOOLS: ToolDef[] = TOOLS.filter((t) => t.remoteSafe !== false);
