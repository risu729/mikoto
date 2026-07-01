# @mikoto/codex-mcp

Standalone MCP server that exposes Codex as a small tool surface for MCP
clients.

This implementation includes:

- `codex_task`: run a bounded read-only Codex task and return the final
  normalized result.
- `codex_chrome_read`: run a bounded read-only browser request through Codex and
  `@Chrome`, then return the final normalized result.

`mikoto-codex-mcp` launches and owns `codex app-server` over stdio when the MCP
server starts. Tool calls create fresh Codex threads on that owned app-server
and return one final JSON result. The public tool API does not expose raw
app-server JSON-RPC.

Both tools run with restrictive app-server defaults: read-only sandbox,
`never` approval policy, and a maximum 5-minute timeout. `codex_task` uses
GPT-5.5 with medium reasoning. `codex_chrome_read` uses GPT-5.5 with low
reasoning. These defaults are currently hard-coded.

`codex_chrome_read` uses a prompt template that instructs Codex to use read-only
browser access, avoid writes or lasting changes, and avoid returning raw HTML,
raw DOM, screenshots, cookies, storage, tokens, and secrets. Navigation or
interaction is allowed only when required to read the requested information.

Tool responses are JSON text content with this shape:

```json
{
  "ok": true,
  "finalText": "...",
  "status": "completed",
  "threadId": "...",
  "turnId": "...",
  "durationMs": 1234,
  "items": [],
  "warnings": []
}
```

## Run

From the repository root:

```sh
mise //packages/codex-mcp:run
```

The server uses stdio, so MCP clients should start it as a local command. At
startup it resolves Codex with `mise x codex@latest -- codex` when `mise` is
available, and falls back to `bunx codex@latest`.

To regenerate the local reference copy of the Codex app-server protocol:

```sh
mise //packages/codex-mcp:generate-app-server-types
```

The generated files are written to `.generated/codex-app-server` and are not
committed. The generation task resolves `codex@latest`. The checked-in
app-server protocol types are a small hand-written subset derived from
`codex app-server generate-ts` using
`@openai/codex@0.142.4`.

## Compile

From the repository root:

```sh
mise //packages/codex-mcp:compile --target linux-x64
mise //packages/codex-mcp:compile --target windows-x64
```

This creates single-file Bun executables in `dist/`:

- `codex-mcp-app-linux-x64`
- `codex-mcp-app-windows-x64.exe`

## Reference

The initial design was informed by reading
[`xihuai18/codex-mcp`](https://github.com/xihuai18/codex-mcp), especially its
use of the official MCP SDK and app-server oriented execution. This package is
an independent implementation scoped to Mikoto and does not copy code from that
project.
