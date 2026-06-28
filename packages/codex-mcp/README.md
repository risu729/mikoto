# @mikoto/codex-mcp

Standalone MCP server that exposes Codex as a small tool surface for MCP
clients.

This implementation includes:

- `codex_task`: start a bounded Codex CLI task.
- `codex_check`: check task status and retrieve captured stdout/stderr.
- `codex_chrome_read`: start a bounded read-only browser request through Codex
  and `@Chrome`.

`codex_chrome_read` returns a task id like `codex_task`; use `codex_check` to
poll for completion. The prompt template instructs Codex to use read-only
browser access, avoid writes or lasting changes, and avoid returning raw HTML,
raw DOM, screenshots, cookies, storage, tokens, and secrets. Navigation or
interaction is allowed only when required to read the requested information.

## Run

From the repository root:

```sh
mise run codex-mcp
```

The server uses stdio, so MCP clients should start it as a local command. During
task execution it resolves Codex with `mise x codex@latest -- codex` when `mise`
is available, and falls back to `bunx codex`.

## Reference

The initial design was informed by reading
[`xihuai18/codex-mcp`](https://github.com/xihuai18/codex-mcp), especially its
use of the official MCP SDK and a `codex_check` polling pattern. This package is
an independent implementation scoped to Mikoto's smaller first PR and does not
copy code from that project.
