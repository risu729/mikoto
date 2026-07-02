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

The relay needs two different Access protections because the ChatGPT-facing MCP
endpoint and the local bridge endpoint have different callers.

### MCP Endpoint

Create a Cloudflare Access MCP server application for the ChatGPT-facing
Streamable HTTP endpoint.

- Cloudflare service: **Zero Trust Access AI controls MCP servers**.
- HTTP URL: `https://mcp.mikoto.takuk.me/mcp`.
- Authentication: enable **Managed OAuth** for the MCP server application.
- Access policy: allow only the Cloudflare Access users or groups that may add
  the MCP server to ChatGPT.

Use the MCP URL, not only the hostname. Cloudflare's MCP server Access
application flow expects the HTTP URL to include the MCP path.

### Bridge And Health Endpoints

Create a separate Cloudflare Access self-hosted application for the local bridge
WebSocket endpoint and health check.

- Cloudflare service: **Zero Trust Access Applications**.
- Public hostname: `mcp.mikoto.takuk.me`.
- Protected paths:
  - `/bridge*`
  - `/health*`
- Access policy: allow only intended local operators and require the local
  computer to be connected through **Cloudflare One Client** in WARP mode.
- Managed OAuth: leave disabled for this application. The bridge is not an MCP
  OAuth client.

Keep `/bridge*` separate from `/mcp*`. ChatGPT should authenticate to `/mcp`
through Access Managed OAuth, while bridge connections should be limited to
trusted local computers.

The hostname itself is DNS-public when the Worker route exists. Until both
Access applications and policies exist, treat deployed relay paths as
internet-reachable.

### Official References

- [Secure MCP servers with Cloudflare Access][cloudflare-mcp-access]
- [Managed OAuth for self-hosted applications][cloudflare-managed-oauth]
- [Access policies][cloudflare-access-policies]

[cloudflare-access-policies]: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
[cloudflare-managed-oauth]: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
[cloudflare-mcp-access]: https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/

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
