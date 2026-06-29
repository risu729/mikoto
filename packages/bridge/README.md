# @mikoto/bridge

Local bridge process.

The bridge loads `mikoto.toml`, starts configured stdio backend MCP servers,
discovers their tools, and connects outbound to the relay over WebSocket. HTTP
backends are still rejected as unimplemented.

## Run

From the repository root:

```sh
cp mikoto.example.toml mikoto.toml
mise run bridge
```

The default local relay URL in `mikoto.example.toml` is
`ws://localhost:8787/bridge`. Override it with `MIKOTO_RELAY_URL` when targeting
a deployed relay.

## Compile

From the repository root:

```sh
mise run compile:bridge
```

This creates single-file Bun executables in `dist/`:

- `mikoto-bridge-linux-x64`
- `mikoto-bridge-windows-x64.exe`
