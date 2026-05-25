# ynab-mcp

A read-only remote [Model Context Protocol](https://modelcontextprotocol.io) server for [YNAB](https://www.ynab.com) (You Need A Budget), deployable to AWS Lambda. Supports the [OAuth 2.1 authorization flow](https://modelcontextprotocol.io/specification/draft/basic/authorization) required by claude.ai's custom connectors — each user signs in with their own YNAB account.

## Tools

All read-only:

- `list_budgets`, `get_budget`
- `list_accounts`, `get_account`
- `list_categories`, `get_category`
- `list_payees`
- `list_transactions` (filterable by account / category / payee / since_date / type), `get_transaction`
- `list_scheduled_transactions`
- `list_months`, `get_month`
- `get_user`

## Architecture

- TypeScript Express app, bundled by SAM with esbuild
- AWS Lambda + Function URL (no API Gateway)
- DynamoDB single table for OAuth state (auth codes + access tokens, TTL-evicted)
- Acts as an OAuth authorization server for MCP clients; delegates identity to YNAB's own OAuth

## Deployment

### 1. Register a YNAB OAuth application

1. Go to https://app.ynab.com/settings/developer
2. Create a new OAuth application
3. Set the redirect URI to a placeholder (e.g. `https://example.com/callback`) — you'll update this after step 3
4. Save the `Client ID` and `Client Secret`

### 2. Deploy the Lambda

```sh
npm install
npm run deploy:guided   # first time — answer prompts, paste YNAB client id/secret
```

When prompted:
- Stack name: `ynab-mcp`
- AWS Region: `us-east-1`
- `YnabClientId` / `YnabClientSecret`: from step 1
- Confirm changes / Save arguments: yes

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
