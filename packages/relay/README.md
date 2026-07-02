# @mikoto/relay

Cloudflare Worker relay.

## Local Development

Run the relay locally with Wrangler:

```console
mise //packages/relay:dev
```

The local bridge WebSocket endpoint is `ws://localhost:8787/bridge`. The MCP
endpoint is `http://localhost:8787/mcp`.

See the root README for the full relay + bridge local development flow.

## Deployment

Use GitHub Actions for production deployments. Deployment behavior is documented
in the docs site.
