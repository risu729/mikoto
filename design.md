# mikoto design

This document preserves the detailed architecture direction for `mikoto`.

## Core Direction

`mikoto` should be a local MCP gateway, not a Codex-specific daemon.

The local bridge should be only an MCP router, registry, policy layer, and transport adapter. It should not directly implement Codex app-server logic.

Codex app-server integration should live in a separate MCP server:

```text
mikoto-codex-mcp
  → codex app-server
  → official @Chrome
```

Then the bridge can route to it just like any other local MCP server.

The local bridge should connect outbound to the relay during startup over WebSocket. The relay should not require inbound access to a local machine. For the MVP, losing the relay connection should terminate the local bridge process; automatic reconnection is a future improvement.

The ChatGPT-facing MCP endpoint should use Streamable HTTP, not SSE. SSE can be added later only if a legacy client requires it.

The relay Worker to local bridge daemon connection should be protected by Cloudflare Access. Cloudflare Access should accept local bridge connections only from trusted local computers connected through Cloudflare WARP. WARP should be installed locally, and Access policy should trust the intended WARP clients. Bridge and backend policy still control which tools and actions are exposed after authentication.

The ChatGPT-facing relay endpoint should be protected as a Cloudflare Access self-hosted application with Managed OAuth enabled. Cloudflare Access should handle the OAuth flow for MCP clients. The relay should not implement a custom OAuth server for the MVP.

Use separate Cloudflare Access applications/policies for the ChatGPT-facing MCP endpoint and the local bridge WebSocket endpoint. ChatGPT-facing requests use Access Managed OAuth. Local bridge connections are restricted to trusted WARP clients.

## Architecture

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
  │    └─ Discord Bot API
  ├─ filesystem-mcp
  ├─ shell-mcp
  ├─ chrome-devtools-mcp
  └─ other configured local MCP servers
```

## Planned Package Layout

The planned implementation stack is TypeScript on Bun.

```text
mikoto/
  packages/
    protocol/
      Shared schemas, capabilities, policy types, and event types.

    bridge/
      Local MCP router.
      Connects outbound to the Cloudflare relay over WebSocket.
      Connects to local MCP servers over stdio or HTTP.
      Applies configured tool exposure, origin/path restrictions, output filtering, and policy.

    codex-mcp/
      Standalone MCP server for Codex app-server.
      Uses codex app-server, not codex exec.
      Handles thread/session lifecycle, streaming, approvals, cancellation, and @Chrome.

    relay/
      Cloudflare Worker + Durable Object relay.
      Required for the MVP so the system can be used as a ChatGPT App.
      The Worker exposes the public MCP/App-facing endpoint.
      The Durable Object manages connected local bridge sessions, bridge discovery, and target bridge selection.

    app/
      Optional ChatGPT App UI resources/components.
