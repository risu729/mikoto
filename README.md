# mikoto

`mikoto` is an early-stage design for a local MCP gateway that lets ChatGPT reach carefully scoped local MCP servers through a Cloudflare relay.

The first target is a ChatGPT App that can make read-only requests against a constrained local browser context through Codex app-server and the official `@Chrome` integration, without giving ChatGPT direct browser control, raw HTML/DOM access, or raw Codex app-server access.

## Status

This repository is currently a design-stage project. There is no installable package or runnable MVP yet.

The architecture and MVP constraints are documented in [design.md](design.md).

The planned implementation stack is TypeScript on Bun, using the official MCP TypeScript SDK where practical.

## Intended Users And Scenarios

`mikoto` is intended for users who want ChatGPT to help with local or authenticated workflows through explicit, policy-controlled MCP tools.

Initial expected users:

- Developers who already use Codex, MCP, Cloudflare, and local automation tools.
- Operators who want ChatGPT to summarize or inspect local/authenticated state without exposing broad credentials or browser control.
- Power users who run several local MCP servers and want one remote ChatGPT-facing entrypoint.

Initial business/work scenarios:

- Review authenticated web pages that are already open or reachable locally, such as GitHub notifications.
- Ask ChatGPT to inspect local tool output through configured MCP servers.
- Route ChatGPT requests to a specific local bridge when multiple computers are connected through the relay.

TODO after implementation:

- Add concrete end-to-end user stories.
- Add supported/non-supported workflow examples.
- Add screenshots or transcripts of the MVP flow.

## Architecture

`mikoto` is split into three active parts for the MVP:

- `relay`: Cloudflare Worker + Durable Object relay for the ChatGPT-facing MCP endpoint.
- `mikoto bridge`: local MCP router, registry, policy layer, and transport adapter.
- `mikoto-codex-mcp`: standalone MCP server that owns Codex app-server integration.

The bridge should remain backend-agnostic. Codex integration lives behind an MCP boundary, the same way future Discord, filesystem, shell, or browser-devtools integrations would.

The relay uses a Cloudflare Worker plus Durable Object from the start. The Worker exposes the public MCP/App-facing endpoint. The Durable Object manages connected local bridge sessions, bridge discovery, and target bridge selection.

```text
ChatGPT App
  ↓
Cloudflare MCP relay
  ↓
Cloudflare Access
  ↓
outbound WebSocket connection from local bridge
  ↓
mikoto bridge
  ↓
local MCP servers
  ├─ mikoto-codex-mcp
  │    └─ codex app-server
  │         └─ official @Chrome
  ├─ discord-mcp
  ├─ filesystem-mcp
  ├─ shell-mcp
  ├─ chrome-devtools-mcp
  └─ other configured local MCP servers
```

The local bridge connects outbound to the Cloudflare relay during startup over WebSocket. The relay should not require inbound access to a local machine.

For the MVP, losing the relay connection should terminate the local bridge process. Automatic reconnection is a future improvement.

The ChatGPT-facing MCP endpoint should use Streamable HTTP, not SSE. SSE can be added later only if a legacy client requires it.

Cloudflare Access protects the relay-to-local-bridge path by accepting requests only from trusted local computers connected through Cloudflare WARP. WARP should be installed locally, and Access policy should trust the intended WARP clients.

The ChatGPT-facing relay endpoint should also be protected as a Cloudflare Access self-hosted application with Managed OAuth enabled. Cloudflare Access should handle the OAuth flow for MCP clients; the relay should not implement a custom OAuth server for the MVP.

Use separate Cloudflare Access applications/policies for the ChatGPT-facing MCP endpoint and the local bridge WebSocket endpoint. They have different trust models: ChatGPT-facing requests use Access Managed OAuth, while local bridge connections are restricted to trusted WARP clients.

## Design Intent

`mikoto bridge` should know MCP.

`mikoto-codex-mcp` should know Codex.

The bridge should never expose raw Codex app-server JSON-RPC to ChatGPT.

Configured backend MCP servers expose their tools by default, using backend-prefixed names such as `codex.codex_chrome_read`. Optional aliases, such as `local_chrome_read`, can be configured.

If the relay is connected to multiple local bridges, bridge names should not be embedded in tool names. The request should explicitly select which local bridge to use, and the relay should expose a discovery tool that lists available local bridges and tools.

The relay discovery tool should be named `mikoto.list_bridges`. It should return safe metadata for each connected bridge: bridge id, OS, status, last heartbeat time, and exposed tool names. It should not return secrets, local paths, environment variables, or raw backend config.

