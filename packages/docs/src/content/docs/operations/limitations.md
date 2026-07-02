---
description: Current MVP limitations and intentionally deferred work.
title: Limitations
---

Current limitations:

- Cloudflare Access application and policy creation is manual.
- Per-PR relay preview deployments are a future improvement. Pull requests only
  run a production relay deployment dry run.
- Bridge reconnect is a future improvement. The MVP bridge exits if the relay
  WebSocket disconnects.
- Active relay WebSocket sessions or in-flight tool calls can be interrupted by
  Worker and Durable Object updates. Durable Object storage persists bridge
  metadata, but in-flight calls are not restored.
- Per-tool timeout configuration is a future improvement. Tool calls currently
  use a fixed 5-minute wall-clock timeout.
- Backend `http` transport is schema-supported but not implemented.
- Browser and Codex end-to-end tests are intentionally deferred until protocol
  and routing behavior are stable.
