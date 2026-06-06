# ynab-mcp

A remote [Model Context Protocol](https://modelcontextprotocol.io) server for [YNAB](https://www.ynab.com) (You Need A Budget), deployable to AWS Lambda. Supports the [OAuth 2.1 authorization flow](https://modelcontextprotocol.io/specification/draft/basic/authorization) required by claude.ai's custom connectors — each user signs in with their own YNAB account.

## Tools

Read:

- `list_budgets`, `get_budget`
- `list_accounts`, `get_account`
- `list_categories`, `get_category`
- `list_payees`
- `list_transactions` (filterable by account / category / payee / since_date / type), `get_transaction`
- `list_scheduled_transactions`
- `list_months`, `get_month`
- `get_user`

Write:

- `update_transaction` — edit a transaction's `memo`, `category_id`, and/or `flag_color` (pass `category_id: null` to uncategorize; `flag_color: null` to remove the flag; valid colors: red, orange, yellow, green, blue, purple)

> **Note:** Because of the write tool, the server now requests YNAB's full (read/write) OAuth scope rather than read-only. Existing connections will need to re-authorize to grant write access.

## Architecture

- TypeScript Express app, bundled by AWS CDK with esbuild
- AWS Lambda + Function URL (no API Gateway)
- DynamoDB single table for OAuth state (auth codes, sessions, access + refresh tokens, TTL-evicted)
- Acts as an OAuth authorization server for MCP clients; delegates identity to YNAB's own OAuth
- Issues short-lived access tokens plus rotating refresh tokens, so clients silently renew access in the background; the underlying YNAB token is transparently refreshed before it expires, keeping a connection alive without re-authorizing

## Deployment

### 1. Register a YNAB OAuth application

1. Go to https://app.ynab.com/settings/developer
2. Create a new OAuth application
3. Set the redirect URI to a placeholder (e.g. `https://example.com/callback`) — you'll update this after step 3
4. Save the `Client ID` and `Client Secret`

### 2. Deploy the Lambda

```sh
npm install
export AWS_PROFILE=mcp                  # or whatever profile you use
export YNAB_CLIENT_ID=...               # from step 1
export YNAB_CLIENT_SECRET=...           # from step 1
npx cdk bootstrap                       # one-time per account/region
npm run deploy
```

Outputs will include `FunctionUrl` and `CallbackUrl`.

### 3. Update YNAB redirect URI

Go back to your YNAB OAuth app and set the redirect URI to the `CallbackUrl` from the deploy output (e.g. `https://abc123.lambda-url.us-east-1.on.aws/callback`).

### 4. Add to claude.ai

In claude.ai → Settings → Connectors → Add custom connector:
- **Name:** YNAB
- **Remote MCP server URL:** the `FunctionUrl` from the deploy output, with `/mcp` appended (e.g. `https://abc123.lambda-url.us-east-1.on.aws/mcp`)
- Leave OAuth Client ID/Secret empty — the server supports dynamic client registration.

Connect, sign in with YNAB when prompted, done.

## Local development

```sh
YNAB_CLIENT_ID=... \
YNAB_CLIENT_SECRET=... \
TABLE_NAME=ynab-mcp-dev \
AWS_REGION=us-east-1 \
npm run dev
```

You'll need a local-accessible DynamoDB table (or point at a real one). For testing OAuth flow, you also need a tunneled public URL (e.g. ngrok) and to register that with your YNAB OAuth app.

## License

MIT
