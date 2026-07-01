---
description: What mikoto is and who it is for.
hero:
  title: mikoto
  tagline: An early-stage local MCP gateway for using ChatGPT with explicitly configured local MCP servers through a Cloudflare relay.
  actions:
    - text: Get Started
      link: /getting-started/
    - text: View Architecture
      link: /architecture/
      variant: secondary
  image:
    alt: Diagram showing ChatGPT connecting to mikoto relay, local bridge, and configured local MCPs.
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
Codex MCP server. The public deployment path is still incomplete.

## Intended Users

- Developers who already use Codex, MCP, Cloudflare, and local automation.
- Operators who want ChatGPT to summarize authenticated or local state without
  broad credential exposure.
- Power users who run multiple local MCP servers and want one ChatGPT-facing
  entrypoint.

## Safety Model

The browser-read tool is general-purpose but read-only.

Browser read tools must not:

- Click, type, submit, navigate destructively, or mutate state.
- Inspect cookies, tokens, local storage, session storage, or other secrets.
- Return raw HTML, raw DOM dumps, screenshots, storage contents, or broad page
  dumps.

Tools should return structured, task-oriented data for the request.
