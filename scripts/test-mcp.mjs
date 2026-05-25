#!/usr/bin/env node
// Direct end-to-end test of the deployed /mcp endpoint.
// Inserts a cryptographically random bearer token into DynamoDB mapped to the
// user's YNAB_TOKEN, then POSTs an MCP initialize request and prints the
// response. Cleans up the token after.

import { randomBytes } from "node:crypto";
import {
  DynamoDBClient,
} from "@aws-sdk/client-dynamodb";
import {
  DynamoDBDocumentClient,
  PutCommand,
  DeleteCommand,
} from "@aws-sdk/lib-dynamodb";

const apiUrl = process.argv[2];
if (!apiUrl) {
  console.error("usage: test-mcp.mjs <api-url>");
  process.exit(1);
}
const tableName = process.env.TABLE_NAME;
const ynabToken = process.env.YNAB_TOKEN;
if (!tableName || !ynabToken) {
  console.error("set TABLE_NAME and YNAB_TOKEN env vars");
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const token = randomBytes(32).toString("base64url");
const ttl = Math.floor(Date.now() / 1000) + 600;
const pk = `token#${token}`;

await ddb.send(
  new PutCommand({
    TableName: tableName,
    Item: {
      pk,
      token,
      ynabAccessToken: ynabToken,
      ynabRefreshToken: "",
      ynabExpiresAt: ttl,
      ttl,
    },
  })
);
console.log("seeded token (prefix=%s...)", token.slice(0, 8));

try {
  async function call(body) {
    const res = await fetch(`${apiUrl}/mcp`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    return { status: res.status, text };
  }

  console.log("\n--- initialize ---");
  let r = await call({
    jsonrpc: "2.0",
    method: "initialize",
    id: 1,
    params: {
      protocolVersion: "2025-03-26",
      clientInfo: { name: "test-mcp", version: "0.0.1" },
      capabilities: {},
    },
  });
  console.log("status:", r.status);
  console.log(r.text.slice(0, 300));

  console.log("\n--- tools/list ---");
  r = await call({ jsonrpc: "2.0", method: "tools/list", id: 2 });
  console.log("status:", r.status);
  console.log(r.text.slice(0, 600));

  console.log("\n--- tools/call list_budgets ---");
  r = await call({
    jsonrpc: "2.0",
    method: "tools/call",
    id: 3,
    params: { name: "list_budgets", arguments: {} },
  });
  console.log("status:", r.status);
  console.log(r.text.slice(0, 1200));
} finally {
  await ddb.send(new DeleteCommand({ TableName: tableName, Key: { pk } }));
  console.log("token deleted");
}
