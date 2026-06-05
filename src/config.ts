import type { Request } from "express";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

export const config = {
  ynabClientId: required("YNAB_CLIENT_ID"),
  ynabClientSecret: required("YNAB_CLIENT_SECRET"),
  tableName: required("TABLE_NAME"),
  awsRegion: process.env.AWS_REGION ?? "us-east-1",
};

export function publicUrl(req: Request): string {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? req.protocol;
  const host = req.get("host");
  return `${proto}://${host}`;
}

export const YNAB_AUTH_URL = "https://app.ynab.com/oauth/authorize";
export const YNAB_TOKEN_URL = "https://app.ynab.com/oauth/token";
export const YNAB_API_BASE = "https://api.ynab.com/v1";

// Token lifetimes (seconds).
// Access tokens stay short-lived; the client silently swaps them for new ones
// using its refresh token, so the user never has to sign in again as long as
// the refresh token (and the underlying YNAB grant) stay alive.
export const ACCESS_TOKEN_TTL = 60 * 60; // 1 hour
export const REFRESH_TOKEN_TTL = 60 * 24 * 60 * 60; // 60 days
// A session holds the YNAB tokens; keep it alive as long as a refresh token can
// be redeemed. Each refresh bumps the TTL, so an actively used connection
// effectively never expires.
export const SESSION_TTL = REFRESH_TOKEN_TTL;
// Refresh the YNAB access token this many seconds before it actually expires.
export const YNAB_REFRESH_BUFFER = 5 * 60; // 5 minutes
