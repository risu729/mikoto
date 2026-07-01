---
description: Configure bridge identity, relay URL, and backend MCP servers.
title: Configuration
---

Configuration starts as project-local `mikoto.toml` with schema validation.

```toml
[bridge]
id = "dev-machine"

[relay]
url = "ws://localhost:8787/bridge"

[[servers]]
id = "codex"
transport = "stdio"
command = "bun"
args = ["packages/codex-mcp/src/index.ts"]

[[servers.aliases]]
name = "local_chrome_read"
target = "codex.codex_chrome_read"
```

## Supported Fields

- `[bridge].id`: optional bridge identity. Defaults to the local computer name.
- `[relay].url`: relay WebSocket URL. Required.
- `[[servers]].id`: backend MCP id used as the tool-name prefix.
- `[[servers]].transport`: `stdio` is implemented. `http` is schema-supported
  but returns an unimplemented error in the bridge.
- `[[servers]].command`, `args`, `cwd`, `env`: stdio backend launch settings.
- `[[servers.aliases]]`: optional exposed aliases that route to another exposed
  tool.

Configured backend MCP servers are exposed by default. Tool names are prefixed
with the backend id, so backend tool `codex_chrome_read` from server `codex`
becomes `codex.codex_chrome_read`.

You can override local config without editing `mikoto.toml`:

```sh
MIKOTO_RELAY_URL=ws://localhost:8787/bridge mise //packages/bridge:run
MIKOTO_BRIDGE_ID=my-dev-machine mise //packages/bridge:run
```
