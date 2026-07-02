---
description: Cloudflare services and settings needed for a deployed Mikoto relay.
title: Cloudflare Setup
---

This page covers only Cloudflare setup for a deployed relay. Local development
commands live in the root and package `README.md` files.

## Services

Mikoto uses these Cloudflare services:

- **Workers** for the relay Worker.
- **Durable Objects** for bridge/session coordination.
- **Workers Custom Domains** for production hostnames. In Wrangler config these
  are represented as `routes` entries with `custom_domain: true`.
- **Cloudflare Access** self-hosted applications, policies, and Managed OAuth.
- **Cloudflare One Client** in WARP mode for local computers that may connect
  to bridge-only endpoints.

Cloudflare Workers Builds are not used. Deployments are performed by GitHub
Actions through Wrangler.

## Hostnames

Production hostnames are configured as Wrangler custom-domain routes:

- `mikoto.takuk.me`: docs Worker.
- `mcp.mikoto.takuk.me`: relay Worker.

The relay production `workers.dev` route is disabled. The custom domain is the
production entrypoint.

## Access Applications

Create Cloudflare Access protection for the relay hostname before using a
deployed relay for real traffic.

Required Access coverage:

- `mcp.mikoto.takuk.me/mcp*`: Cloudflare Access self-hosted application with
  Managed OAuth enabled for the ChatGPT-facing Streamable HTTP MCP endpoint.
- `mcp.mikoto.takuk.me/bridge*`: separate Cloudflare Access policy restricted
  to intended local computers through Cloudflare One Client/WARP.
- `mcp.mikoto.takuk.me/health*`: same WARP-only policy as the bridge endpoint.

The hostname itself is DNS-public when the Worker route exists. The intended
security boundary is Cloudflare Access on the protected paths.

## GitHub Actions Inputs

GitHub Actions needs:

- Repository variable `CLOUDFLARE_ACCOUNT_ID`.
- Repository secret `CLOUDFLARE_API_TOKEN`.

Minimum Cloudflare API token permissions for the current docs and relay
deployments:

- Account `risu`: `Workers Scripts: Edit`.
- Zone `takuk.me`: `Workers Routes: Edit`.
- Zone `takuk.me`: `DNS: Edit`.

The relay Worker does not currently require runtime Worker secrets or GitHub
environment variables beyond `CLOUDFLARE_ACCOUNT_ID`.

Do not store Cloudflare API tokens in repository files or local config.
