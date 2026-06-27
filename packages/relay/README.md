# @mikoto/relay

Cloudflare Worker relay scaffold.

The relay exposes the ChatGPT-facing Streamable HTTP MCP endpoint and accepts outbound bridge WebSocket connections through a Durable Object. The current scaffold includes health checks, bridge WebSocket registration, and Durable Object metadata storage.
