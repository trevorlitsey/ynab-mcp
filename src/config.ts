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
