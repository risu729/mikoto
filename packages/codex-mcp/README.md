# @mikoto/codex-mcp

Standalone MCP server that exposes Codex as an asynchronous fire-poll tool
surface for MCP clients.

The server does not expose synchronous Codex execution tools. Start tools return
a task id quickly, status tools return running state and partial normalized
output, result tools return completed output, and cancel tools request
interruption of the underlying Codex app-server turn.

The browser-read flow is:

1. `codex_chrome_read_start`
2. `codex_chrome_read_status`
3. `codex_chrome_read_result`
4. `codex_chrome_read_cancel` when interruption is needed

The generic task flow mirrors the same shape with `codex_task_*` tools.

## Local Development

From the repository root:

```console
mise //packages/codex-mcp:run
```

The server uses stdio, so MCP clients should start it as a local command.

To regenerate the local reference copy of the Codex app-server protocol:

```console
mise //packages/codex-mcp:generate-app-server-types
```
