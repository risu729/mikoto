---
description: Local bridge responsibilities and routing model.
title: Bridge
---

The bridge is a local process. It does not expose a webserver. It connects
outbound to the relay over WebSocket and routes relay tool calls to explicitly
configured backend MCP servers.

## Startup

Bridge startup order:

1. Load `mikoto.toml` and environment overrides.
2. Validate configuration with shared protocol schemas.
3. Resolve `bridge.id`, defaulting to the local computer name.
4. Detect bridge OS for relay metadata.
5. Start configured backend MCP servers eagerly.
6. Discover backend tools.
7. Build the exposed tool snapshot and configured aliases.
8. Connect outbound to the relay over WebSocket.
9. Send bridge metadata and the static tool snapshot.

If a configured backend fails startup or tool discovery, the bridge exits with a
non-zero status.

## Responsibilities

The bridge:

- owns the configured backend MCP server registry;
- exposes backend-prefixed tool names;
- exposes configured aliases;
- forwards calls to backend MCP servers;
- terminates owned backend processes when it exits.

The bridge must not auto-discover arbitrary local MCP servers, know about other
bridges, or expose raw backend protocol methods as public relay tools.

## Backend Transports

The config schema includes `stdio` and `http` backend transports. `stdio` is the
implemented transport. Configured `http` backends currently return a clear
unimplemented error.

Run and compile commands for local development live in the
[`packages/bridge` README][bridge-readme].

For the complete configuration and connection flow, see
[Get Started](/getting-started/).

[bridge-readme]: https://github.com/risu729/mikoto/blob/main/packages/bridge/README.md
