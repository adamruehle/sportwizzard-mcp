// Bearer-key auth + a simple per-key rate-limit backstop for the remote
// (Streamable HTTP) transport.
//
// The public v1 REST API is currently `permitAll()` pre-billing, but Spring
// Boot's `ApiKeyRateLimitFilter` still runs on every `/api/v1/**` request and
// actively rejects a garbage `X-Api-Key` with 401 (it calls Clerk's real
// verify endpoint) — it only falls through to an open "anonymous" 200 when
// NO key is supplied at all. The MCP layer requires a key on every request
// (unlike the raw REST API), so we reuse that same distinction: validate the
// caller's bearer token against a cheap SB endpoint and reject up front if
// it's missing or invalid. This will need no changes once billing enforcement
// tightens the REST side further — we're already doing real verification.

import { DEFAULT_BASE_URL, USER_AGENT } from "./client.js";

const AUTH_CACHE_TTL_MS = Number(process.env.AUTH_CACHE_TTL_MS ?? 180_000); // 3 min
const RATE_LIMIT_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN ?? 60);

interface CacheEntry {
  valid: boolean;
  expiresAt: number;
}

const validationCache = new Map<string, CacheEntry>();
const rateLimitWindows = new Map<string, { count: number; windowStart: number }>();

export interface AuthResult {
  ok: boolean;
  status: number; // HTTP status to return on failure
  message: string;
}

/**
 * Validate a bearer token by calling SB's `/api/v1/account/usage` with it as
 * `X-Api-Key`. That endpoint reports `authenticated: true/false` explicitly
 * and — critically — SB's ApiKeyRateLimitFilter returns a hard 401 for a
 * garbage/expired key before the controller even runs. We treat either
 * "401" or "200 with authenticated:false" as invalid (the latter should not
 * happen when we always send a non-empty key, but fail closed if it does).
 * Result is cached briefly per exact token to avoid a live SB/Clerk round
 * trip on every single tool call.
 */
export async function validateApiKey(token: string, baseUrl: string): Promise<AuthResult> {
  if (!token) {
    return { ok: false, status: 401, message: "Missing API key. Send it as 'Authorization: Bearer <key>'." };
  }

  const cached = validationCache.get(token);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.valid
      ? { ok: true, status: 200, message: "" }
      : { ok: false, status: 401, message: "Invalid or expired API key." };
  }

  let valid: boolean;
  try {
    const res = await fetch((baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "") + "/api/v1/account/usage", {
      headers: { "X-Api-Key": token, Accept: "application/json", "User-Agent": USER_AGENT },
    });
    if (res.status === 401 || res.status === 403) {
      valid = false;
    } else if (res.ok) {
      const body: any = await res.json().catch(() => null);
      const row = Array.isArray(body?.data) ? body.data[0] : body?.data;
      valid = row?.authenticated === true;
    } else {
      // Upstream error (5xx etc.) — don't punish the caller for an SB hiccup,
      // but don't cache it either so we re-check promptly.
      return { ok: false, status: 502, message: `Could not verify API key (upstream ${res.status}).` };
    }
  } catch (e: any) {
    return { ok: false, status: 502, message: `Could not verify API key: ${e?.message ?? e}` };
  }

  validationCache.set(token, { valid, expiresAt: now + AUTH_CACHE_TTL_MS });
  return valid
    ? { ok: true, status: 200, message: "" }
    : { ok: false, status: 401, message: "Invalid or expired API key." };
}

/** Simple fixed-window per-key rate limit — a backstop, not the primary limiter (SB's Bucket4j is). */
export function checkRateLimit(token: string): AuthResult {
  const now = Date.now();
  const entry = rateLimitWindows.get(token);
  if (!entry || now - entry.windowStart >= 60_000) {
    rateLimitWindows.set(token, { count: 1, windowStart: now });
    return { ok: true, status: 200, message: "" };
  }
  entry.count += 1;
  if (entry.count > RATE_LIMIT_PER_MIN) {
    return {
      ok: false,
      status: 429,
      message: `Rate limit exceeded (${RATE_LIMIT_PER_MIN} requests/min per key). Try again shortly.`,
    };
  }
  return { ok: true, status: 200, message: "" };
}

export function extractBearerToken(authHeader: string | undefined): string | null {
  if (!authHeader) return null;
  const m = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
  return m ? m[1].trim() : null;
}
