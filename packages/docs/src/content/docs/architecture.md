---
description: Relay, bridge, and backend MCP server responsibilities.
title: Architecture
---

`mikoto` is split into separate programs and packages:

- `relay`: Cloudflare Worker and Durable Object relay for the ChatGPT-facing MCP
  endpoint.
- `mikoto bridge`: local router that connects outbound to the relay and routes
  calls to configured backend MCP servers.
- `mikoto-codex-mcp`: standalone MCP server that owns a local Codex app-server
  process and bounded Codex tool execution.
- `protocol`: shared schemas, relay and bridge messages, and config validation.

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
  CodexMCP --> Codex[codex app-server]
  Codex --> Chrome[official @Chrome]
  Bridge --> OtherMCP[other configured local MCP servers]
```

## Bridge Metadata

The relay exposes `mikoto_list_bridges` so ChatGPT can inspect safe bridge and
tool metadata before selecting a local target.

```mermaid
sequenceDiagram
  participant ChatGPT as ChatGPT App
  participant Worker as Relay Worker
  participant DO as Relay Durable Object

  ChatGPT->>Worker: call mikoto_list_bridges
  Worker->>DO: handle bridge listing
  DO->>DO: read bridge metadata
  DO-->>Worker: bridges {id, os, status, lastHeartbeat, tools}
  Worker-->>ChatGPT: mikoto_list_bridges result
```

The relay returns only safe metadata: bridge id, bridge OS, status, last
heartbeat time, and exposed tool names. It must not return secrets, local paths,
environment variables, raw backend config, raw tool arguments, or tool results.

## Component Details

- [Relay](/parts/relay/) owns remote MCP routing and Durable Object session
  coordination.
- [Bridge](/parts/bridge/) owns local backend startup, discovery, and routing.
- [Codex MCP](/parts/codex-mcp/) owns Codex app-server execution and
  backend-specific read-only browser policy.
