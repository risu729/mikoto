# mikoto implementation design

This document is a temporary implementation guide. Remove it after the
implementation is in place and the durable user-facing documentation lives in
`README.md` and code-level docs.

## Product Goal

Build a local MCP gateway that lets ChatGPT call explicitly configured local MCP
servers through a Cloudflare relay.

The MVP is a general-purpose, read-only Codex browser read tool. It should allow
natural-language read requests against allowed local browser context through
bounded Codex CLI tasks and the official `@Chrome` integration. It must not be
GitHub-notifications-specific.

Core design rule:

- `mikoto bridge` should know MCP routing, registry, policy, transport, and
  output filtering.
- `mikoto-codex-mcp` should know Codex CLI execution, Codex task prompts,
  task status, timeout handling, and `@Chrome`.
- The bridge must never expose raw Codex protocol details to ChatGPT.

## Package Layout

- `packages/protocol`: shared schemas, config validation, relay/bridge message
  types, tool metadata, policy types, and test fixtures.
- `packages/relay`: Cloudflare Worker + Durable Object relay.
- `packages/bridge`: local bridge process that starts backend MCP servers and
  connects outbound to the relay.
- `packages/codex-mcp`: standalone MCP server that owns Codex CLI task
  execution.

Use TypeScript on Bun for local packages. Use the official MCP TypeScript SDK
where practical.

Do not combine the bridge and `mikoto-codex-mcp` into one process. The bridge
may start, stop, and supervise backend MCP server processes, but each backend
keeps its own executable boundary and MCP protocol surface.

## Library Selection

Prefer modern, well-maintained libraries when they provide safer or clearer
abstractions than low-level Node.js APIs. Keep dependencies purposeful and
package-local when only one package needs them.

Current recommendations:

- Use `execa` for owned subprocess execution, timeouts, captured output, and
  force-kill behavior.
- Use `luxon` for explicit timestamp and date/time handling.
- Use `zod` for runtime schema validation at config, protocol, and MCP tool
  boundaries.
- Consider `@sindresorhus/is` for narrow runtime predicates over unknown values
  when a full `zod` schema is too heavy. Do not use it as a replacement for
  boundary schemas.
- Consider `citty` when bridge or backend packages grow real CLI commands,
  subcommands, help text, and option parsing.
- Consider `consola` when logs grow beyond MVP stdout lines and need structured
  levels, scopes, or prettier local diagnostics.
- Consider `pathe` when path logic becomes cross-platform, WSL-aware, or
  file-URL-heavy enough that `node:path` becomes noisy.
- Consider `ufo` for URL construction and normalization when relay, Access, or
  backend URL handling grows beyond simple `URL` usage.
- Consider `type-fest` for shared type utilities only when local TypeScript
  types become meaningfully repetitive or hard to read.

Current non-recommendations:

- Do not replace `mikoto.toml` with JSON/YAML or introduce `c12` for the MVP.
  The project-local TOML plus schema validation model is intentional. Reevaluate
  `c12` only with future per-user/global config layering.
- Do not use `meow` while `citty` is the preferred future CLI option.
- Do not add libraries only to avoid a few lines of straightforward platform
  code.

## External Architecture

Request path:

1. ChatGPT App calls the Cloudflare Access-protected Streamable HTTP MCP
   endpoint.
2. Cloudflare Worker relay receives the MCP request.
3. Relay forwards routing/session work to a Durable Object.
4. Durable Object routes the call to the selected connected local bridge over
   WebSocket.
5. Local bridge forwards the call to a configured backend MCP server.
6. Backend returns structured data through the bridge and relay.

Bridge path:

1. Local bridge starts configured backend MCP servers eagerly.
2. Local bridge discovers exposed tools.
3. Local bridge connects outbound to the relay over WebSocket during startup.
4. Local bridge sends bridge metadata and a static exposed-tool snapshot.
5. If the relay WebSocket disconnects, the bridge exits for the MVP.

## Cloudflare Relay

Implement the relay with:

- Cloudflare Worker.
- Durable Object.
- Hono for HTTP routing.
- Streamable HTTP for the ChatGPT-facing MCP endpoint.
- WebSocket endpoint for local bridge connections.

Do not implement SSE.

Use separate Cloudflare Access applications/policies:

- ChatGPT-facing Streamable HTTP MCP endpoint: Cloudflare Access self-hosted
  application with Managed OAuth enabled.