Each bridge should identify itself with `bridge.id`. If `bridge.id` is not configured, it should default to the local computer name. For the MVP, the relay should reject a bridge connection when another connected bridge already uses the same `bridge.id`.

Relay-handled tool calls should accept a reserved `bridgeId` routing field. If exactly one connected bridge exposes the requested tool, `bridgeId` may be omitted. If multiple bridges expose the same tool and `bridgeId` is omitted, the relay should return a clear ambiguity error instead of guessing.

When a bridge connects, it should push a snapshot of its exposed tools to the relay. For the MVP, that snapshot stays static for the bridge session.

For the MVP, each bridge should process one tool call at a time. If a bridge is already running a tool call, the relay should return a clear bridge-busy error. Concurrent tool calls can be added later.

For the MVP, tool calls should have a fixed maximum timeout of 5 minutes. Per-tool timeout configuration can be added later. If the relay loses the selected bridge connection while an MCP tool call is in progress, the relay should abort that tool call and return a clear connection-lost error.

For the MVP, both bridge and relay should log to stdout only. Persistent logs can be added later.

Backend MCP servers should start eagerly when the bridge starts. Startup should fail fast if any configured backend cannot start or cannot provide its tool list. For the MVP, the whole bridge should fail instead of starting in a partial degraded mode.

The bridge should not automatically discover and expose arbitrary local MCP servers. Only MCP servers configured in `mikoto.toml` are in scope. For configured MCP servers, expose their tools by default unless server or policy configuration narrows them.

Policy is enforced in both layers:

- The bridge enforces routing, namespace mapping, output filtering, origin/path restrictions, configured server exposure, and mutation bans before routing.
- Backend MCP servers enforce backend-specific invariants, such as safe Codex task templates and `@Chrome` read-only constraints.

`mikoto bridge` and backend MCP servers should run as separate programs. The bridge may start, stop, and supervise backend MCP server processes, but it should not bundle `mikoto-codex-mcp` into its own process.

## MVP

The MVP path is:

```text
ChatGPT App
→ Cloudflare MCP relay
→ mikoto bridge
→ mikoto-codex-mcp
→ codex app-server
→ official @Chrome
→ read-only browser task
```

GitHub notifications are the first concrete policy example, not the only future use case.

The ChatGPT-visible alias can be:

```text
local_chrome_read
```

The backend Codex MCP tool can be:

```text
codex_chrome_read
```

For the MVP, `mikoto-codex-mcp` launches and owns the Codex app-server process. It manages version pinning, lifecycle, cancellation, and cleanup. Connecting to an already-running Codex app-server can be added later as an explicit mode.

Codex CLI resolution should prefer:

```sh
mise x codex@latest -- codex ...
```

If `mise` is not available, `mikoto-codex-mcp` may fall back to `bunx`.

## Safety Model

For the first MVP example, browser access should be read-only and restricted to GitHub notifications:

- Only allow `https://github.com/notifications`.
- Return at most 5 visible rows.
- Do not click, type, submit, mark as read, archive, unsubscribe, or mutate state.
- Do not inspect cookies, tokens, local storage, session storage, or other secrets.

Chrome read tools should return structured task-oriented data chosen by the backend MCP server for the specific request. They should not return raw HTML, raw DOM dumps, screenshots, cookies, storage, or broad page dumps.

`local_chrome_read` and `codex_chrome_read` may accept arbitrary natural-language read requests. The request text must still be constrained by configured policy: allowed origins/paths, read-only behavior, output limits, secret restrictions, and mutation bans are not optional.

## Setup

TODO after implementation: replace this section with exact commands and screenshots.

Planned prerequisites:

- Bun
- Cloudflare account
- Cloudflare WARP installed on each local computer that will run `mikoto bridge`
- Cloudflare Access policy that trusts the intended WARP clients
- Codex CLI available through `mise x codex@latest -- codex ...`
- `bunx` as Codex CLI fallback only when `mise` is unavailable

Planned setup flow:

1. Install dependencies.
2. Configure Cloudflare Worker + Durable Object relay.
3. Configure Cloudflare Access so only trusted WARP clients can connect local bridges.
4. Create a project-local `mikoto.toml`.
5. Start the local `mikoto bridge`; it connects outbound to the relay during startup.
6. Register the relay as the ChatGPT App MCP endpoint.
7. Use the relay discovery tool to select a local bridge and inspect exposed tools.

## API Keys And Secrets

TODO after implementation: document exact secret names, commands, and where each key is used.

Expected secret/config categories:

