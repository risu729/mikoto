# AGENTS.md

## General

- Always write documentation, comments, commit messages, and PR text in English.
- Keep changes small and focused.
- Prefer modern, well-maintained libraries when they provide a clearer or more
  reliable abstraction than low-level Node.js APIs.
- Use `README.md` for the public project overview and root local development
  commands.
- Use package `README.md` files for package-specific local development commands.
- Use `packages/docs` for durable non-development documentation, including
  motivation, architecture, Cloudflare setup, component behavior, deployment,
  security, and limitations.
- Do not reintroduce `design.md`. Keep design decisions concrete in code,
  README files, docs pages, issues, or PR descriptions.

## Architecture

- `mikoto` uses TypeScript on Bun.
- Use the official MCP TypeScript SDK where practical.
- Use Vitest for tests. For Cloudflare Worker tests, use
  `@cloudflare/vitest-pool-workers`.
- Use Hono for relay HTTP routing on Cloudflare Workers.
- Expose the ChatGPT-facing MCP endpoint with Streamable HTTP only. Do not add
  SSE support.
- The local bridge connects outbound to the relay over WebSocket and does not
  expose an HTTP server for the MVP.
- Keep `mikoto bridge`, backend MCP servers, and `mikoto-codex-mcp` as separate
  programs.
- Keep Codex app-server logic in `mikoto-codex-mcp`, not in the bridge.
- Do not expose raw Codex app-server JSON-RPC through the bridge.
- Only configured local MCP servers are in scope. Do not auto-discover arbitrary
  local MCP servers.

## MVP Behavior

- `mikoto-codex-mcp` should provide a general-purpose read-only Codex browser
  read tool, not a GitHub-notifications-only tool.
- Browser read tools may accept arbitrary natural-language read requests, but
  must remain read-only and must not expose raw HTML, raw DOM dumps,
  screenshots, cookies, storage, tokens, or broad page dumps.
- Backend MCP servers start eagerly when the bridge starts. Fail the whole
  bridge if any configured backend fails startup or tool discovery.
- The bridge pushes a static tool snapshot to the relay when it connects.
- The relay stores connected bridge metadata in its Durable Object state and
  uses WebSocket attachment data needed to restore hibernated connections.
- Process one tool call at a time per bridge. Return a clear bridge-busy error
  for concurrent calls.
- Use a fixed 5-minute max tool-call timeout.
- If the relay loses the selected bridge connection during a tool call, abort
  the call with a clear connection-lost error.
- Use stdout logs only for bridge and relay in the MVP.

## Cloudflare

- Protect the ChatGPT-facing relay endpoint with Cloudflare Access Managed
  OAuth.
- Protect the local bridge WebSocket endpoint with a separate Cloudflare Access
  policy that trusts intended local computers through Cloudflare One
  Client/WARP.
- Deploy the relay through GitHub Actions using raw `wrangler` commands with a
  Cloudflare API token.
- Do not use Cloudflare Workers Builds for this repository.

## Commit Messages

- Use conventional commits.
- Prefer concise subjects such as `docs: update relay design`,
  `feat(bridge): add config loader`, or
  `fix(relay): reject duplicate bridge ids`.
- Use scopes when they clarify ownership: `bridge`, `relay`, `codex-mcp`,
  `protocol`, `docs`, `ci`.
- Use the same convention for PR titles. Do not add tool or agent prefixes such
  as `[codex]`.
- Do not add AI attribution footers.