- Local bridge WebSocket endpoint: Cloudflare Access policy restricted to
  trusted local computers connected through Cloudflare WARP.

Deploy through GitHub Actions using `cloudflare/wrangler-action` or a raw
`wrangler deploy` command with a Cloudflare API token stored in GitHub Actions
secrets. Do not use Cloudflare Workers Builds.

Keep the relay I/O-bound. The 5-minute tool timeout is wall-clock application
behavior; Cloudflare CPU limits apply to active compute, not time spent waiting
on network requests, storage calls, WebSocket messages, or other I/O. Avoid
heavy result processing in the relay.

The relay owns all multi-bridge awareness. A local bridge should not know that
other bridges exist.

Relay responsibilities:

- expose the public Streamable HTTP MCP endpoint
- handle Cloudflare Access-authenticated ChatGPT-facing requests
- accept local bridge WebSocket connections
- route calls to the selected bridge
- expose `mikoto.list_bridges`
- reject duplicate connected bridge ids
- enforce bridge selection and ambiguity errors
- enforce one in-flight call per bridge
- enforce relay-side timeouts and connection-lost errors
- store connected bridge metadata in Durable Object state
- keep stdout logs for MVP diagnostics

The relay should not:

- implement a custom OAuth server
- expose SSE
- store tool results by default
- inspect local filesystem paths or backend environment variables
- perform heavy result processing
- know Codex execution internals

## Durable Object State

The Durable Object owns connected bridge session state.

On bridge connection, persist safe bridge metadata:

- `bridge.id`
- bridge OS
- connection status
- last heartbeat time
- exposed tool snapshot
- WebSocket/session identifiers needed for routing

`bridge.id` defaults to the local computer name when not configured. Reject a
new connection if another currently connected bridge already uses the same
`bridge.id`.

Use Durable Object storage for bridge metadata that must survive
hibernation/reinitialization. Use WebSocket attachment data for the minimal
per-socket data needed to restore hibernated WebSocket sessions. Do not store
secrets, local paths, environment variables, raw backend config, cookies,
storage, tokens, raw HTML, or tool result payloads in bridge metadata.

The exposed-tool snapshot is static for the MVP bridge session.

Implementation notes:

- Keep bridge metadata separate from tool-call state.
- Treat connected bridge records as session records, not durable user data.
- Store only the current exposed-tool snapshot, not full backend config.
- On hibernation/reinitialization, reconstruct bridge routing from Durable
  Object storage plus WebSocket attachment data.
- If restored metadata is incomplete or inconsistent, close the affected bridge
  connection and require the bridge to restart.
- Update heartbeat timestamps from bridge messages, not from ChatGPT-facing tool
  calls.

## Relay Tools

The relay exposes `mikoto.list_bridges`.

It returns only safe metadata:

- bridge id
- bridge OS
- status
- last heartbeat time
- exposed tool names

It must not return secrets, local paths, environment variables, raw backend
config, raw tool arguments, or tool results.

## Tool Routing

Configured backend MCP servers expose their tools by default. The bridge must
not auto-discover arbitrary local MCP servers.

Bridge-exposed tool names are backend-prefixed by default, such as
`codex.codex_chrome_read` or `filesystem.read_file`. Configured aliases such as
`local_chrome_read` may also be exposed.

Do not include bridge names in tool names. Relay-handled tool calls accept
reserved `bridgeId` routing. `bridgeId` may be omitted only when exactly one
connected bridge exposes the requested tool. If multiple connected bridges
expose the requested tool and `bridgeId` is omitted, return a clear ambiguity
error.

The relay strips `bridgeId` before forwarding actual tool arguments to the
selected bridge.

For the MVP, each bridge processes one tool call at a time. If a selected bridge
already has an in-flight call, return a clear bridge-busy error.

Tool calls have a fixed 5-minute wall-clock timeout. Per-tool timeout
configuration is not part of the MVP. If the selected bridge connection is lost
during a call, abort the call with a connection-lost error.

Expected error cases:

- Duplicate bridge id: reject the bridge WebSocket connection.
- Unknown `bridgeId`: return a clear missing-bridge error.
- Missing `bridgeId` with multiple matching bridges: return a clear ambiguity
  error.
