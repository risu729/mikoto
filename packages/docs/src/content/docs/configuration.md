---
description: Configure bridge identity, relay URL, and backend MCP servers.
title: Configuration
---

The bridge reads project-local `mikoto.toml` from its current working directory
unless another path is passed with `--config`. Start from the
[repository example][example-config]:

```console
cp mikoto.example.toml mikoto.toml
```

The latest JSON Schema is published at the [public schema URL][mikoto-schema].
Editors that understand the TOML schema directive can validate fields and
provide completions while the file is edited.

[example-config]: https://github.com/risu729/mikoto/blob/main/mikoto.example.toml
[mikoto-schema]: https://mikoto.takuk.me/schemas/mikoto.schema.json

```toml
#:schema https://mikoto.takuk.me/schemas/mikoto.schema.json

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
name = "local_chrome_read_start"
target = "codex.codex_chrome_read_start"
```

## Supported Fields

- `[bridge].id`: optional bridge identity. Defaults to the local computer name.
- `[relay].url`: relay WebSocket URL. Required.
- `[[servers]].id`: backend MCP id used as the tool-name prefix.
- `[[servers]].transport`: `stdio` is implemented. `http` is schema-supported
  but returns an unimplemented error in the bridge.
- `[[servers]].command`: executable used to start a stdio backend.
- `[[servers]].args`: optional command arguments.
- `[[servers]].cwd`: optional backend working directory.
- `[[servers]].env`: optional environment variables added to the MCP SDK's
  default safe environment.
- `[[servers.aliases]]`: optional exposed aliases that route to another exposed
  tool.

The bridge starts only the MCP servers listed in `[[servers]]`; it does not
search the computer for other servers. Every configured backend starts eagerly,
and bridge startup fails if any backend fails to start or list its tools.

Discovered metadata is visible through `mikoto_list_bridges`, and ChatGPT
invokes a selected tool through `mikoto_call_tool`. Tool names are prefixed with
the backend id, so backend tool `codex_chrome_read_start` from server `codex`
becomes `codex.codex_chrome_read_start`.

Aliases provide a stable or shorter exposed name without changing the backend:

```toml
[[servers.aliases]]
name = "local_chrome_read_start"
target = "codex.codex_chrome_read_start"
```

The alias target must be a discovered, backend-prefixed tool. Alias names must
also be unique across the bridge.

## Relay URL And Environment Overrides

Use the local relay URL during development:

```toml
[relay]
url = "ws://localhost:8787/bridge"
```

Use the WARP-protected bridge hostname for a deployed relay:

```toml
[relay]
url = "wss://bridge.example.com/bridge"
```

`MIKOTO_RELAY_URL` and `MIKOTO_BRIDGE_ID` override the matching config fields
without editing `mikoto.toml`.

The relay keeps its ChatGPT-facing native tools fixed as
`mikoto_list_bridges` and `mikoto_call_tool`. Backend changes appear in bridge
metadata rather than as new native ChatGPT tools, avoiding stale ChatGPT App
tool discovery.

See [Get Started](/getting-started/) for the full deployment and first-call
flow. Local run commands also live in the package README files.