```

## Runtime And Dependencies

The first implementation should avoid OS-specific assumptions.

Use TypeScript on Bun, with the official MCP TypeScript SDK where practical. Prefer SDK protocol handling over hand-rolled JSON-RPC unless bridge-level proxying, streaming, or transport adaptation requires lower-level control.

Use Bun's built-in test runner for normal package unit and integration tests.

For the Cloudflare Worker relay package, use Cloudflare's current Worker tooling: `@cloudflare/vite-plugin` for Worker development/build integration and the Workers Vitest integration (`@cloudflare/vitest-pool-workers`) for Worker-runtime tests. Relay tests should run locally in the Workers runtime via Miniflare/workerd rather than a hand-rolled fake relay.

Use Hono for relay HTTP routing on Cloudflare Workers.

Initial tests should cover config schema validation, relay bridge registration, duplicate `bridge.id` rejection, tool snapshot routing, `bridgeId` ambiguity behavior, bridge-busy behavior, timeout handling, and local relay behavior through the Cloudflare Worker test runtime. Avoid browser/Codex end-to-end tests until the skeleton protocol and routing behavior are stable.

The bridge should initially support direct local backend MCP servers through:

```text
- stdio process launch
- HTTP MCP endpoints
```

The bridge-to-relay connection should use WebSocket for the MVP. This provides a long-lived bridge session for the Durable Object, bidirectional request/response routing, and a clear connection-loss signal.

Cloudflare Worker and Durable Object limits are acceptable for the MVP as long as the relay stays I/O-bound. The 5-minute tool timeout is wall-clock application behavior; Cloudflare CPU limits apply to active compute time, not time spent waiting on network requests, storage calls, WebSocket messages, or other I/O. The relay should avoid CPU-heavy work, stream or await bridge responses, and use Durable Object WebSocket Hibernation for idle bridge sessions.

If relay CPU usage ever becomes high, raise `limits.cpu_ms` on a paid plan or move work out of the relay. Do not design the relay to perform heavy result processing.

The backend MCP server config schema should allow both `stdio` and `http` transports from the start. The first implementation should implement `stdio`; configured `http` backends should fail with a clear unimplemented error until HTTP transport support is added.

The registry/config model should stay generic enough to support WSL or remote launch modes later without redesigning the package boundary. Initial registry fields should account for:

```text
- backend server id
- transport
- command
- args
- cwd
- env
- URL for HTTP transports
- tool aliases and exposure rules
- policy binding
```

Do not hardcode OS-specific behavior in the first version. WSL orchestration can be added later as an explicit launch mode.

Configuration should start as a project-local `mikoto.toml` file with schema validation. Per-user global config can be layered later if needed, but the MVP should avoid hidden machine state and keep examples/test fixtures explicit.

The schema should be maintained in `packages/protocol` so the bridge, tests, examples, and future tooling validate the same config shape.

Relay connection settings should support both `mikoto.toml` and environment variables. Non-secret values such as relay URL and bridge ID may live in TOML. Secrets and local test overrides should be available through environment variables so the bridge can connect to a local relay test server.

## Responsibilities

### mikoto bridge

`mikoto bridge` is the router.

It should handle:

```text
- local MCP server registry
- starting/stopping local MCP servers
- tool discovery
- tool namespace mapping
- policy enforcement
- configured tool exposure and policy narrowing
- origin/path restrictions
- output filtering
- routing to local MCP servers, with future WSL or remote launch modes
- Cloudflare relay connection
- terminating the bridge process when the relay connection is lost, until reconnection support exists
```

It should not handle:

```text
- Codex app-server JSON-RPC directly
- Codex thread lifecycle
- Codex approval events directly
- @Chrome prompt implementation directly
- Discord Bot API directly
```

Those belong in backend MCP servers.

The bridge and backend MCP servers should run as separate programs. Do not bundle `mikoto-codex-mcp` into the bridge process. The bridge may start, stop, and supervise backend MCP server processes, but each backend keeps its own executable boundary and protocol surface.

Backend MCP servers should start eagerly when the bridge starts. Startup should fail fast if any configured backend cannot start or cannot provide its tool list. For the MVP, the whole bridge should fail instead of starting in a partial degraded mode. Lazy backend startup or explicit degraded startup can be added later if needed.

### mikoto-codex-mcp

`mikoto-codex-mcp` is a standalone local MCP server.

For the MVP, `mikoto-codex-mcp` should launch and own the Codex app-server process. It should manage version pinning, lifecycle, cancellation, and cleanup. Connecting to an already-running Codex app-server can be added later as an explicit mode.

Codex CLI resolution should prefer `mise x codex@latest -- codex ...`. If `mise` is not available, `mikoto-codex-mcp` may fall back to `bunx`. Do not silently choose unrelated global installs before trying the configured `mise` path.

It should handle:

```text
- launching Codex CLI through the configured resolver
- starting codex app-server
- initialize / thread/start / turn/start
- streaming app-server events
- best-effort interruption on timeout
- approval and elicitation mapping
- safe Codex task templates
- @Chrome read-only tasks
```

It should expose semantic MCP tools such as:

```text
codex_task
codex_check
codex_chrome_read
```

The bridge can then expose a higher-level facade tool:

```text
local_chrome_read
```

which routes to:

```text
mikoto-codex-mcp.codex_chrome_read
```

## Policy Enforcement

Policy should be enforced in both the bridge and backend MCP servers.

The bridge owns the external contract:

```text
- configured MCP server registry
- tool exposure for configured MCP servers
- tool aliases and namespace mapping
- URL, origin, and path restrictions
- output filtering
- mutation bans before routing
- policy selection from mikoto.toml
```

The bridge should not automatically discover and expose arbitrary local MCP servers. Only MCP servers configured in `mikoto.toml` are in scope. For configured MCP servers, expose their tools by default unless the server or policy configuration narrows them.

Tool names exposed by a bridge should be backend-prefixed by default, such as `codex.codex_chrome_read` or `filesystem.read_file`, to avoid collisions between configured backend MCP servers. The bridge may also expose configured aliases such as `local_chrome_read`.

If a relay is connected to multiple local bridges, bridge names should not be embedded in tool names. The caller should explicitly select which local bridge to use in the request. The relay should expose a discovery tool that lists available local bridges and their exposed tools.

Multi-bridge awareness belongs only in the relay for now. A local bridge should not know that other bridges exist; it only manages its own configured backend MCP servers.

The relay discovery tool should be named `mikoto.list_bridges`. It should return safe metadata for each connected bridge:

```text
- bridge id
- bridge OS
- status
- last heartbeat time
- exposed tool names
```

It should not return secrets, local paths, environment variables, or raw backend config.

Each bridge should identify itself with `bridge.id`. If `bridge.id` is not configured, it should default to the local computer name. Do not include a separate `bridge.name` field for the MVP. If a bridge attempts to connect with the same `bridge.id` as an already-connected bridge, the relay should reject the new connection with a clear duplicate-id error.

Relay-handled tool calls should accept a reserved `bridgeId` routing field. The relay uses `bridgeId` for routing and forwards only the actual tool arguments to the selected bridge. If exactly one connected bridge exposes the requested tool, `bridgeId` may be omitted. If multiple connected bridges expose the requested tool and `bridgeId` is omitted, the relay should return a clear ambiguity error.

When a bridge connects, it should push a snapshot of its exposed tools to the relay. For the MVP, the snapshot stays static for that bridge session. Adding/removing backend MCP servers while the bridge is running and refreshing tool snapshots are future improvements.

For the MVP, each bridge should process one tool call at a time. If a call is already in progress for the selected bridge, the relay should return a clear bridge-busy error. Concurrent calls can be added later per bridge, backend, or tool.

For the MVP, tool calls should have a fixed maximum timeout of 5 minutes. Per-tool timeout configuration can be added later. If the relay loses the selected bridge connection while an MCP tool call is in progress, the relay should abort that tool call and return a clear connection-lost error.

On timeout, the bridge should make a best-effort attempt to interrupt the backend if the backend supports interruption, such as Codex app-server. Explicit user-initiated cancellation from ChatGPT should be treated as future work until the ChatGPT App/MCP cancellation behavior is confirmed.

For the MVP, both bridge and relay should log to stdout only. Persistent logging can be added later, but should avoid storing sensitive tool arguments, authenticated page content, or tool results by default.

Backend MCP servers own backend-specific invariants:

```text
- safe Codex task templates
- @Chrome read-only prompt constraints
- backend-specific mutation checks
- timeout interruption and approval boundaries
- refusal to expose raw backend protocols as tools
```

This keeps `mikoto bridge` backend-agnostic while still giving each backend enough local policy to defend its own surface.

## MVP

The MVP should be:

```text
ChatGPT App
→ Cloudflare MCP relay
→ mikoto bridge
→ mikoto-codex-mcp
→ codex app-server
→ official @Chrome
→ read-only browser task
```

GitHub notifications are the first concrete policy example, not the only future use case for read-only Chrome tasks.

The ChatGPT-visible tool should be:

```text
local_chrome_read
```

The backend tool can be:

```text
codex_chrome_read
```

The initial GitHub notifications example policy should be:

```text
- only https://github.com/notifications
- max 5 visible rows
- no clicking
- no typing
- no submitting
- no marking as read
- no archiving
- no unsubscribing
- no cookie/token/storage inspection
- no mutation
```

`codex_chrome_read` should return structured task-oriented results chosen by `mikoto-codex-mcp` for the specific request. It should not return raw HTML, raw DOM dumps, screenshots, cookies, storage, tokens, or broad page dumps. For GitHub notifications, the result can be an array of visible notification items plus policy metadata, but other allowed read-only tasks may define their own structured result shape.

`local_chrome_read` and `codex_chrome_read` may accept arbitrary natural-language read requests. The request text must still be constrained by configured policy: allowed origins/paths, read-only behavior, output limits, secret restrictions, and mutation bans are not optional and should be enforced before and during execution.

## Why Split Bridge and codex-mcp?

### Benefits

```text
- mikoto remains backend-agnostic
- Codex is just one local MCP server
- Discord MCP can be added without touching Codex code
- WSL repo tools can be added without touching Codex code
- Claude Desktop, Cursor, or other MCP clients can use mikoto-codex-mcp directly
- Codex app-server protocol changes are isolated
- mikoto bridge can stay small and stable
- crash isolation is better
- testing is simpler
```

### Cost

```text
- one more local process
- one more MCP boundary
- streaming/cancellation/approval mapping must pass through bridge
- slightly more latency
- more configuration
```

For the project goal, the benefits outweigh the cost.

## Similar Projects To Reference

Use these as prior art and implementation references:

```text
- xihuai18/codex-mcp
  A community MCP server that wraps codex app-server.

- openai/codex-plugin-cc
  Official Claude Code plugin using Codex from Claude Code.
  Useful as an app-server client reference, not as a reusable MCP server.

- getpaseo/paseo
  Self-hosted multi-agent orchestrator with daemon, relay, mobile/web/desktop clients, and MCP tools.

- Cloudflare MCP Server Portal
  Future possible improvement/reference for remote MCP gateway behavior, Access integration, tool selection, aliases, and logs.

- Cloudflare Workers / Agents MCP examples
  Useful references for the required custom Worker/DO relay.

- mcp-proxy / supergateway
  Transport references for stdio-to-HTTP/SSE MCP bridging.

- Docker MCP Gateway
  Reference for multi-server MCP registry/gateway and isolation.

- AgentBridge / OpenClaw Codex app-server plugins
  References for Codex app-server bridges, but not general-purpose mikoto replacements.
```

## Design Rule

`mikoto bridge` should know MCP.

`mikoto-codex-mcp` should know Codex.

The bridge should never expose raw Codex app-server JSON-RPC to ChatGPT.
