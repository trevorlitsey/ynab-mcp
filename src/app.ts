import express from "express";
import cookieParser from "cookie-parser";
import { oauthRouter } from "./oauth.js";
import { handleMcpRequest } from "./mcp-handler.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cookieParser());
  app.use(oauthRouter());
  app.post("/mcp", express.json(), handleMcpRequest);
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
