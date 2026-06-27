# @mikoto/codex-mcp

Standalone MCP server that exposes Codex as a small tool surface for MCP
clients.

This first implementation intentionally includes only non-Chrome tools:

- `codex_task`: start a bounded Codex CLI task.
- `codex_check`: check task status and retrieve captured stdout/stderr.

`codex_chrome_read` is planned for a later PR.

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
