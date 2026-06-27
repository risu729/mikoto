# @mikoto/bridge

Local bridge process scaffold.

The bridge loads `mikoto.toml`, resolves bridge metadata, starts configured backend MCP servers, and connects outbound to the relay over WebSocket. The MVP scaffold validates config and rejects HTTP backends as unimplemented.
