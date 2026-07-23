---
description: Cloudflare services and settings needed for a deployed Mikoto relay.
title: Cloudflare Setup
---

This page covers only Cloudflare setup for a deployed relay. Local development
commands live in the root and package `README.md` files. The hostnames and
account-specific names below describe the project deployment; substitute the
custom domains, Access team domain, policies, and account names chosen for
another deployment.

Follow [Get Started](/getting-started/) for the surrounding repository, bridge,
and ChatGPT configuration steps.

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
- `mcp.mikoto.takuk.me`: relay Worker for ChatGPT-facing MCP traffic.
- `bridge.mikoto.takuk.me`: same relay Worker for local bridge and health
  traffic.

The relay production `workers.dev` route is disabled. The relay uses one Worker
served through two custom domains so Cloudflare Access can keep ChatGPT Managed
OAuth separate from WARP-restricted bridge authentication.

## Access Applications

Create Cloudflare Access protection for the relay hostnames before using a
deployed relay for real traffic.

The relay needs two different Access protections because the ChatGPT-facing MCP
endpoint and the local bridge endpoint have different callers.

Use separate hostnames for the two protections. Sharing one hostname and only
splitting by path can make Cloudflare Access select a WARP/private-app flow
during ChatGPT Managed OAuth login when the operator's browser is connected
through WARP/Gateway.

### MCP Endpoint

Create a Cloudflare Access MCP server application for the ChatGPT-facing
Streamable HTTP endpoint.

- Cloudflare service: **Zero Trust Access AI controls MCP servers**.
- Access application name: `mikoto mcp`.
- MCP server ID: `mikoto`.
- HTTP URL: `https://mcp.mikoto.takuk.me/`.
- Authentication: enable **Managed OAuth** for the MCP server application.
- Managed OAuth Dynamic Client Registration allowed redirect URIs:
  - `https://chatgpt.com/connector/oauth/*`
- Access policy: allow only the Cloudflare Access users or groups that may add
  the MCP server to ChatGPT. The current Cloudflare account uses the reusable
  `mikoto mcp users` policy, which allows `risunosu.com` email addresses and
  does not require Gateway/WARP.
- Application AUD tag: record the generated value for troubleshooting.

Use a hostname dedicated to the MCP server and serve the MCP endpoint at the
hostname root. Cloudflare Access one-time-code verification URLs carry the
target hostname but not the MCP path, so path-scoped MCP applications can fail
after email submission with `Unable to find your Access application!`.

Do not require Cloudflare One Client, WARP, or Gateway for this application.
After OAuth completes, ChatGPT is the caller of the MCP endpoint and cannot
satisfy a local device/WARP policy.

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
   - Description:
     `Access Mikoto MCP tools through the Cloudflare-protected relay.`
   - Connection: **Server URL**
   - Server URL: `https://mcp.mikoto.takuk.me/`
   - Authentication: **OAuth**
7. Open **Advanced OAuth settings** and confirm that Dynamic Client
   Registration is available. Cloudflare Managed OAuth should advertise:
   - Authorization URL:
     `https://risu729.cloudflareaccess.com/cdn-cgi/access/oauth/authorization`
   - Token URL:
     `https://risu729.cloudflareaccess.com/cdn-cgi/access/oauth/token`
   - Registration URL:
     `https://risu729.cloudflareaccess.com/cdn-cgi/access/oauth/registration`
   - Resource: `https://mcp.mikoto.takuk.me/`
8. Check **I understand and want to continue**.
9. Select **Create**.
10. Select **Sign in with Mikoto** and complete the Cloudflare Access login.

If ChatGPT reports `Dynamic client registration failed` with
`redirect_uri is not allowed by the account configuration`, re-open the
`mikoto mcp` Access application in Cloudflare, go to **Advanced settings >
Managed OAuth**, and verify that
`https://chatgpt.com/connector/oauth/*` is present in **Allowed redirect URIs**.

If Cloudflare Access reports `Unable to find your Access application!` after
sending the login code, verify that the MCP application uses the hostname root
and not a path-scoped URL such as `/mcp`.

If an existing Cloudflare Protected MCP server record was created with
`https://mcp.mikoto.takuk.me/mcp`, Cloudflare may show the HTTP URL as
read-only. In that case, replace the Protected MCP server record with one that
uses `https://mcp.mikoto.takuk.me/`, then reconnect the ChatGPT app using the
root server URL.

### Bridge And Health Endpoints

Create a separate Cloudflare Access self-hosted application for the local bridge
WebSocket endpoint and health check.

- Cloudflare service: **Zero Trust Access Applications**.
- Access application name: `mikoto bridge`.
- Public hostname: `bridge.mikoto.takuk.me`.
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

Keep bridge traffic on `bridge.mikoto.takuk.me`, separate from the
ChatGPT-facing `mcp.mikoto.takuk.me` hostname. ChatGPT should authenticate to
`https://mcp.mikoto.takuk.me/` through Access Managed OAuth, while bridge
connections should use `wss://bridge.mikoto.takuk.me/bridge` and be limited to
trusted local computers.

Each hostname is DNS-public when the Worker route exists. Until both
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
- Zone `takuk.me`: `Workers Routes: Read`.

Wrangler reads the zone's Worker routes before publishing each configured route
to detect assignments to another Worker. That preflight requires
`Workers Routes: Read` even though the current routes are Workers Custom
Domains (`custom_domain: true`). Custom Domains create their own DNS records
and certificates, so they do not require `DNS: Edit`.

If an ordinary route is added later, replace `Workers Routes: Read` with
`Workers Routes: Edit` for its zone. Such a route also needs a separately
configured proxied DNS record; grant `DNS: Edit` only if the workflow will
create or change that record. `Account Settings: Read` and
`User Details: Read` are not required for deployment.

The relay Worker does not currently require runtime Worker secrets or GitHub
environment variables beyond `CLOUDFLARE_ACCOUNT_ID`.

Do not store Cloudflare API tokens in repository files or local config.
