# @mikoto/bridge

Local bridge process scaffold.

The bridge loads `mikoto.toml`, resolves bridge metadata, starts configured
backend MCP servers, and connects outbound to the relay over WebSocket. The MVP
scaffold validates config and rejects HTTP backends as unimplemented.

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
