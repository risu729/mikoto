---
description: Current deployment assumptions and limitations.
title: Deployment Notes
---

Cloudflare deployment is separate from local development. Local Wrangler should
be used for local development, not for touching production deployments.

## GitHub Actions Deployment

The docs Worker deployment runs in the main CI workflow.

Pull requests from the main repository upload a Cloudflare Workers preview
version with `wrangler versions upload`. The workflow uses Wrangler installed by
mise, not the Wrangler GitHub Action. Preview upload is part of the CI Check
gate, and the preview URL is written to the GitHub Actions step summary.

Pushes to `main` run production deployment with `wrangler deploy`, also through
mise. Wrangler uses `packages/docs/wrangler.toml` as the source of truth for the
docs Worker and routes production traffic through `mikoto.takuk.me`. The
production `workers.dev` route is disabled; preview URLs remain enabled for pull
request review.

Required GitHub Actions secrets:

- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare account ID for the account that owns the
  docs Worker.
- `CLOUDFLARE_API_TOKEN`: Cloudflare API token used only by GitHub Actions.

Do not store Cloudflare API tokens in the repository or in local config files.

## Cloudflare Prerequisites

- Cloudflare account
- Cloudflare WARP on each local computer that will run `mikoto bridge`
- Cloudflare Access Managed OAuth for the ChatGPT-facing MCP endpoint
- A separate Cloudflare Access policy for the bridge WebSocket endpoint

Cloudflare Workers Builds are not used for this repository.

## Current Limitations

- The public deployment path is not finalized.
- Bridge reconnect is a future improvement; the MVP bridge exits if the relay
  WebSocket disconnects.
- Per-tool timeout configuration is a future improvement. Tool calls currently
  use a fixed 5-minute wall-clock timeout.
