---
description: Current deployment assumptions and limitations.
title: Deployment Notes
---

Cloudflare deployment is separate from local development. Local Wrangler should
be used for local development, not for touching production deployments.

Planned deployment prerequisites:

- Cloudflare account
- Cloudflare WARP on each local computer that will run `mikoto bridge`
- Cloudflare Access Managed OAuth for the ChatGPT-facing MCP endpoint
- A separate Cloudflare Access policy for the bridge WebSocket endpoint

Cloudflare Workers Builds are not used for this repository.

The Cloudflare relay should be deployed from GitHub Actions using
`cloudflare/wrangler-action` or a raw `wrangler deploy` command with a
Cloudflare API token.

## Current Limitations

- The public deployment path is not finalized.
- Bridge reconnect is a future improvement; the MVP bridge exits if the relay
  WebSocket disconnects.
- Per-tool timeout configuration is a future improvement. Tool calls currently
  use a fixed 5-minute wall-clock timeout.
