---
description: Current limitations and intentionally deferred work.
title: Limitations
---

Current limitations:

- Cloudflare Access application and policy creation is manual.
- Per-PR relay preview deployments are a future improvement. Pull requests only
  run a production relay deployment dry run.
- Bridge reconnect is a future improvement. The bridge exits if the relay
  WebSocket disconnects.
- Active relay WebSocket sessions or in-flight tool calls can be interrupted by
  Worker and Durable Object updates. Durable Object storage persists bridge
  metadata, but in-flight calls are not restored.
- Each bridge processes one tool call at a time. An overlapping call returns a
  `bridge_busy` error.
- Per-tool timeout configuration is a future improvement. Tool calls currently
  use a fixed 5-minute wall-clock timeout.
- Backend discovery happens at bridge startup and the bridge sends a static tool
  snapshot when it connects. Configuration changes require a bridge restart.
- Backend `http` transport is schema-supported but not implemented.
- Browser and Codex end-to-end tests are intentionally deferred until protocol
  and routing behavior are stable.
