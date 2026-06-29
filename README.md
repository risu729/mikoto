# mikoto

`mikoto` is an early-stage local MCP gateway for using ChatGPT with explicitly
configured local MCP servers through a Cloudflare relay.

The MVP goal is a general-purpose, read-only Codex browser read tool. ChatGPT
should be able to ask for structured information from an allowed local browser
context through bounded Codex CLI tasks and the official `@Chrome` integration,
without direct browser control, raw HTML/DOM access, cookies, storage, tokens,
or raw Codex internals.

## Status

This repository has an early local development path for the relay, bridge, and
Codex MCP server. The public deployment path is still incomplete.

## Packages

- `packages/relay`: Cloudflare Worker and Durable Object relay.
- `packages/bridge`: local bridge that connects outbound to the relay.
- `packages/codex-mcp`: standalone Codex MCP backend.
- `packages/protocol`: shared schemas and protocol types.
- `packages/docs`: Starlight documentation site.

## Architecture

The ChatGPT-facing MCP endpoint uses Streamable HTTP. The bridge connects
outbound to the relay over WebSocket. Configured local MCP servers sit behind
the bridge.

```mermaid
flowchart TD
  ChatGPT[ChatGPT App] -->|MCP over HTTP| Access[Cloudflare Access OAuth]
  Access --> Worker[Cloudflare Worker relay]
  Worker --> DO[Durable Object bridge/session coordinator]
  Bridge[mikoto bridge] -->|outbound WebSocket| DO
  Bridge --> CodexMCP[mikoto-codex-mcp]
  CodexMCP --> Codex[codex exec]
  Codex --> Chrome[official @Chrome]
  Bridge --> OtherMCP[other configured local MCP servers]
```

## Quick Start

Local prerequisites:

- Bun
- mise
- Wrangler, provided through mise
- Codex CLI available through `mise x codex@latest -- codex ...` for Codex
  backend tasks

Install dependencies:

```sh
mise trust
mise install
bun install --frozen-lockfile
```

Create a local config:

```sh
cp mikoto.example.toml mikoto.toml
```

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

Inspect connected bridges through the local MCP endpoint:

```sh
curl -s http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "mikoto_list_bridges",
      "arguments": {}
    }
  }'
```

## Documentation

Run the Starlight docs site locally:

```sh
mise run docs:dev
```

The docs source lives in `packages/docs`.

## Testing

Project commands are exposed as mise tasks:

```sh
mise run check --lint
mise run test
mise run test:relay
mise run docs:build
```
