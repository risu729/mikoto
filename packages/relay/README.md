# @mikoto/relay

Cloudflare Worker relay.

The relay exposes the ChatGPT-facing Streamable HTTP MCP endpoint and accepts
outbound bridge WebSocket connections through a Durable Object. Connected bridge
tools are exposed as relay MCP tools using their configured backend-prefixed
names.

## Local Development

Run the relay locally with Wrangler:

```sh
mise //packages/relay:dev
```

The local bridge WebSocket endpoint is `ws://localhost:8787/bridge`. The MCP
endpoint is `/mcp`; it exposes `mikoto_list_bridges` plus tools announced by
connected bridges, such as `codex.codex_chrome_read`.

Inspect tools locally:

```sh
curl -s http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  --data '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
```

See the root README for the full relay + bridge local development flow.

## Deployment

The production relay is deployed by GitHub Actions with Wrangler through mise.
The production environment in `wrangler.jsonc` routes
`mcp.mikoto.takuk.me` to the relay Worker and applies the relay Durable Object
binding and migrations.

Validate the production deploy config without deploying:

```sh
mise //packages/relay:deploy:production -- --dry-run
```

Deploy to production:

```sh
mise //packages/relay:deploy:production
```

Use GitHub Actions for production deployments. Local Wrangler deploy commands
are intended only for explicit operator checks.
