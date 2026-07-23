// Thin HTTP client for the SportWizzard REST v1 API.
// - Auth via the `X-Api-Key` header (customer's Clerk-issued key).
// - Understands the `{ success, data, nextCursor, meta }` envelope.

export const DEFAULT_BASE_URL = "https://api.sportwizzard.com";
import { readFileSync } from "node:fs";
const _v = (() => { try { return JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")).version || "0.0.0"; } catch { return "0.0.0"; } })();
export const USER_AGENT = `sportwizzard-mcp/${_v}`;

export interface ClientConfig {
  baseUrl: string;
  apiKey?: string;
  mock: boolean;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ClientConfig {
  const mock = env.SPORTWIZZARD_MOCK === "1" || env.SPORTWIZZARD_MOCK === "true";
  return {
    baseUrl: (env.SPORTWIZZARD_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, ""),
    apiKey: env.SPORTWIZZARD_API_KEY,
    mock,
  };
}

export class SportWizzardError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "SportWizzardError";
  }
}

/**
 * Perform a GET against a v1 endpoint and return the parsed JSON body.
 * Query params with null/undefined/empty values are dropped.
 */
export async function apiGet(
  cfg: ClientConfig,
  path: string,
  query: Record<string, unknown> = {}
): Promise<any> {
  const url = new URL(cfg.baseUrl + path);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
    "User-Agent": USER_AGENT,
  };
  // Data endpoints are currently permitAll (pre-billing) so a key is optional,
  // but we always send it when present so metering "just works" once enforced.
  if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey;

  let res: Response;
  try {
    res = await fetch(url, { headers });
  } catch (e: any) {
    throw new SportWizzardError(`Network error calling ${path}: ${e?.message ?? e}`);
  }

  const text = await res.text();
  if (res.status === 401 || res.status === 403) {
    const suffix = cfg.apiKey
      ? "Your SPORTWIZZARD_API_KEY was rejected — check the key is valid and active."
      : "SPORTWIZZARD_API_KEY is not set. Set it to your SportWizzard API key " +
        "(get one at https://sportwizzard.com/account), or set SPORTWIZZARD_MOCK=1 to try with sample data.";
    throw new SportWizzardError(`Authentication required for ${path}. ${suffix}`, res.status);
  }
  if (!res.ok) {
    let detail = text;
    try {
      const j = JSON.parse(text);
      // v1 error envelope: { success:false, error:{ code, message } } — error is an OBJECT.
      detail =
        (j.error && typeof j.error === "object" ? j.error.message || JSON.stringify(j.error) : j.error) ||
        j.message ||
        text;
    } catch {
      /* keep raw text */
    }
    throw new SportWizzardError(
      `SportWizzard API ${res.status} on ${path}: ${detail || res.statusText}`,
      res.status
    );
  }

  if (!text) return { success: true, data: [], meta: { count: 0 } };
  try {
    return JSON.parse(text);
  } catch {
    throw new SportWizzardError(`Invalid JSON from ${path}`);
  }
}

/**
 * Download the full snapshot to a file, streaming (never buffers the whole body).
 * - fetch auto-decompresses the server's `Content-Encoding: gzip`, so the stream is JSON;
 *   a `.gz` save_path re-compresses on the way to disk.
 * - Pass a previous `etag` to get a cheap `not_modified` answer instead of a download.
 * - In mock mode, writes a tiny sample snapshot so agents can exercise the flow offline.
 */
export async function downloadSnapshot(
  cfg: ClientConfig,
  savePath: string,
  etag?: string
): Promise<any> {
  const { createWriteStream } = await import("node:fs");
  const { mkdir, stat } = await import("node:fs/promises");
  const { dirname } = await import("node:path");
  const { pipeline } = await import("node:stream/promises");
  const { Readable } = await import("node:stream");
  const { createGzip } = await import("node:zlib");

  const gzipOut = savePath.endsWith(".gz");
  await mkdir(dirname(savePath), { recursive: true });

  if (cfg.mock) {
    const body = JSON.stringify({
      data: { eventMarkets: [{ id: "mock", source: "prizepicks", league: "mlb" }] },
      _mock: true,
    });
    const src = Readable.from([body]);
    const out = createWriteStream(savePath);
    await (gzipOut ? pipeline(src, createGzip(), out) : pipeline(src, out));
    const { size } = await stat(savePath);
    return { success: true, saved: savePath, bytes: size, etag: 'W/"mock"', gzip: gzipOut, _mock: true };
  }

  const headers: Record<string, string> = { "User-Agent": USER_AGENT };
  if (cfg.apiKey) headers["X-Api-Key"] = cfg.apiKey;
  if (etag) headers["If-None-Match"] = etag;

  let res: Response;
  try {
    res = await fetch(cfg.baseUrl + "/api/v1/snapshot", { headers });
  } catch (e: any) {
    throw new SportWizzardError(`Network error downloading snapshot: ${e?.message ?? e}`);
  }
  if (res.status === 304) {
    return { success: true, not_modified: true, etag, note: "Board unchanged since this etag — nothing downloaded." };
  }
  if (res.status === 204 || !res.body) {
    return { success: true, saved: null, note: "Snapshot not built yet (server warming up) — retry in ~1 minute." };
  }
  if (!res.ok) {
    throw new SportWizzardError(`SportWizzard API ${res.status} on /api/v1/snapshot`, res.status);
  }

  const src = Readable.fromWeb(res.body as any);
  const out = createWriteStream(savePath);
  await (gzipOut ? pipeline(src, createGzip(), out) : pipeline(src, out));

  const { size } = await stat(savePath);
  return {
    success: true,
    saved: savePath,
    bytes: size,
    gzip: gzipOut,
    etag: res.headers.get("etag"),
    note: "Pass this etag next time to skip the download when the board is unchanged.",
  };
}
