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
- Access application name: `mikoto mcp`.
- MCP server ID: `mikoto`.
- HTTP URL: `https://mcp.mikoto.takuk.me/mcp`.
- Authentication: enable **Managed OAuth** for the MCP server application.
- Managed OAuth Dynamic Client Registration allowed redirect URIs:
  - `https://chatgpt.com/connector/oauth/*`
- Access policy: allow only the Cloudflare Access users or groups that may add
  the MCP server to ChatGPT. The current Cloudflare account uses the reusable
  `mikoto mcp users` policy, which allows `risunosu.com` email addresses and
  does not require Gateway/WARP.
- Application AUD tag:
  `9134ab1917929a84cdadc263a15be177c3746e309d0b081cc337379b488f96fb`.

Use the MCP URL, not only the hostname. Cloudflare's MCP server Access
application flow expects the HTTP URL to include the MCP path.

The ChatGPT redirect URI wildcard is required for OpenAI's ChatGPT Apps OAuth
flow. When a user connects the custom app, ChatGPT dynamically registers an
OAuth client with Cloudflare Access and supplies a callback URL under
`https://chatgpt.com/connector/oauth/`. Cloudflare rejects the registration with
`invalid_client_metadata` unless that callback is allowed in Managed OAuth's
Dynamic Client Registration settings.

### ChatGPT App Setup

After the Cloudflare MCP application is ready, add Mikoto as a custom ChatGPT
app:

1. Open ChatGPT.
2. Go to **Apps**.
3. Select **Manage** to open **Settings > Apps**.
4. Scroll to **Advanced settings**.
5. Select **Create app**.
6. Fill in:
   - Name: `Mikoto`
   - Description: `Access Mikoto MCP tools through the Cloudflare-protected relay.`
   - Connection: **Server URL**
   - Server URL: `https://mcp.mikoto.takuk.me/mcp`
   - Authentication: **OAuth**
7. Open **Advanced OAuth settings** and confirm that Dynamic Client
   Registration is available. Cloudflare Managed OAuth should advertise:
   - Authorization URL:
     `https://risu729.cloudflareaccess.com/cdn-cgi/access/oauth/authorization`
   - Token URL:
     `https://risu729.cloudflareaccess.com/cdn-cgi/access/oauth/token`
   - Registration URL:
     `https://risu729.cloudflareaccess.com/cdn-cgi/access/oauth/registration`
   - Resource: `https://mcp.mikoto.takuk.me/mcp`
8. Check **I understand and want to continue**.
9. Select **Create**.
10. Select **Sign in with Mikoto** and complete the Cloudflare Access login.

If ChatGPT reports `Dynamic client registration failed` with
`redirect_uri is not allowed by the account configuration`, re-open the
`mikoto mcp` Access application in Cloudflare, go to **Advanced settings >
Managed OAuth**, and verify that
`https://chatgpt.com/connector/oauth/*` is present in **Allowed redirect URIs**.

If Cloudflare Access reports `Unable to find your Access application!` after
entering the one-time PIN, check whether the browser is connected through
Cloudflare One Client in WARP/Gateway mode. The observed failure mode includes
`private_app_flow: 1` in the Access login metadata, which means Cloudflare is
treating the ChatGPT OAuth login as a private application flow instead of the
public MCP Managed OAuth flow. As a temporary workaround, disconnect WARP before
starting **Sign in with Mikoto**, complete the ChatGPT OAuth connection, then
re-enable WARP for bridge usage. This should be fixed in the future so ChatGPT
OAuth login does not require temporarily leaving WARP.

### Bridge And Health Endpoints

Create a separate Cloudflare Access self-hosted application for the local bridge
WebSocket endpoint and health check.

- Cloudflare service: **Zero Trust Access Applications**.
- Access application name: `mikoto bridge`.
- Public hostname: `mcp.mikoto.takuk.me`.
- Protected paths:
  - `/bridge*`
  - `/health*`
- Access policy: allow only intended local operators and require the local
  computer to be connected through **Cloudflare One Client** in WARP mode.
  The current Cloudflare account uses the reusable `default` policy for this,
  backed by the `default` rule group that allows `risunosu.com` email addresses
  and requires Gateway/WARP.
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
- [OpenAI Apps SDK authentication][openai-apps-auth]
- [Access policies][cloudflare-access-policies]
- [Access application tokens][cloudflare-application-token]

[cloudflare-access-policies]: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/
[cloudflare-application-token]: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/application-token/
[cloudflare-managed-oauth]: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/managed-oauth/
[cloudflare-mcp-access]: https://developers.cloudflare.com/cloudflare-one/access-controls/ai-controls/secure-mcp-servers/
[openai-apps-auth]: https://developers.openai.com/apps-sdk/build/auth

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
