---
description: Codex backend MCP server behavior and safety model.
title: Codex MCP
---

`mikoto-codex-mcp` is a standalone local MCP server. It is deliberately separate
from the bridge so Codex remains one backend rather than the whole gateway.

## Responsibilities

`mikoto-codex-mcp`:

- launches and owns a local Codex app-server process;
- creates a fresh Codex thread for each MCP tool call;
- runs bounded app-server turns;
- returns one final normalized JSON result;
- interrupts active turns on timeout where supported;
- exposes backend-specific safe tools instead of raw app-server JSON-RPC.

Expected tools:

- `codex_task`: run a bounded read-only Codex task.
- `codex_chrome_read`: run a bounded read-only browser read request through
  Codex and the official `@Chrome` integration.

## Browser Reads

`codex_chrome_read` accepts natural-language read requests and returns
structured, task-oriented information. It exists so ChatGPT can ask questions
about an allowed local browser context, including existing browser sessions,
without receiving raw browser internals.

Browser read tools must not:

- click, type, submit, navigate destructively, or mutate state;
- inspect cookies, tokens, local storage, session storage, or other secrets;
- return raw HTML, raw DOM dumps, screenshots, storage contents, or broad page
  dumps.

## Boundary

Codex-specific execution details stay in `mikoto-codex-mcp`, not in the bridge.
This keeps the bridge backend-agnostic and lets other MCP clients use the Codex
backend directly if useful.

Run, generation, and compile commands live in the
[`packages/codex-mcp` README][codex-mcp-readme].

[codex-mcp-readme]: https://github.com/risu729/mikoto/blob/main/packages/codex-mcp/README.md
