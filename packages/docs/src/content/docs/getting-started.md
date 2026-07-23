---
description: Deploy Mikoto, connect a local bridge, and make a first tool call from ChatGPT.
title: Get Started
---

This guide connects a ChatGPT App to one or more explicitly configured local
MCP servers through a deployed Mikoto relay. The local bridge makes an outbound
WebSocket connection; it does not open an inbound HTTP server on the local
computer.

## Prerequisites

You need:

- a Cloudflare account and a domain managed by Cloudflare;
- permission to create Workers, Durable Objects, Custom Domains, and Access
  applications;
- a GitHub repository with Actions enabled for the supported production
  deployment path;
- [mise](https://mise.jdx.dev/) on the computer that will run the bridge;
- access to ChatGPT custom app creation;
- at least one local stdio MCP server.

The bundled configuration uses `mikoto-codex-mcp` as the backend. To use it,
install and sign in to Codex locally. Browser reads also require the official
`@Chrome` integration to be available to that Codex installation.

## 1. Prepare The Repository

Clone or fork [the Mikoto repository](https://github.com/risu729/mikoto), then
install the pinned tools and dependencies:

```console
mise install
mise deps
```

Choose three hostnames:

- a documentation hostname;
- an MCP hostname for ChatGPT;
- a bridge hostname for local bridge and health traffic.

The checked-in Wrangler files use `mikoto.takuk.me`,
`mcp.mikoto.takuk.me`, and `bridge.mikoto.takuk.me`. Replace those example
custom domains in `packages/docs/wrangler.jsonc` and
`packages/relay/wrangler.jsonc` when deploying under another domain.

## 2. Configure Cloudflare And Deploy

Create two separate Cloudflare Access applications before sending real traffic
through the relay:

- an MCP server application with Managed OAuth on the MCP hostname;
- a self-hosted, WARP-restricted application on the bridge hostname.

The exact application settings and ChatGPT redirect URI are documented in
[Cloudflare Setup](/setup/cloudflare/). Keeping the hostnames separate prevents
the ChatGPT OAuth login from being mistaken for the bridge's private-app flow.

Add these GitHub Actions settings to the deployment repository:

- repository variable `CLOUDFLARE_ACCOUNT_ID`;
- repository secret `CLOUDFLARE_API_TOKEN`.

The required token scope is documented under
[GitHub Actions Inputs](/setup/cloudflare/#github-actions-inputs). A push to
`main` deploys the documentation and relay Workers through GitHub Actions. See
[Deployment](/operations/deployment/) for preview and production behavior.

Confirm that the bridge health endpoint is reachable from a computer allowed by
the bridge Access policy:

```console
curl https://bridge.example.com/health
```

Replace `bridge.example.com` with the configured bridge hostname.

## 3. Configure The Local Bridge

Copy the repository example:

```console
cp mikoto.example.toml mikoto.toml
```

For a deployed relay, set the WebSocket URL to the protected bridge hostname:

```toml
[relay]
url = "wss://bridge.example.com/bridge"
```

The example starts the bundled Codex MCP backend over stdio:

```toml
[[servers]]
id = "codex"
transport = "stdio"
command = "bun"
args = ["packages/codex-mcp/src/index.ts"]
```

Only servers in this file are started or exposed. Review
[Configuration](/configuration/) before adding another backend, changing its
environment, or creating a tool alias.

## 4. Start The Bridge

Connect the computer to Cloudflare One Client in WARP mode, then run:

```console
mise //packages/bridge:run
```

The bridge starts every configured backend, discovers its tools, connects
outbound to the relay, and sends a static tool snapshot. Startup fails if any
configured backend cannot start or complete tool discovery.

Keep this process running while ChatGPT uses local tools. The current bridge
exits if its relay WebSocket disconnects; restart it to reconnect.

## 5. Add The ChatGPT App

Create a custom ChatGPT App with:

- connection type **Server URL**;
- the MCP hostname root, such as `https://mcp.example.com/`;
- authentication type **OAuth**.

Complete settings and troubleshooting steps are under
[ChatGPT App Setup](/setup/cloudflare/#chatgpt-app-setup). After creation,
select **Sign in with Mikoto** and complete the Cloudflare Access login.

## 6. Make A First Tool Call

Ask ChatGPT:

> Use Mikoto to list the connected bridges and their available tools.

ChatGPT calls `mikoto_list_bridges`. The result should include the configured
bridge and backend-prefixed tool names. With the example config, Codex tools
start with `codex.` and the browser-start alias
`local_chrome_read_start` is also available.

For a browser read, ask:

> Use Mikoto to start `local_chrome_read_start` with the request "Summarize the
> current browser page." Poll the returned `task.id` with
> `codex.codex_run_status`, then retrieve the completed result with
> `codex.codex_run_result`.

The start tool accepts `request` and returns a task snapshot. Pass its `task.id`
as the `taskId` input to the status and result tools. ChatGPT invokes each
backend tool through `mikoto_call_tool`; backend tools are not registered as
separate ChatGPT-facing native tools.

If multiple bridges expose the selected tool, ChatGPT must pass the chosen
`bridgeId` to `mikoto_call_tool`. A bridge handles one call at a time, so an
overlapping call receives a `bridge_busy` error and should be retried after the
active call finishes.

## Local Development

To test routing without deploying Cloudflare, start the relay and bridge from
the repository root in separate terminals:

```console
mise //packages/relay:dev
```

```console
mise //packages/bridge:run
```

The example configuration already points to
`ws://localhost:8787/bridge`. The local MCP endpoint is
`http://localhost:8787/`, but ChatGPT cannot connect directly to a service on
your local computer; use the deployed path for the ChatGPT integration.
