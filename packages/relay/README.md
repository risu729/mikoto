# @mikoto/relay

Cloudflare Worker relay scaffold.

The relay exposes the ChatGPT-facing Streamable HTTP MCP endpoint and accepts
outbound bridge WebSocket connections through a Durable Object. Connected bridge
tools are exposed as relay MCP tools using their configured backend-prefixed
names.

## Local Development

Run the relay locally with Wrangler:

```sh
mise run relay:dev
```

The local bridge WebSocket endpoint is `ws://localhost:8787/bridge`. The MCP
endpoint is `/mcp`; it exposes `mikoto_list_bridges` plus tools announced by
connected bridges, such as `codex.codex_check`.
