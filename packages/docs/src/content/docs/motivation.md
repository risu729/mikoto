---
description: Why mikoto exists and what problem it is meant to solve.
title: Motivation
---

`mikoto` exists to connect ChatGPT to explicit local capabilities without
turning those capabilities into a broad remote control surface.

The motivating use cases are practical:

- Avoid Codex rate limits for work that ChatGPT can delegate to a local Codex
  environment.
- Use Codex-only features from ChatGPT, such as browser reads through an
  existing local browser session.
- Run commands in a local or non-ChatGPT container environment that can reach
  the internet or private networks available to that machine.
- Use persistent local files and state. ChatGPT's own execution environments are
  useful for scratch work, but long-lived project files, configured tools, and
  authenticated sessions are easier to manage locally.
- Reach configured local MCP servers from one ChatGPT-facing endpoint.

## Different From Oracle

[`oracle`](https://github.com/steipete/oracle) solves a useful opposite
workflow: from Codex or another local agent, bundle a prompt and files so a
stronger external model such as ChatGPT Pro can review or answer with context.
It can use APIs, browser automation, a Codex skill, and MCP integration for
that consultation flow.

`mikoto` is for the other direction. It lets ChatGPT reach explicitly configured
local tools, browser sessions, commands, and MCP servers through a controlled
relay. The relay should expose bounded tool results and safe metadata, not raw
local state. The operator chooses which local backends exist, which tools are
exposed, and which Cloudflare Access policies protect the remote entrypoints.

## Design Direction

The project intentionally keeps three boundaries separate:

- The relay owns remote MCP and bridge-session routing.
- The bridge owns local backend discovery and tool routing.
- Backend MCP servers, such as `mikoto-codex-mcp`, own backend-specific
  execution and safety rules.

This keeps Codex as one backend rather than the whole system. Other local MCP
servers can be configured without making the bridge understand their internals.
