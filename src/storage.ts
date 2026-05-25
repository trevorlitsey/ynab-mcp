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

export type TokenRecord = {
  pk: string;
  token: string;
  ynabAccessToken: string;
  ynabRefreshToken: string;
  ynabExpiresAt: number;
  ttl: number;
};

const CLIENT_PREFIX = "client#";
const CODE_PREFIX = "code#";
const TOKEN_PREFIX = "token#";

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

export async function saveToken(record: Omit<TokenRecord, "pk">): Promise<void> {
  await client.send(
    new PutCommand({
      TableName: config.tableName,
      Item: { ...record, pk: TOKEN_PREFIX + record.token },
    })
  );
}

export async function getToken(token: string): Promise<TokenRecord | null> {
  const result = await client.send(
    new GetCommand({
      TableName: config.tableName,
      Key: { pk: TOKEN_PREFIX + token },
    })
  );
  return (result.Item as TokenRecord) ?? null;
}