- Tool not exposed by selected bridge: return a clear tool-not-found error.
- Bridge already has an in-flight call: return a bridge-busy error.
- Bridge disconnects during a call: return a connection-lost error.
- Tool call exceeds 5 minutes: return a timeout error.

## Local Bridge

The bridge is not a webserver for the MVP.

Responsibilities:

- load project-local configuration
- validate configuration using `packages/protocol`
- resolve `bridge.id`, defaulting to the local computer name
- detect bridge OS for relay metadata
- start backend MCP servers eagerly
- perform backend tool discovery
- expose configured backend tools with backend-prefixed names
- expose configured aliases
- enforce bridge-level policy before routing
- forward calls to backend MCP servers
- attempt backend interruption on timeout where supported
- terminate owned backend processes when the bridge exits

If any configured backend fails to start or fails tool discovery, fail the whole
bridge.

Support relay connection settings from both `mikoto.toml` and environment
variables so tests can target a local relay server.

The bridge should not:

- expose an HTTP server for the MVP
- discover arbitrary local MCP servers
- know about other connected bridges
- implement Codex execution details directly
- implement Discord Bot API behavior directly
- expose raw backend protocol methods as public tools

Startup order:

1. Load `mikoto.toml` and environment overrides.
2. Validate configuration.
3. Resolve `bridge.id` and bridge OS.
4. Start configured backend MCP servers.
5. Discover backend tools.
6. Build exposed tool snapshot.
7. Connect outbound to the relay over WebSocket.
8. Send bridge metadata and tool snapshot.
9. Enter tool-call routing loop.

If any step fails, exit with a non-zero status.

## Backend MCP Transports

The backend MCP server config schema includes both `stdio` and `http`
transports.

Implement `stdio` first. Configured `http` backends should return a clear
unimplemented error until HTTP support lands.

Do not hardcode OS-specific behavior.

## Codex MCP Server

`mikoto-codex-mcp` is a standalone local MCP server. Do not bundle it into the
bridge process.

For the MVP, `mikoto-codex-mcp` launches and owns bounded
`codex exec --json` subprocesses. Codex app-server backed execution is a future
improvement tracked in issue #28.

Codex CLI resolution:

- Prefer `mise x codex@latest -- codex ...`.
- Fall back to `bunx` only when `mise` is unavailable.
- Do not silently choose unrelated global installs before trying the configured
  resolver.

`mikoto-codex-mcp` responsibilities:

- launch Codex CLI through the configured resolver
- run bounded `codex exec --json` tasks
- capture task stdout, stderr, exit status, and timeout state
- map task status into MCP-compatible polling through `codex_check`
- provide safe task templates for Codex tasks
- provide the general-purpose read-only browser read tool
- enforce backend-specific read-only policy
- avoid exposing raw Codex internals as public MCP tools

Expected semantic tools:

- `codex_task`
- `codex_check`
- `codex_chrome_read`

`codex_chrome_read` is general-purpose and read-only. It should accept arbitrary
natural-language read requests, constrained by policy, and return structured
task-oriented results. It should decide an output shape appropriate to the
request. For example, a request to summarize a dashboard may return sections,
counts, and visible labels; a request to inspect notifications may return
visible notification items. The tool should never return raw page internals, raw
HTML, raw DOM dumps, screenshots, cookies, storage, tokens, or broad page dumps.

On timeout, terminate the owned Codex subprocess. Future app-server support
should make a best-effort attempt to interrupt the active Codex turn if
supported.

## Safety And Policy

Enforce policy in both the bridge and backend MCP servers.

Bridge-level policy:

- configured MCP server registry
- configured tool exposure and aliases
- namespace mapping
- URL, origin, and path restrictions where configured
- output filtering
- mutation bans before routing
- policy selection from `mikoto.toml`

Backend-level policy:

- safe Codex task templates
- `@Chrome` read-only prompt constraints
- backend-specific mutation checks
- timeout interruption and approval boundaries
- refusal to expose raw backend protocols as tools

Browser read tools must not click, type, submit, navigate destructively, mutate
state, inspect secrets, or return raw page internals.

Policy is defense in depth. The bridge enforces the external contract before
routing, while each backend enforces backend-specific invariants. Do not move
Codex-specific policy into the bridge just because the first backend is Codex.

For arbitrary natural-language browser read requests, policy must be applied to
the requested target and operation, not only to the final output. If a request
asks for mutation or secret inspection, reject it even if the output could be
filtered later.

## Configuration

