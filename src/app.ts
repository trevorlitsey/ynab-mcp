import express from "express";
import cookieParser from "cookie-parser";
import { oauthRouter } from "./oauth.js";
import { handleMcpRequest } from "./mcp-handler.js";

export function createApp(): express.Express {
  const app = express();
  app.use(cookieParser());
  app.use(oauthRouter());
  app.post(
    "/mcp",
    express.json(),
    (req, _res, next) => {
      // serverless-http doesn't populate req.rawHeaders, but @hono/node-server
      // (used by @modelcontextprotocol/sdk's StreamableHTTPServerTransport)
      // reads headers exclusively from rawHeaders. Rebuild it from req.headers.
      if (!req.rawHeaders || req.rawHeaders.length === 0) {
        const rebuilt: string[] = [];
        for (const [name, value] of Object.entries(req.headers)) {
          if (Array.isArray(value)) {
            for (const v of value) rebuilt.push(name, v);
          } else if (typeof value === "string") {
            rebuilt.push(name, value);
          }
        }
        req.rawHeaders = rebuilt;
      }
      next();
    },
    handleMcpRequest
  );
  app.get("/healthz", (_req, res) => {
    res.json({ ok: true });
  });
  return app;
}
