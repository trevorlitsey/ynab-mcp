import {
  YNAB_TOKEN_URL,
  config,
  SESSION_TTL,
  YNAB_REFRESH_BUFFER,
} from "./config.js";
import { saveSession, type SessionRecord } from "./storage.js";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

// Thrown when YNAB rejects our refresh token (revoked / expired). The caller
// should treat this as "needs re-authorization" and send an auth challenge.
export class YnabRefreshError extends Error {}

/**
 * Returns a YNAB access token that is valid right now, transparently refreshing
 * it (and persisting the rotated tokens) when it's at or near expiry. This is
 * what keeps a connection alive without the user signing in again: as long as
 * the session is used before its refresh token is revoked, the YNAB grant is
 * continually renewed in the background.
 */
export async function getValidYnabAccessToken(
  session: SessionRecord
): Promise<string> {
  if (session.ynabExpiresAt - YNAB_REFRESH_BUFFER > nowSeconds()) {
    return session.ynabAccessToken;
  }
  return refreshYnabToken(session);
}

/**
 * Exchanges the session's YNAB refresh token for a fresh access/refresh pair,
 * mutates `session` in place, and persists it (bumping the session TTL so an
 * active connection never ages out).
 */
export async function refreshYnabToken(
  session: SessionRecord
): Promise<string> {
  const resp = await fetch(YNAB_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: config.ynabClientId,
      client_secret: config.ynabClientSecret,
      grant_type: "refresh_token",
      refresh_token: session.ynabRefreshToken,
    }),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new YnabRefreshError(`YNAB token refresh failed: ${text}`);
  }
  const token = (await resp.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };

  // YNAB rotates the refresh token on every refresh, so persist the new one.
  session.ynabAccessToken = token.access_token;
  session.ynabRefreshToken = token.refresh_token;
  session.ynabExpiresAt = nowSeconds() + token.expires_in;
  session.ttl = nowSeconds() + SESSION_TTL;
  await saveSession(session);

  return token.access_token;
}
