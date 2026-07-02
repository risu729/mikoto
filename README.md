# Mikoto

Mikoto is an early-stage local MCP gateway for using ChatGPT with explicitly
configured local MCP servers through a Cloudflare relay.

For motivation, architecture, Cloudflare setup, component behavior, deployment,
security, and limitations, use the documentation site in `packages/docs`.

## Packages

- `packages/relay`: Cloudflare Worker and Durable Object relay.
- `packages/bridge`: local bridge that connects outbound to the relay.
- `packages/codex-mcp`: standalone Codex MCP backend.
- `packages/protocol`: shared schemas and protocol types.
- `packages/docs`: Starlight documentation site.

## Local Development

Install configured tools and project dependencies:

```console
mise install
mise deps
```

Create local config, then run the relay and bridge in separate shells:

```console
cp mikoto.example.toml mikoto.toml
mise //packages/relay:dev
```

```console
mise //packages/bridge:run
```

The local relay uses `http://localhost:8787/mcp` for MCP requests and
`ws://localhost:8787/bridge` for bridge WebSocket connections.

Run the docs site locally:

```console
mise //packages/docs:dev
```

## Testing

```console
mise run check --lint
mise run test
```
