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
      const accept = (req.headers.accept ?? "").toLowerCase();
      const needsJson = !accept.includes("application/json");
      const needsSse = !accept.includes("text/event-stream");
      if (needsJson || needsSse) {
        const parts = [accept, needsJson ? "application/json" : null, needsSse ? "text/event-stream" : null]
          .filter(Boolean)
          .join(", ");
        req.headers.accept = parts;
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
