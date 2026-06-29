# @mikoto/relay

Cloudflare Worker relay scaffold.

The relay exposes the ChatGPT-facing Streamable HTTP MCP endpoint and accepts
outbound bridge WebSocket connections through a Durable Object. The current
scaffold includes health checks, bridge WebSocket registration, and Durable
Object metadata storage.

## Local Development

Run the relay locally with Wrangler:

```sh
mise run relay:dev
```

The local bridge WebSocket endpoint is `ws://localhost:8787/bridge`. The MVP MCP
endpoint is `/mcp` and currently exposes `mikoto_list_bridges`.