Use project-local `mikoto.toml` with schema validation.

Maintain the schema in `packages/protocol`.

Initial config shape should cover:

- bridge id
- relay URL
- backend server id
- backend transport
- backend command
- backend args
- backend working directory
- backend environment
- URL for HTTP backend transports
- tool aliases
- exposure rules
- policy binding

Secrets should not be stored in `mikoto.toml` unless explicitly designed and
documented. Prefer environment variables, Cloudflare secrets, GitHub Actions
secrets, or local secret stores.

Configuration precedence:

1. Environment variables for secrets and test overrides.
2. Project-local `mikoto.toml` for stable non-secret configuration.
3. Built-in defaults for safe local behavior, such as defaulting `bridge.id` to
   the computer name.

Do not add per-user global config in the MVP.

Example categories, not final syntax:

- bridge identity and relay URL
- relay authentication/session settings
- backend server registry
- backend transport settings
- tool exposure rules
- aliases
- policy bindings
- timeout defaults

## Testing

Use Vitest for repository tests.

For Cloudflare Worker relay tests, use `@cloudflare/vitest-pool-workers` so
tests run locally in the Workers runtime through Miniflare/workerd.

Initial tests:

- config schema validation
- relay bridge registration
- duplicate `bridge.id` rejection
- Durable Object bridge metadata persistence/restoration
- tool snapshot routing
- `bridgeId` ambiguity behavior
- bridge-busy behavior
- fixed 5-minute timeout handling
- connection-lost abort behavior
- `http` backend transport returns unimplemented

Avoid browser/Codex end-to-end tests until skeleton protocol and routing
behavior are stable.

Testing split:

- Use ordinary Vitest tests for protocol schemas, config parsing, bridge routing
  logic, and local package utilities.
- Use `@cloudflare/vitest-pool-workers` for Worker, Durable Object, WebSocket,
  hibernation, and relay routing behavior.
- Use local relay test configuration so bridge tests can target a local
  Worker-runtime relay.
- Avoid real Codex app-server, real browser, and real Cloudflare Access in
  initial automated tests.

Do not use Bun's built-in test runner.

## Deployment And CI

The relay is deployed through GitHub Actions.

Accepted deployment paths:

- `cloudflare/wrangler-action`
- raw `wrangler deploy`

Required CI/deploy inputs:

- Cloudflare API token stored in GitHub Actions secrets
- Cloudflare account ID
- Worker name and route configuration
- Durable Object binding configuration
- Cloudflare Access configuration documented separately

Do not use Cloudflare Workers Builds.

CI should run Vitest and any static checks added by the implementation.
Browser/Codex end-to-end tests are intentionally out of scope until the skeleton
is stable.

## Logging

Use stdout logs only for bridge and relay in the MVP.

Persistent logs are not part of the MVP.

Stdout logs should include operational metadata such as component, bridge id,
tool name, status, duration, and error code. Do not log full tool arguments or
full tool results by default.

## Why Split Bridge and codex-mcp?

Benefits:

- `mikoto` remains backend-agnostic.
- Codex is just one local MCP server.
- Additional backend MCP servers can be added without touching Codex
  integration.
- Other MCP clients can use `mikoto-codex-mcp` directly if useful.
- Codex execution details are isolated.
- The bridge can stay small and stable.
- Crash isolation is better.
- Testing is simpler.

Costs:

- One more local process.
- One more MCP boundary.
- Streaming, timeout interruption, approval, and elicitation mapping must pass
  through boundaries.
- Slightly more latency.
- More configuration.

For this project, the benefits outweigh the cost.

## Reference Projects

Use these as references, not as direct replacements:

- `xihuai18/codex-mcp`: community MCP server wrapping Codex app-server.
- `openai/codex-plugin-cc`: official Claude Code plugin using Codex from Claude
  Code; useful as an app-server client reference.
- `getpaseo/paseo`: self-hosted multi-agent orchestrator with daemon, relay,
  clients, and MCP tools.
- Cloudflare Workers and Agents MCP examples: references for Worker/Durable
  Object relay patterns.
- `mcp-proxy` and `supergateway`: transport references for stdio-to-remote MCP
  bridging.
- Docker MCP Gateway: registry/gateway/isolation reference.
- AgentBridge and OpenClaw Codex app-server plugins: Codex bridge references,
  not general-purpose `mikoto` replacements.
