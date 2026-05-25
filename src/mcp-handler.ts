import type { Request, Response } from "express";
import * as ynab from "ynab";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { registerTools } from "./tools.js";
import { getToken } from "./storage.js";
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
  const record = await getToken(token);
  if (!record) {
    sendAuthChallenge(req, res);
    return;
  }

  const server = buildServer(record.ynabAccessToken);
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
