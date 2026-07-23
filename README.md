# Mikoto

![Mikoto logo](assets/logo.svg)

Mikoto connects ChatGPT to explicitly configured local MCP servers through a
Cloudflare-protected relay. Its local bridge makes an outbound WebSocket
connection, so using local tools does not require exposing an inbound HTTP
server on the local computer.

See the [Mikoto documentation][docs] for the setup guide, architecture,
configuration, deployment, security boundaries, and current limitations.

[docs]: https://mikoto.takuk.me/

## How It Works

1. ChatGPT connects to the relay's MCP endpoint through Cloudflare Access
   Managed OAuth.
2. The local bridge connects outbound to the relay and advertises tools from
   configured local MCP servers.
3. ChatGPT lists connected bridges and calls an advertised backend tool through
   the relay's fixed tool surface.

Mikoto includes `mikoto-codex-mcp` as a useful read-only Codex and browser-read
backend. Codex is an example backend rather than a requirement; the bridge can
route tools from any explicitly configured stdio MCP server.

## Get Started

Follow the [end-to-end setup guide][getting-started] to deploy the relay,
configure Cloudflare Access, connect a local bridge, add the ChatGPT App, and
make a first tool call.

[getting-started]: https://mikoto.takuk.me/getting-started/

## Install Local Binaries

Install and activate the latest `mikoto-bridge` and `mikoto-codex-mcp`
executables with mise:

```console
mise use -g github:risu729/mikoto
```

Released binaries support `--version`:

```console
mikoto-bridge --version
mikoto-codex-mcp --version
```

## Repository Packages

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

The local relay uses `http://localhost:8787/` for MCP requests and
`ws://localhost:8787/bridge` for bridge WebSocket connections.

Run the documentation site locally:

```console
mise //packages/docs:dev
```

## Testing

```console
mise run check --lint
mise run test
```
