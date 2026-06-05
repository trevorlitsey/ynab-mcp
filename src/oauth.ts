import express, { type Request, type Response, type Router } from "express";
import crypto from "node:crypto";
import {
  YNAB_AUTH_URL,
  YNAB_TOKEN_URL,
  config,
  publicUrl,
  ACCESS_TOKEN_TTL,
  REFRESH_TOKEN_TTL,
  SESSION_TTL,
} from "./config.js";
import {
  saveClient,
  getClient,
  saveCode,
  consumeCode,
  saveSession,
  getSession,
  saveAccessToken,
  saveRefreshToken,
  consumeRefreshToken,
} from "./storage.js";
import { getValidYnabAccessToken, YnabRefreshError } from "./ynab-token.js";

const TEN_MINUTES = 10 * 60;

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

export function oauthRouter(): Router {
  const router = express.Router();

  router.get("/.well-known/oauth-protected-resource", (req, res) => {
    const url = publicUrl(req);
    res.json({
      resource: url,
      authorization_servers: [url],
      bearer_methods_supported: ["header"],
    });
  });

  router.get("/.well-known/oauth-authorization-server", (req, res) => {
    const url = publicUrl(req);
    res.json({
      issuer: url,
      authorization_endpoint: `${url}/authorize`,
      token_endpoint: `${url}/token`,
      registration_endpoint: `${url}/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
    });
  });

  router.post("/register", express.json(), async (req, res) => {
    const body = req.body ?? {};
    const redirectUris: unknown = body.redirect_uris;
    if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
      res.status(400).json({ error: "invalid_redirect_uri" });
      return;
    }
    const clientId = randomToken(16);
    await saveClient({
      clientId,
      clientName: typeof body.client_name === "string" ? body.client_name : "unnamed",
      redirectUris: redirectUris as string[],
      createdAt: nowSeconds(),
    });
    res.status(201).json({
      client_id: clientId,
      client_id_issued_at: nowSeconds(),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    });
  });

  router.get("/authorize", async (req, res) => {
    const {
      client_id,
      redirect_uri,
      response_type,
      code_challenge,
      code_challenge_method,
      state,
    } = req.query as Record<string, string>;

    if (response_type !== "code") {
      res.status(400).send("response_type must be 'code'");
      return;
    }
    if (!code_challenge || code_challenge_method !== "S256") {
      res.status(400).send("PKCE (S256) required");
      return;
    }
    const client = await getClient(client_id);
    if (!client) {
      res.status(400).send("unknown client");
      return;
    }
    if (!client.redirectUris.includes(redirect_uri)) {
      res.status(400).send("redirect_uri not registered");
      return;
    }

    const ynabState = randomToken(16);
    const ynabRedirectUri = `${publicUrl(req)}/callback`;
    res.cookie(
      "pending_auth",
      JSON.stringify({
        ynabState,
        clientId: client_id,
        redirectUri: redirect_uri,
        codeChallenge: code_challenge,
        codeChallengeMethod: code_challenge_method,
        clientState: state ?? null,
      }),
      { httpOnly: true, secure: true, sameSite: "lax", maxAge: TEN_MINUTES * 1000 }
    );

    const url = new URL(YNAB_AUTH_URL);
    url.searchParams.set("client_id", config.ynabClientId);
    url.searchParams.set("redirect_uri", ynabRedirectUri);
    url.searchParams.set("response_type", "code");
    // Full (read/write) access — required for update_transaction.
    // (Omitting the scope param requests YNAB's default read/write scope.)
    url.searchParams.set("state", ynabState);
    res.redirect(url.toString());
  });

  router.get("/callback", async (req: Request, res: Response) => {
    const cookie = req.cookies?.pending_auth as string | undefined;
    if (!cookie) {
      res.status(400).send("missing pending auth cookie");
      return;
    }
    const pending = JSON.parse(cookie) as {
      ynabState: string;
      clientId: string;
      redirectUri: string;
      codeChallenge: string;
      codeChallengeMethod: string;
      clientState: string | null;
    };

    const { code, state } = req.query as Record<string, string>;
    if (state !== pending.ynabState) {
      res.status(400).send("state mismatch");
      return;
    }
    if (!code) {
      res.status(400).send("missing code");
      return;
    }

    const ynabRedirectUri = `${publicUrl(req)}/callback`;
    const tokenResp = await fetch(YNAB_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: config.ynabClientId,
        client_secret: config.ynabClientSecret,
        redirect_uri: ynabRedirectUri,
        grant_type: "authorization_code",
        code,
      }),
    });
    if (!tokenResp.ok) {
      const text = await tokenResp.text();
      res.status(502).send(`YNAB token exchange failed: ${text}`);
      return;
    }
    const ynabToken = (await tokenResp.json()) as {
      access_token: string;
      refresh_token: string;
      expires_in: number;
    };

    const ourCode = randomToken();
    const ynabExpiresAt = nowSeconds() + ynabToken.expires_in;
    await saveCode({
      code: ourCode,
      clientId: pending.clientId,
      redirectUri: pending.redirectUri,
      codeChallenge: pending.codeChallenge,
      codeChallengeMethod: pending.codeChallengeMethod,
      ynabAccessToken: ynabToken.access_token,
      ynabRefreshToken: ynabToken.refresh_token,
      ynabExpiresAt,
      ttl: nowSeconds() + TEN_MINUTES,
    });
    res.clearCookie("pending_auth");

    const redirect = new URL(pending.redirectUri);
    redirect.searchParams.set("code", ourCode);
    if (pending.clientState) {
      redirect.searchParams.set("state", pending.clientState);
    }
    res.redirect(redirect.toString());
  });

  // Issues a fresh access/refresh token pair bound to a session and responds
  // with the standard OAuth token payload.
  async function issueTokens(
    res: Response,
    sessionId: string,
    clientId: string
  ): Promise<void> {
    const accessToken = randomToken();
    const refreshToken = randomToken();
    await saveAccessToken({
      token: accessToken,
      sessionId,
      ttl: nowSeconds() + ACCESS_TOKEN_TTL,
    });
    await saveRefreshToken({
      token: refreshToken,
      sessionId,
      clientId,
      ttl: nowSeconds() + REFRESH_TOKEN_TTL,
    });
    res.json({
      access_token: accessToken,
      token_type: "Bearer",
      expires_in: ACCESS_TOKEN_TTL,
      refresh_token: refreshToken,
    });
  }

  async function handleAuthorizationCode(
    req: Request,
    res: Response
  ): Promise<void> {
    const { code, code_verifier, client_id, redirect_uri } = (req.body ??
      {}) as Record<string, string>;
    if (!code || !code_verifier) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    const record = await consumeCode(code);
    if (!record) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    if (record.clientId !== client_id) {
      res.status(400).json({ error: "invalid_client" });
      return;
    }
    if (record.redirectUri !== redirect_uri) {
      res
        .status(400)
        .json({ error: "invalid_grant", description: "redirect mismatch" });
      return;
    }
    const expectedChallenge = crypto
      .createHash("sha256")
      .update(code_verifier)
      .digest("base64url");
    if (expectedChallenge !== record.codeChallenge) {
      res
        .status(400)
        .json({ error: "invalid_grant", description: "PKCE failed" });
      return;
    }

    const sessionId = randomToken(16);
    await saveSession({
      sessionId,
      ynabAccessToken: record.ynabAccessToken,
      ynabRefreshToken: record.ynabRefreshToken,
      ynabExpiresAt: record.ynabExpiresAt,
      ttl: nowSeconds() + SESSION_TTL,
    });
    await issueTokens(res, sessionId, record.clientId);
  }

  async function handleRefreshToken(
    req: Request,
    res: Response
  ): Promise<void> {
    const { refresh_token, client_id } = (req.body ?? {}) as Record<
      string,
      string
    >;
    if (!refresh_token) {
      res.status(400).json({ error: "invalid_request" });
      return;
    }
    // Single-use: the old refresh token is consumed and a new one is minted.
    const record = await consumeRefreshToken(refresh_token);
    if (!record) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    if (client_id && record.clientId !== client_id) {
      res.status(400).json({ error: "invalid_client" });
      return;
    }
    const session = await getSession(record.sessionId);
    if (!session) {
      res.status(400).json({ error: "invalid_grant" });
      return;
    }
    // Renew the underlying YNAB grant now so the new access token is usable for
    // its full lifetime. If YNAB has revoked us, the client must re-authorize.
    try {
      await getValidYnabAccessToken(session);
    } catch (err) {
      if (err instanceof YnabRefreshError) {
        res.status(400).json({ error: "invalid_grant" });
        return;
      }
      throw err;
    }
    await issueTokens(res, session.sessionId, record.clientId);
  }

  router.post(
    "/token",
    express.urlencoded({ extended: false }),
    async (req, res) => {
      const { grant_type } = (req.body ?? {}) as Record<string, string>;
      if (grant_type === "authorization_code") {
        await handleAuthorizationCode(req, res);
        return;
      }
      if (grant_type === "refresh_token") {
        await handleRefreshToken(req, res);
        return;
      }
      res.status(400).json({ error: "unsupported_grant_type" });
    }
  );

  return router;
}
