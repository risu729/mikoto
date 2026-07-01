---
description: Install dependencies and start mikoto locally.
title: Getting Started
---

## Prerequisites

- Bun
- mise
- Wrangler, provided through mise
- Codex CLI available through `mise x codex@latest -- codex ...` for Codex
  backend tasks

## Install

Install the repository toolchain and dependencies:

```sh
mise trust
mise install
bun install --frozen-lockfile
```

Create a local config:

```sh
cp mikoto.example.toml mikoto.toml
```

The example config connects the bridge to `ws://localhost:8787/bridge`, starts
`@mikoto/codex-mcp` as a stdio backend, exposes backend-prefixed tools such as
`codex.codex_task` and `codex.codex_chrome_read`, and adds the
`local_chrome_read` alias.

## First Local Run

Run the local relay in one shell:

```sh
mise //packages/relay:dev
```

Run the bridge in another shell:

```sh
mise //packages/bridge:run
```

Then inspect connected bridges through the local MCP endpoint:

```sh
curl -s http://localhost:8787/mcp \
  -H 'content-type: application/json' \
  -H 'accept: application/json, text/event-stream' \
  -H 'mcp-protocol-version: 2025-06-18' \
  --data '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "mikoto_list_bridges",
      "arguments": {}
    }
  }'
```
