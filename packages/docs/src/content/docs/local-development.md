---
description: Run and inspect the relay, bridge, and local tools.
title: Local Development
---

Run the local relay in one shell:

```sh
mise run relay:dev
```

Wrangler serves the local Worker at `http://localhost:8787`. The ChatGPT-facing
MCP endpoint is `http://localhost:8787/mcp`, and the bridge WebSocket endpoint
is `ws://localhost:8787/bridge`.

Run the bridge in another shell:

```sh
mise run bridge
```

The bridge loads `mikoto.toml`, starts configured stdio backend MCP servers
eagerly, discovers their tools, connects outbound to the relay, and sends a
static tool snapshot. If the relay connection is lost, the bridge exits for the
MVP.

## Inspect Tools

Inspect the ChatGPT-facing tool list:

```sh
curl -s http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  --data '{"jsonrpc":"2.0","id":2,"method":"tools/list","params":{}}'
```

The relay exposes `mikoto_list_bridges` plus tools announced by connected
bridges. Local backend tools keep their backend-prefixed names, for example
`codex.codex_check`, `codex.codex_task`, and `codex.codex_chrome_read`.

If one connected bridge exposes a tool, callers can omit bridge selection. If
multiple bridges expose the same tool, callers must select one with MCP request
`_meta["mikoto/bridgeId"]`.

## Testing

Use Vitest for repository tests:

```sh
mise run test
```

For Cloudflare Worker relay tests, use the relay test task:

```sh
mise run test:relay
```

Project commands are exposed as mise tasks. Avoid browser and Codex
end-to-end tests until the skeleton protocol and routing behavior are stable.
