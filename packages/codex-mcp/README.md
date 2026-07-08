# @mikoto/codex-mcp

Standalone MCP server that exposes Codex as an asynchronous fire-and-poll tool
surface for MCP clients. Tools are started and their progress and results are
retrieved through later polling calls.

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

## Codex Command Selection

By default, the server resolves `codex` from `PATH`, then falls back to `mise x`
and `bunx`. Set `MIKOTO_CODEX_COMMAND` to use a specific Codex executable.

When running the MCP server in WSL but using Windows Codex and Chrome, point the
command at the Windows `codex.exe` through `/mnt/c` and set a Windows-backed
working directory:

```console
MIKOTO_CODEX_COMMAND=/mnt/c/path/to/codex.exe \
MIKOTO_CODEX_COMMAND_CWD=/mnt/c/Users/me \
mise //packages/codex-mcp:run
```

The cwd matters because Windows Codex receives it as the app-server process
working directory. A WSL repository cwd may become a UNC path that Windows
sandboxed command execution cannot use reliably.

To regenerate the local reference copy of the Codex app-server protocol:

```console
mise //packages/codex-mcp:generate-app-server-types
```
