import type { Request, Response } from "express";
import * as ynab from "ynab";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";
import { getAccessToken, getSession } from "./storage.js";
import { getValidYnabAccessToken, YnabRefreshError } from "./ynab-token.js";
import { publicUrl } from "./config.js";

function buildServer(ynabToken: string): McpServer {
  const server = new McpServer({
    name: "ynab-mcp",
    title: "YNAB",
    version: "0.1.0",
    websiteUrl: "https://www.ynab.com",
    icons: [
      {
        src: "https://app.ynab.com/apple-touch-icon.png",
        mimeType: "image/png",
        sizes: ["180x180"],
      },
    ],
  });
  const api = new ynab.API(ynabToken);
  registerTools(server, api);
  return server;
}

function sendAuthChallenge(req: Request, res: Response): void {
  const resourceMetadataUrl = `${publicUrl(req)}/.well-known/oauth-protected-resource`;
  res
    .status(401)
    .set(
      "WWW-Authenticate",
      `Bearer realm="ynab-mcp", resource_metadata="${resourceMetadataUrl}"`
    )
    .json({ error: "unauthorized" });
}

export async function handleMcpRequest(req: Request, res: Response): Promise<void> {
  const auth = req.header("authorization");
  if (!auth?.toLowerCase().startsWith("bearer ")) {
    sendAuthChallenge(req, res);
    return;
  }
  const token = auth.slice(7).trim();
  const accessRecord = await getAccessToken(token);
  if (!accessRecord) {
    sendAuthChallenge(req, res);
    return;
  }
  const session = await getSession(accessRecord.sessionId);
  if (!session) {
    sendAuthChallenge(req, res);
    return;
  }

  // Transparently refresh the YNAB token if it's expiring, so even a still-valid
  // access token never hits YNAB with a stale credential.
  let ynabAccessToken: string;
  try {
    ynabAccessToken = await getValidYnabAccessToken(session);
  } catch (err) {
    if (err instanceof YnabRefreshError) {
      sendAuthChallenge(req, res);
      return;
    }
    throw err;
  }

  const server = buildServer(ynabAccessToken);
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
