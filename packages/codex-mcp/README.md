# @mikoto/codex-mcp

Standalone MCP server that exposes Codex as a small tool surface for MCP
clients.

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
