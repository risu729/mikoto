---
description: Relay Worker and Durable Object responsibilities.
title: Relay
---

The relay is a Cloudflare Worker backed by a Durable Object. It exposes the
ChatGPT-facing Streamable HTTP MCP endpoint and accepts outbound WebSocket
connections from local bridges.

## Responsibilities

The relay:

- handles Cloudflare Access-authenticated ChatGPT-facing requests;
- accepts bridge WebSocket connections;
- stores safe connected-bridge metadata in Durable Object state;
- exposes `mikoto_list_bridges`;
- routes tool calls to a selected bridge;
- rejects duplicate connected bridge ids;
- returns bridge-selection, ambiguity, busy, timeout, and connection-lost
  errors;
- writes application diagnostics to stdout.

The relay does not discover local MCP servers and does not know Codex execution
internals.

## Durable Object State

The Durable Object owns connected bridge session state. It stores only safe
metadata:

- bridge id;
- bridge OS;
- connection status;
- last heartbeat time;
- exposed tool snapshot;
- WebSocket/session data needed to restore hibernated connections.

It must not store secrets, local paths, environment variables, raw backend
config, cookies, storage, tokens, raw HTML, or tool result payloads in bridge
metadata.

## Routing

Backend tools are exposed with backend-prefixed names such as
`codex.codex_chrome_read`. Configured aliases may expose shorter names such as
`local_chrome_read`.

Tool names do not include bridge names. A caller may omit bridge selection only
when exactly one connected bridge exposes the requested tool. If multiple
bridges expose the same tool, the caller must pass `bridgeId` to
`mikoto_call_tool`.

Each bridge handles one tool call at a time. Concurrent calls to the same bridge
receive a clear `bridge_busy` error. Tool calls have a fixed
5-minute wall-clock timeout.
