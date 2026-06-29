# @mikoto/bridge

Local bridge process scaffold.

The bridge loads `mikoto.toml`, starts configured stdio backend MCP servers,
discovers their tools, and connects outbound to the relay over WebSocket. HTTP
backends are still rejected as unimplemented.

## Run

From the repository root:

```sh
mise run bridge
```

## Compile

From the repository root:

```sh
mise run compile:bridge
```

This creates single-file Bun executables in `dist/`:

- `mikoto-bridge-linux-x64`
- `mikoto-bridge-windows-x64.exe`
