import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";
import { config } from "./config.js";

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: config.awsRegion })
);

export type ClientRecord = {
  pk: string;
  clientId: string;
  clientName: string;
  redirectUris: string[];
  createdAt: number;
};

export type CodeRecord = {
  pk: string;
  code: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  ynabAccessToken: string;
  ynabRefreshToken: string;
  ynabExpiresAt: number;
  ttl: number;
};

// The in-flight authorization request, saved when we redirect the user to YNAB
// and consumed when YNAB redirects back to /callback. Keyed by the random
// `state` value we hand to YNAB (and which YNAB echoes back), so we can recover
// it without depending on a browser cookie surviving the cross-site redirect —
// cookies are routinely dropped by Safari/iOS ITP and in-app OAuth webviews,
// which would otherwise break the connection at the callback.
export type PendingAuthRecord = {
  pk: string;
  state: string;
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  clientState: string | null;
  ttl: number;
};

// A session owns the YNAB tokens for one authorized connection. Access tokens
// and refresh tokens reference it by id, so refreshing the YNAB token (which
// rotates both YNAB tokens) only has to update this one record.
export type SessionRecord = {
  pk: string;
  sessionId: string;
  ynabAccessToken: string;
  ynabRefreshToken: string;
  ynabExpiresAt: number;
  ttl: number;
};

export type AccessTokenRecord = {
  pk: string;
  token: string;
  sessionId: string;
  ttl: number;
};

export type RefreshTokenRecord = {
  pk: string;
  token: string;
  sessionId: string;
  clientId: string;
  ttl: number;
};

const CLIENT_PREFIX = "client#";
const CODE_PREFIX = "code#";
const PENDING_PREFIX = "pending#";
const SESSION_PREFIX = "session#";
const TOKEN_PREFIX = "token#";
const REFRESH_PREFIX = "refresh#";

export async function saveClient(record: Omit<ClientRecord, "pk">): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { ...record, pk: CLIENT_PREFIX + record.clientId },
    })
  );
}

export async function getClient(clientId: string): Promise<ClientRecord | null> {
  const result = await client.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { pk: CLIENT_PREFIX + clientId },
    })
  );
  return (result.Item as ClientRecord) ?? null;
}

export async function savePendingAuth(
  record: Omit<PendingAuthRecord, "pk">
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { ...record, pk: PENDING_PREFIX + record.state },
    })
  );
}

// Single-use: read and delete the pending authorization in one step so a given
// `state` can only complete the flow once.
export async function consumePendingAuth(
  state: string
): Promise<PendingAuthRecord | null> {
  const result = await client.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { pk: PENDING_PREFIX + state },
    })
  );
  if (!result.Item) return null;
  await client.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { pk: PENDING_PREFIX + state },
    })
  );
  return result.Item as PendingAuthRecord;
}

export async function saveCode(record: Omit<CodeRecord, "pk">): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { ...record, pk: CODE_PREFIX + record.code },
    })
  );
}

export async function consumeCode(code: string): Promise<CodeRecord | null> {
  const result = await client.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { pk: CODE_PREFIX + code },
    })
  );
  if (!result.Item) return null;
  await client.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { pk: CODE_PREFIX + code },
    })
  );
  return result.Item as CodeRecord;
}

export async function saveSession(
  record: Omit<SessionRecord, "pk">
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { ...record, pk: SESSION_PREFIX + record.sessionId },
    })
  );
}

export async function getSession(
  sessionId: string
): Promise<SessionRecord | null> {
  const result = await client.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { pk: SESSION_PREFIX + sessionId },
    })
  );
  return (result.Item as SessionRecord) ?? null;
}

export async function saveAccessToken(
  record: Omit<AccessTokenRecord, "pk">
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { ...record, pk: TOKEN_PREFIX + record.token },
    })
  );
}

export async function getAccessToken(
  token: string
): Promise<AccessTokenRecord | null> {
  const result = await client.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { pk: TOKEN_PREFIX + token },
    })
  );
  return (result.Item as AccessTokenRecord) ?? null;
}

export async function saveRefreshToken(
  record: Omit<RefreshTokenRecord, "pk">
): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { ...record, pk: REFRESH_PREFIX + record.token },
    })
  );
}

// Reads and deletes a refresh token in one step: refresh tokens are single-use
// (rotated on every refresh) to limit the blast radius of a leaked token.
export async function consumeRefreshToken(
  token: string
): Promise<RefreshTokenRecord | null> {
  const result = await client.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { pk: REFRESH_PREFIX + token },
    })
  );
  if (!result.Item) return null;
  await client.send(
    new DeleteCommand({
      TableName: config.tableName,
      Key: { pk: REFRESH_PREFIX + token },
    })
  );
  return result.Item as RefreshTokenRecord;
}
