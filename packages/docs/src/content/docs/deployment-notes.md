---
description: Current deployment assumptions and limitations.
title: Deployment Notes
---

Cloudflare deployment is separate from local development. Local Wrangler should
be used for local development, not for touching production deployments.

## GitHub Actions Deployment

The docs Worker deployment runs in the main CI workflow. The relay production
deployment runs in a separate GitHub Actions workflow.

Production hosting decisions:

- The docs site is a Cloudflare Workers static-assets Worker at
  `mikoto.takuk.me`.
- The relay is a Cloudflare Worker and Durable Object at
  `mcp.mikoto.takuk.me`.
- Both production hostnames are configured as Wrangler custom-domain routes in
  this repository. No Cloudflare Workers Builds project is used.
- The relay production `workers.dev` route is disabled; the custom domain is
  the production entrypoint.
- `mcp.mikoto.takuk.me` is the selected MVP hostname. No fallback hostname is
  configured in this PR. If Cloudflare rejects certificate issuance for that
  nested custom domain during production deploy, change the relay production
  route in `packages/relay/wrangler.jsonc` before retrying the deploy.

Pull requests from the main repository upload a Cloudflare Workers preview
version with `wrangler versions upload`. The workflow uses Wrangler installed by
mise, not the Wrangler GitHub Action. Preview upload is part of the CI Check
gate, and the preview URL is written to the GitHub Actions step summary.

Pushes to `main` run production deployment with `wrangler deploy`, also through
mise. Wrangler uses `packages/docs/wrangler.jsonc` as the source of truth for
the docs Worker and routes production traffic through `mikoto.takuk.me`. The
production `workers.dev` route is disabled; preview URLs remain enabled for pull
request review.

The production docs deployment fails when the required Cloudflare GitHub Actions
configuration is missing. Pull request preview uploads from forks do not require
repository secrets.

Pull requests from the main repository also run a production relay deployment
dry run with `wrangler deploy --env production --dry-run`. Fork pull requests
skip the relay dry run because repository secrets are unavailable.

Pushes to `main` trigger the separate Relay Deploy workflow, which deploys the
production relay Worker with `wrangler deploy --env production` through the
GitHub `production` environment. Wrangler uses `packages/relay/wrangler.jsonc`
as the source of truth for the relay Worker, Durable Object binding, Durable
Object migrations, and production custom domain route at
`mcp.mikoto.takuk.me`.

The production relay deployment fails when the required Cloudflare GitHub
Actions configuration is missing.

The docs Worker and relay Worker configs enable Wrangler source-map uploads and
Cloudflare Workers observability.

Required GitHub Actions variables:

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID for the account that owns the
  docs and relay Workers.

Required GitHub Actions secrets:

- `CLOUDFLARE_API_TOKEN`: Cloudflare API token used only by GitHub Actions.

Minimum Cloudflare API token permissions for the current docs and relay
deployments:

- Account `risu`: `Workers Scripts: Edit`
- Zone `takuk.me`: `Workers Routes: Edit`
- Zone `takuk.me`: `DNS: Edit`

The relay Worker does not currently require runtime Worker secrets or GitHub
environment variables beyond `CLOUDFLARE_ACCOUNT_ID`.

Do not store Cloudflare API tokens in the repository or in local config files.

## Cloudflare Prerequisites

- Cloudflare account
- Cloudflare WARP on each local computer that will run `mikoto bridge`
- Cloudflare Access Managed OAuth for `mcp.mikoto.takuk.me/mcp*`
- A separate Cloudflare Access policy that trusts intended WARP clients for
  `mcp.mikoto.takuk.me/bridge*`
- The same WARP-only Access policy for `mcp.mikoto.takuk.me/health*`

Cloudflare Workers Builds are not used for this repository.

Cloudflare Access policy creation is manual for now. Automating Access
applications and policies later would require additional Cloudflare Zero Trust
API permissions.

## Current Limitations

- Per-PR relay preview deployments are a future improvement. Pull requests only
  run a production relay deployment dry run.
- Bridge reconnect is a future improvement; the MVP bridge exits if the relay
  WebSocket disconnects.
- Active relay WebSocket sessions or in-flight tool calls can be interrupted by
  Worker and Durable Object updates. Durable Object storage persists bridge
  metadata, but in-flight calls are not restored yet.
- Per-tool timeout configuration is a future improvement. Tool calls currently
  use a fixed 5-minute wall-clock timeout.
