---
description: Security boundaries and safety assumptions.
title: Security
---

Mikoto is designed around explicit configuration and defense in depth. The
relay exposes only bounded MCP tools. The bridge routes only to configured local
backends. Backend MCP servers enforce backend-specific safety rules.

## Access Boundary

The deployed relay hostname is DNS-public when the Worker route exists.
Cloudflare Access is the intended boundary for relay paths:

- `/mcp*`: Cloudflare Access Managed OAuth.
- `/bridge*`: WARP-restricted Access policy.
- `/health*`: WARP-restricted Access policy.

Until those policies exist, the deployed relay paths should be treated as
internet-reachable.

## Metadata Boundary

`mikoto_list_bridges` returns only safe metadata:

- bridge id;
- bridge OS;
- connection status;
- last heartbeat time;
- exposed tool names.

It must not return secrets, local paths, environment variables, raw backend
config, raw tool arguments, or tool results.

## Browser Read Policy

Browser reads are read-only. Requests that ask for mutation or secret inspection
should be rejected before routing, not only filtered after execution.

Browser read tools must not return raw HTML, raw DOM dumps, screenshots,
cookies, storage, tokens, or broad page dumps.

## Logging

Bridge and relay logs are stdout-only for the MVP. Logs should include
operational metadata such as component, bridge id, tool name, status, duration,
and error code. They should not log full tool arguments or full tool results by
default.
