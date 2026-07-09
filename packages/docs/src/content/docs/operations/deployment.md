---
description: Production deployment model for docs and relay Workers.
title: Deployment
---

Cloudflare deployment is separate from local development. Local Wrangler should
be used for local development and explicit operator checks, not as the normal
production deployment path.

## GitHub Actions

The docs Worker deployment runs in the main CI workflow. The relay production
deployment runs in a separate GitHub Actions workflow.

The repository uses raw Wrangler commands through mise. It does not use
Cloudflare Workers Builds.

## Docs Worker

The docs site is a Cloudflare Workers static-assets Worker at
`mikoto.takuk.me`.

Pull requests from the main repository upload a Cloudflare Workers preview
version with `wrangler versions upload`. Pull requests that do not upload a
credentialed preview, including pull requests from forks, run a tokenless docs
Worker deployment dry run with `wrangler deploy --dry-run` instead.

Pushes to `main` run production deployment with `wrangler deploy`.
`packages/docs/wrangler.jsonc` is the source of truth for the docs Worker route
and static-assets configuration.

## Relay Worker

The relay is a Cloudflare Worker and Durable Object at
`mcp.mikoto.takuk.me` and `bridge.mikoto.takuk.me`. Both hostnames route to the
same Worker. The production environment in `packages/relay/wrangler.jsonc`
configures the Worker routes, Durable Object binding, migrations, source-map
uploads, and observability.

Pull requests run a tokenless production relay deployment dry run with
`wrangler deploy --env production --dry-run`, including pull requests from
forks.

Pushes to `main` trigger the separate Relay Deploy workflow, which deploys the
production relay Worker with `wrangler deploy --env production` through the
GitHub `production` environment.

Production docs and relay deployments fail when required Cloudflare GitHub
Actions configuration is missing.
