// Canned sample responses for SPORTWIZZARD_MOCK=1, so a developer can try the
// tools without an API key or network. Fixtures mirror real v1 envelope shapes
// (captured from api.sportwizzard.com) but are trimmed and clearly synthetic.

export const MOCK: Record<string, any> = {
  status: {
    success: true,
    data: [{ totalMarkets: 117774, sportsbooks: 29 }],
    meta: { count: 1, updated: "2026-07-09T16:58:29Z" },
    _mock: true,
  },
  leagues: {
    success: true,
    data: ["mlb", "brazil-sa", "fifa-world-cup", "wnba", "pga-tour", "mls"],
    meta: { count: 6, updated: "2026-07-09T16:58:29Z" },
    _mock: true,
  },
  sportsbooks: {
    success: true,
    data: [
      { id: "draftkings", marketCount: 7074 },
      { id: "fanduel", marketCount: 2335 },
      { id: "betmgm", marketCount: 9243 },
      { id: "prizepicks", marketCount: 1490 },
      { id: "underdog", marketCount: 2886 },
    ],
    meta: { count: 5, updated: "2026-07-09T16:58:29Z" },
    _mock: true,
  },
  markets: {
    success: true,
    data: [
      { marketType: "MONEYLINE", marketSubtype: null, liveCount: 1085 },
      { marketType: "SPREAD", marketSubtype: null, liveCount: 980 },
      { marketType: "PLAYER_TOTAL", marketSubtype: null, liveCount: 20411 },
    ],
    meta: { count: 3, updated: "2026-07-09T16:58:29Z" },
    _mock: true,
  },
  events: {
    success: true,
    data: [
      {
        id: "04618737-e571-44d9-befe-24c1d8b1be3f",
        homeTeamId: "7d0a80b1-138a-11f1-aba1-de512ebea802",
        homeTeamName: "Tampa Bay Rays",
        awayTeamId: "7d0a7fdb-138a-11f1-aba1-de512ebea802",
        awayTeamName: "New York Yankees",
        startTime: "2026-07-09T17:10Z",
        status: "scheduled",
        league: "mlb",
        hasOdds: true,
      },
    ],
    nextCursor: "MTc4MzYxNzAwMDAwMHwwNDYxODczNy1lNTcxLTQ0ZDktYmVmZS0yNGMxZDhiMWJlM2Y",
    meta: { count: 1 },
    _mock: true,
  },
  odds: {
    success: true,
    data: [
      {
        id: "b9445260-2841-4c38-9b8d-0598229ca565:ballybet:SPREAD:019f40db-e347-7a25-abc4",
        sportsbook: "ballybet",
        league: "wnba",
        eventId: "b9445260-2841-4c38-9b8d-0598229ca565",
        market: "SPREAD",
        marketSubtype: "SPREAD",
        period: "FULL",
        selection: "Atlanta Dream",
        priceAmerican: 190,
        priceDecimal: 2.9,
        line: -16.5,
        side: "HOME",
        teamSide: "HOME",
        teamName: "Atlanta Dream",
        suspended: false,
        eventStartTime: "2026-07-10T00:00",
        updated: "2026-07-09T16:58:04Z",
      },
    ],
    nextCursor: null,
    meta: { count: 1 },
    _mock: true,
  },
  edges: {
    success: true,
    data: [
      {
        id: "04618737-...|PLAYER_TOTAL_TOTAL_BASES|FULL|0.5|pid:7ebca4f0-...|OVER",
        league: "mlb",
        eventId: "04618737-e571-44d9-befe-24c1d8b1be3f",
        eventHomeTeam: "Tampa Bay Rays",
        eventAwayTeam: "New York Yankees",
        eventStartTime: "2026-07-09T17:10Z",
        market: "PLAYER_TOTAL_TOTAL_BASES",
        statType: "total_bases",
        period: "FULL",
        line: 0.5,
        side: "OVER",
        playerId: "7ebca4f0-138a-11f1-aba1-de512ebea802",
        playerName: "Ben Rice",
        playerTeamName: "New York Yankees",
        dfsSource: "chalkboard",
        dfsMultiplier: 1.78,
        dfsSelectionLabel: "Ben Rice Total Bases Over 0.5",
        bookSource: "thescore",
        bookImpliedProbability: 60.67,
        oddsByBook: [
          { source: "thescore", over: -180, under: 140, impliedProb: 60.67, lastSeen: "2026-07-09T16:57:07Z" },
        ],
      },
    ],
    nextCursor: null,
    meta: { count: 1 },
    _mock: true,
  },
  arbitrage: {
    success: true,
    data: [
      {
        id: "f1e05c22-...|MONEYLINE_3WAY|FULL|REG|ML",
        type: "three_way",
        profitPercent: 4.49,
        league: "fifa-world-cup",
        eventId: "f1e05c22-e63a-4d73-8a4b-caafcfc2e546",
        eventHomeTeam: "France",
        eventAwayTeam: "Morocco",
        eventStartTime: "2026-07-09T20:00Z",
        lastSeen: "2026-07-09T16:58:31Z",
        selections: [
          { source: "thescore", outcome: "HOME", selectionLabel: "France", odds: 700, stakeFraction: 0.2747 },
          { source: "betmgm", outcome: "AWAY", selectionLabel: "Morocco", odds: 1200, stakeFraction: 0.169 },
          { source: "draftkings", outcome: "DRAW", selectionLabel: "Draw", odds: 260, stakeFraction: 0.5563 },
        ],
      },
    ],
    nextCursor: null,
    meta: { count: 1 },
    _mock: true,
  },
  players: {
    success: true,
    data: [
      {
        id: "7ebca4f0-138a-11f1-aba1-de512ebea802",
        name: "Ben Rice",
        league: "mlb",
        teamId: "7d0a7fdb-138a-11f1-aba1-de512ebea802",
        position: "1B",
      },
    ],
    nextCursor: null,
    meta: { count: 1 },
    _mock: true,
  },
  teams: {
    success: true,
    data: [
      {
        id: "7d0a80b1-138a-11f1-aba1-de512ebea802",
        name: "Tampa Bay Rays",
        abbreviation: "TB",
        league: "mlb",
      },
    ],
    nextCursor: null,
    meta: { count: 1 },
    _mock: true,
  },
  event_detail: {
    success: true,
    data: [
      {
        id: "6968414b-57e4-4761-ba2b-f80a254e008e",
        homeTeamId: "7d0a80b1-138a-11f1-aba1-de512ebea802",
        homeTeamName: "Tampa Bay Rays",
        awayTeamId: "7d0a7fdb-138a-11f1-aba1-de512ebea802",
        awayTeamName: "New York Yankees",
        startTime: "2026-07-09T02:10:00Z",
        status: "final",
        league: "mlb",
        hasOdds: false,
        venueId: "71a0f05b-525b-41c0-81a6-64b64c48832b",
        seasonYear: 2026,
        homeScore: 4,
        awayScore: 3,
        result: 1,
        context: {
          weather: { condition: "Clear", temp_f: 78, wind_mph: 9, wind_dir: "Out To CF" },
          probable_pitchers: { home: "Shane Baz", away: "Carlos Rodón" },
          lineups_confirmed: true,
          officials: [{ position: "HP", name: "Pat Hoberg" }],
        },
      },
    ],
    meta: { count: 1 },
    _mock: true,
  },
  event_stats: {
    success: true,
    data: [
      {
        eventId: "6968414b-57e4-4761-ba2b-f80a254e008e",
        teams: [
          {
            eventId: "6968414b-57e4-4761-ba2b-f80a254e008e",
            homeId: "7d0a80b1-138a-11f1-aba1-de512ebea802",
            awayId: "7d0a7fdb-138a-11f1-aba1-de512ebea802",
            league: "mlb",
            homeScore: 4,
            awayScore: 3,
            result: 1,
            stats: null,
          },
        ],
        players: [
          {
            eventId: "6968414b-57e4-4761-ba2b-f80a254e008e",
            playerId: "7ebca4f0-138a-11f1-aba1-de512ebea802",
            teamId: "7d0a7fdb-138a-11f1-aba1-de512ebea802",
            date: "2026-07-09T02:10:00Z",
            data: {
              batting_stats: { ab: 4, h: 2, hr: 1, rbi: 2, bb: 0, so: 1 },
            },
          },
        ],
      },
    ],
    meta: { count: 1 },
    _mock: true,
  },
  team_stats: {
    success: true,
    data: [
      {
        eventId: "6968414b-57e4-4761-ba2b-f80a254e008e",
        homeId: "7d0a80b1-138a-11f1-aba1-de512ebea802",
        awayId: "7d0a7fdb-138a-11f1-aba1-de512ebea802",
        league: "mlb",
        homeScore: 4,
        awayScore: 3,
        result: 1,
        stats: null,
      },
    ],
    meta: { count: 1 },
    _mock: true,
  },
  player_game_logs: {
    success: true,
    data: [
      {
        eventId: "6968414b-57e4-4761-ba2b-f80a254e008e",
        playerId: "7ebca4f0-138a-11f1-aba1-de512ebea802",
        teamId: "7d0a7fdb-138a-11f1-aba1-de512ebea802",
        date: "2026-07-09T02:10:00Z",
        data: {
          batting_stats: { ab: 4, h: 2, hr: 1, rbi: 2, bb: 0, so: 1 },
        },
      },
    ],
    nextCursor: null,
    meta: { count: 1 },
    _mock: true,
  },
  usage: {
    success: true,
    data: [
      {
        plan: "enterprise",
        rateLimitPerMin: 60,
        authenticated: false,
        note: "No API key supplied; showing the effective anonymous plan (pre-billing, unmetered).",
      },
    ],
    meta: { count: 1 },
    _mock: true,
  },
  player_stats: {
    success: true,
    data: [
      {
        playerId: "7ebca4f0-138a-11f1-aba1-de512ebea802",
        playerName: "Ben Rice",
        season: 2026,
        league: "mlb",
        stats: { games: 88, hits: 92, homeRuns: 19, rbi: 55, avg: 0.264 },
      },
    ],
    meta: { count: 1 },
    _mock: true,
  },
};

export function mockFor(mockKey: string): any {
  return (
    MOCK[mockKey] ?? {
      success: true,
      data: [],
      meta: { count: 0 },
      _mock: true,
      _note: `No mock fixture for '${mockKey}'.`,
    }
  );
}