- Cloudflare API token for deploying and managing the Worker/Durable Object relay.
- Cloudflare account ID and zone or worker route configuration.
- Cloudflare Access self-hosted application configuration for the ChatGPT-facing relay endpoint, with Managed OAuth enabled.
- Separate Cloudflare Access/WARP policy configuration for local bridge WebSocket connections.
- Any ChatGPT App or MCP endpoint configuration required to connect ChatGPT to the relay.
- Local environment needed by Codex CLI and browser integration.

Secrets should not be stored in `mikoto.toml` unless explicitly designed and documented. Prefer environment variables, Cloudflare secrets, or local secret stores depending on the component.

## Usage

TODO after implementation: replace with working commands.

Planned local usage:

```sh
bun install
bun run relay:deploy
bun run bridge --config mikoto.toml
```

Planned ChatGPT usage:

1. Connect the ChatGPT App to the Cloudflare MCP relay.
2. Call the relay discovery tool to list available local bridges and tools.
3. Select the target local bridge explicitly when more than one bridge exposes the target tool.
4. Call a configured tool or alias, such as `local_chrome_read`.

## Configuration

Configuration should start as a project-local `mikoto.toml` file with schema validation. Per-user global config can be layered later if needed.

The config schema should live in `packages/protocol` so the bridge, tests, examples, and future tooling validate the same config shape.

The config schema should include both `stdio` and `http` backend transports. The first implementation should support `stdio`; configured `http` backends should return a clear unimplemented error until HTTP support lands.

The bridge-to-relay connection should use WebSocket for the MVP. This gives the Durable Object a long-lived bridge session, supports bidirectional request/response routing, and gives the bridge a clear connection-loss signal.

Cloudflare Worker and Durable Object limits are acceptable for the MVP as long as the relay stays I/O-bound. The 5-minute tool timeout is wall-clock application behavior; Cloudflare CPU limits apply to active compute time, not time spent waiting on network I/O. The relay should avoid CPU-heavy work, stream or await bridge responses, and use Durable Object WebSocket Hibernation for idle bridge sessions. If relay CPU usage ever becomes high, raise `limits.cpu_ms` on a paid plan or move work out of the relay.

Relay connection settings should support both `mikoto.toml` and environment variables. Non-secret values such as relay URL and bridge ID may live in TOML. Secrets and local overrides should be available through environment variables. This should allow tests to point the bridge at a local relay test server.

The first implementation should avoid OS-specific assumptions. The bridge should support direct local backend MCP server configuration first, while keeping the registry shape generic enough to add WSL or remote launch modes later. The bridge itself does not need to expose an HTTP server for the MVP; it connects outbound to the relay over WebSocket.

Initial registry fields should account for:

- Backend server id
- Transport
- Command
- Args
- Working directory
- Environment
- URL for HTTP transports
- Tool aliases and exposure rules
- Policy binding

## Repository Layout

The planned package layout is:

```text
mikoto/
  packages/
    protocol/
    bridge/
    codex-mcp/
    relay/
    app/
```

## Testing

Use Bun's built-in test runner for unit and integration tests.

For the Cloudflare Worker relay package, use Cloudflare's current Worker tooling: `@cloudflare/vite-plugin` for Worker development/build integration and the Workers Vitest integration (`@cloudflare/vitest-pool-workers`) for Worker-runtime tests. Relay tests should run locally in the Workers runtime via Miniflare/workerd rather than a hand-rolled fake relay.

Use Hono for relay HTTP routing on Cloudflare Workers.

Initial tests should cover:

- `mikoto.toml` schema validation.
- Relay bridge registration and duplicate `bridge.id` rejection.
- Tool snapshot routing.
- `bridgeId` ambiguity behavior.
- Bridge-busy behavior.
- Tool-call timeout handling.
- Local relay test behavior through the Cloudflare Worker test runtime.

Avoid browser/Codex end-to-end tests until the skeleton protocol and routing behavior are stable.

## Future Improvements

- Cloudflare MCP Server Portal as a possible future reference or replacement path if it fits the relay requirements later.
- Automatic bridge-to-relay reconnection after connection loss.
- Adding or removing backend MCP servers while the bridge is running, including dynamic tool snapshot refresh.
- Lazy backend MCP server startup on first tool use.
- Partial degraded bridge startup when some configured backends are unavailable.
- Concurrent tool calls per bridge or per backend.
- Per-tool timeout configuration.
- Explicit user-initiated tool-call cancellation once ChatGPT App/MCP cancellation behavior is confirmed.
- SSE transport compatibility for legacy MCP clients.
- Persistent relay/bridge logs, with careful redaction for arguments and results.
- WSL-specific launch mode.
- HTTP MCP backend transport.
- Per-user global config layering.
- More backend MCP servers and richer policy presets.
