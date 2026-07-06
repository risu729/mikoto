# @mikoto/codex-mcp

Standalone MCP server that exposes Codex as an asynchronous fire-poll tool
surface for MCP clients.

The server does not expose synchronous Codex execution tools. Start tools return
a task id quickly, shared run lifecycle tools return running state, partial
normalized output, completed output, or request interruption of the underlying
Codex app-server turn.

The browser-read flow is:

1. `codex_chrome_read_start`
2. `codex_run_status`
3. `codex_run_result`
4. `codex_run_cancel` when interruption is needed

The generic task flow uses `codex_task_start`, then the same `codex_run_*`
lifecycle tools.

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
