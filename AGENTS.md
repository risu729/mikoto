# AGENTS.md

## Project Status

`mikoto` is currently an early-stage design repository. Treat the README and design document as planning artifacts until implementation packages exist.

## Source Of Truth

- Use `README.md` for the concise public project overview.
- Use `design.md` for detailed architecture, package boundaries, MVP scope, and safety policy.
- Treat `design.md` as the maintained architecture source of truth.

## Architecture Guidance

- Use TypeScript on Bun unless the user changes the implementation stack.
- Use Bun's built-in test runner for unit and integration tests.
- For the Cloudflare Worker relay package, use `@cloudflare/vite-plugin` for Worker development/build integration and `@cloudflare/vitest-pool-workers` for Worker-runtime tests via Miniflare/workerd.
- Use Hono for relay HTTP routing on Cloudflare Workers.
- Expose the ChatGPT-facing MCP endpoint with Streamable HTTP. Do not add SSE for the MVP except as future legacy-client compatibility.
- Use the official MCP TypeScript SDK where practical. Avoid hand-rolled MCP JSON-RPC unless bridge proxying or transport behavior requires it.
- Keep `mikoto bridge` backend-agnostic.
- Put Codex app-server integration in `mikoto-codex-mcp`, not in the bridge.
- Keep the bridge and backend MCP servers as separate programs. The bridge may supervise backend processes, but should not bundle `mikoto-codex-mcp` into its own process.
- The bridge should know MCP routing, registry, policy, transport, and output filtering.
- `mikoto-codex-mcp` should launch and own Codex app-server for the MVP, and should know Codex sessions, streaming, approvals, cancellation, and `@Chrome`.
- Prefer launching Codex CLI through `mise x codex@latest -- codex ...`; fall back to `bunx` only when `mise` is unavailable.
- Do not expose raw Codex app-server JSON-RPC through the bridge.
- Enforce policy in both layers: bridge-level routing/output policy plus backend-specific invariants.
- The bridge should connect outbound to the relay over WebSocket during startup. For the MVP, terminate the bridge process if the relay connection is lost; reconnection is a future improvement.
- Protect the relay Worker to local bridge daemon connection with Cloudflare Access. Access should trust intended local computers through Cloudflare WARP.
- Protect the ChatGPT-facing relay endpoint as a Cloudflare Access self-hosted application with Managed OAuth enabled. Do not implement a custom OAuth server in the relay for the MVP.
- Use separate Cloudflare Access applications/policies for the ChatGPT-facing MCP endpoint and local bridge WebSocket endpoint.
- The MVP relay should use a Cloudflare Worker plus Durable Object. The Worker exposes the public endpoint; the Durable Object manages bridge sessions, discovery, and target bridge selection.
- Keep the relay I/O-bound. The 5-minute tool timeout is wall-clock behavior; Cloudflare CPU limits apply to active compute. Use Durable Object WebSocket Hibernation for idle bridge sessions.
- Do not auto-discover arbitrary local MCP servers. Only servers configured in `mikoto.toml` are in scope; expose configured servers' tools by default unless config/policy narrows them.
- Prefix bridge-exposed tool names by backend server, with optional configured aliases.
- If a relay is connected to multiple local bridges, do not include bridge names in tool names. Selection of the target bridge should be explicit in the request, and the relay should provide a discovery tool for available bridges/tools.
- Name the relay discovery tool `mikoto.list_bridges`. It should include bridge id, OS, status, last heartbeat, and exposed tool names, but no secrets, local paths, environment variables, or raw backend config.
- Use `bridge.id` as the only bridge identity field for the MVP. Default it to the local computer name when unset. Reject duplicate connected bridge IDs.
- Relay-handled tool calls should accept reserved `bridgeId` routing. `bridgeId` may be omitted only when exactly one connected bridge exposes the requested tool; otherwise return a clear ambiguity error.
- On connect, a bridge should push a snapshot of exposed tools to the relay. Keep it static for the MVP session; dynamic MCP add/remove and tool refresh are future improvements.
- Process one tool call at a time per bridge for the MVP. Return a clear bridge-busy error for concurrent calls.
- Use a fixed 5-minute max tool-call timeout for the MVP. Per-tool timeout config is future work.
- If the relay loses the selected bridge connection during an MCP tool call, abort the tool call and return a clear connection-lost error.
- Use stdout logs only for bridge and relay in the MVP. Persistent logging is future work and should account for sensitive arguments/results.
- Keep multi-bridge awareness in the relay only. A bridge should not know that other bridges exist.
- Avoid OS-specific assumptions in the first implementation. Support direct local backend MCP server configuration first; leave WSL and remote launch modes as explicit future registry options.
- The bridge should not expose an HTTP server for the MVP; it connects outbound to the relay over WebSocket.
- Include both `stdio` and `http` backend transports in the config schema. Implement `stdio` first; return a clear unimplemented error for `http` until support lands.
- Start configured backend MCP servers eagerly when the bridge starts. Fail the whole bridge if any configured backend startup or tool discovery fails.
- Prefer project-local `mikoto.toml` configuration with schema validation for the MVP. Global user config can be added later as a layered source.
- Support relay connection settings from both `mikoto.toml` and environment variables so tests can target a local relay server.

## MVP Constraints

The first MVP example is read-only GitHub notification inspection through:

```text
ChatGPT App
→ Cloudflare MCP relay
→ mikoto bridge
→ mikoto-codex-mcp
→ codex app-server
→ official @Chrome
→ GitHub notifications
```

The ChatGPT-visible tool is `local_chrome_read`.

The backend Codex MCP tool can be `codex_chrome_read`.

GitHub notifications are the first concrete policy example, not the only future use case for read-only Chrome tasks.

For the MVP, enforce:

- Only `https://github.com/notifications`.
- Maximum 5 visible rows.
- No clicking, typing, submitting, marking as read, archiving, unsubscribing, or other mutation.
- No cookie, token, local storage, session storage, or secret inspection.
- Chrome read tools should return structured task-oriented data, not raw HTML, raw DOM dumps, screenshots, storage, or broad page dumps.
- `local_chrome_read` may accept arbitrary natural-language read requests, but policy still constrains allowed origins/paths, output limits, secret access, and mutation behavior.

## Contribution Guidance

- Prefer small, focused changes.
- Avoid introducing runtime dependencies before an implementation package exists.
- Avoid browser/Codex end-to-end tests until skeleton protocol and routing behavior are stable.
- Preserve the bridge/Codex separation unless the user explicitly changes the design.
- Document unresolved architectural decisions instead of silently choosing broad behavior.
- Keep README content in English.
