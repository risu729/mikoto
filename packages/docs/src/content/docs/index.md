---
description: What Mikoto is and who it is for.
hero:
  title: Mikoto
  tagline: An early-stage local MCP gateway for using ChatGPT with explicitly configured local MCP servers through a Cloudflare relay.
  actions:
    - text: Why Mikoto
      link: /motivation/
    - text: Cloudflare Setup
      link: /setup/cloudflare/
      variant: secondary
  image:
    alt: Diagram showing ChatGPT connecting to Mikoto relay, local bridge, and configured local MCPs.
    file: ../../assets/hero-diagram.png
template: splash
title: Overview
---

The MVP goal is a general-purpose, read-only Codex browser read tool. ChatGPT
should be able to ask for structured information from an allowed local browser
context through bounded Codex CLI tasks and the official `@Chrome` integration,
without direct browser control, raw HTML or DOM access, cookies, storage,
tokens, or raw Codex internals.

## Status

The repository has an early local development path for the relay, bridge, and
Codex MCP server. The docs and relay production deployment paths are managed by
GitHub Actions.

## Intended Users

- Developers who already use Codex, MCP, Cloudflare, and local automation.
- Operators who want ChatGPT to summarize authenticated or local state without
  broad credential exposure.
- Power users who run multiple local MCP servers and want one ChatGPT-facing
  entrypoint.

## Where To Go Next

- Read [Motivation](/motivation/) for the product framing.
- Read [Architecture](/architecture/) for the relay, bridge, and backend split.
- Read [Cloudflare Setup](/setup/cloudflare/) for deployed relay prerequisites.
- Read [Security](/operations/security/) for the Access and browser-read
  boundaries.

Local development commands live in the repository and package `README.md`
files. These docs focus on durable product, setup, and operations guidance.
