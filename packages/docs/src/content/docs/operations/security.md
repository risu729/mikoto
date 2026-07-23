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
- exposed tool names and input schemas.

It must not return secrets, local paths, environment variables, raw backend
config, raw tool arguments, or tool results.

## Backend Boundary

The bridge starts and routes only the MCP servers explicitly listed in
`mikoto.toml`. It does not auto-discover local servers. Configuring a backend
grants remote callers access to every tool that backend advertises, plus any
configured aliases, so operators must review a backend's behavior before
exposing it.

The relay exposes only two fixed ChatGPT-facing tools:
`mikoto_list_bridges` and `mikoto_call_tool`. Backend tool metadata guides
calls through that bounded dispatcher; raw backend MCP protocol methods are not
exposed.

## Browser Read Policy

The relay and bridge do not interpret natural-language tool arguments or apply
a browser-specific policy. The bundled Codex browser tool turns each request
into read-only instructions and starts Codex with a read-only sandbox. It must
reject mutation and secret-inspection requests rather than attempting them.

Other configured backends are responsible for enforcing their own safety
policies. Operators should expose only backends whose full advertised tool set
is appropriate for remote use.

Browser read tools must not return raw HTML, raw DOM dumps, screenshots,
cookies, storage, tokens, or broad page dumps.

## Logging

Bridge and relay application logs are stdout-only. Cloudflare Workers logs and
traces are enabled for the deployed relay. Logs should include operational
metadata such as component, bridge id, tool name, status, duration, and error
code. They should not log full tool arguments or full tool results by default.
