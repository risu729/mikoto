---
description: Security boundaries and safety assumptions.
title: Security
---

Mikoto is designed around explicit configuration and defense in depth. The
relay exposes only bounded MCP tools. The bridge routes only to configured local
backends. Backend MCP servers enforce backend-specific safety rules.

## Access Boundary

The deployed relay hostnames are DNS-public when the Worker routes exist.
Cloudflare Access is the intended boundary for relay paths:

- `https://mcp.mikoto.takuk.me/*`: Cloudflare Access Managed OAuth.
- `https://bridge.mikoto.takuk.me/bridge*`: WARP-restricted Access policy.
- `https://bridge.mikoto.takuk.me/health*`: WARP-restricted Access policy.

The same relay Worker serves both hostnames. They are separate at the
Cloudflare Access layer so ChatGPT Managed OAuth does not share a hostname with
WARP/private-app bridge authentication.

Cloudflare Access forwards authenticated requests to the Worker and may include
`Cf-Access-Jwt-Assertion`. Mikoto does not currently use this header for
authorization. If relay behavior later depends on Access identity, the relay
must validate the JWT signature, issuer, and application AUD tag before
trusting any claims.

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
