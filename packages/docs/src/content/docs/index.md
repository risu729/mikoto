---
description: What Mikoto is and who it is for.
hero:
  title: Mikoto
  tagline: Connect ChatGPT to explicitly configured local MCP servers without exposing an inbound local HTTP server.
  actions:
    - text: Get Started
      link: /getting-started/
    - text: Cloudflare Setup
      link: /setup/cloudflare/
      variant: secondary
    - text: View on GitHub
      link: https://github.com/risu729/mikoto
      variant: minimal
  image:
    alt: Diagram showing ChatGPT connecting to Mikoto relay, local bridge, and configured local MCPs.
    file: ../../assets/hero-diagram.png
template: splash
title: Overview
---

Mikoto is a gateway between a ChatGPT App and local MCP servers chosen by the
operator. A Cloudflare Worker exposes the remote MCP endpoint, while a local
bridge connects outbound to the relay and routes calls only to backends listed
in `mikoto.toml`.

Because the bridge initiates the connection, the local computer does not need
an inbound HTTP server or public port. Cloudflare Access protects the
ChatGPT-facing endpoint with Managed OAuth and separately restricts bridge
connections to trusted local computers.

## Local Codex Example

The repository includes `mikoto-codex-mcp`, an optional backend that provides
asynchronous read-only Codex tasks and browser reads through the official
`@Chrome` integration. It returns bounded, structured results without exposing
raw HTML, DOM dumps, screenshots, cookies, storage, tokens, or raw Codex
app-server methods.

Codex is one example backend. Mikoto can route tools from other explicitly
configured stdio MCP servers without teaching the bridge their internals.

## Intended Users

- Developers who already use Codex, MCP, Cloudflare, and local automation.
- Operators who want ChatGPT to summarize authenticated or local state without
  broad credential exposure.
- Power users who run multiple local MCP servers and want one ChatGPT-facing
  entrypoint.

## Where To Go Next

- Follow [Get Started](/getting-started/) for the complete path from deployment
  to a first tool call.
- Read [Motivation](/motivation/) for the product framing.
- Read [Architecture](/architecture/) for the relay, bridge, and backend split.
- Read [Configuration](/configuration/) for the published schema and backend
  examples.
- Read [Security](/operations/security/) for the Access and browser-read
  boundaries.
- Browse the [source repository](https://github.com/risu729/mikoto) for local
  development commands and package details.
