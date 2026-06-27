import { Hono } from "hono";
import { BridgeHelloMessageSchema, type BridgeMetadata } from "@mikoto/protocol";

export type Env = {
  RELAY_DO: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (c) => c.json({ ok: true }));

app.all("/mcp", (c) =>
  c.json(
    {
      error: {
        code: "not_implemented",
        message: "Streamable HTTP MCP endpoint is scaffolded but not implemented yet."
      }
    },
    501
  )
);

app.get("/bridge", (c) => {
  const id = c.env.RELAY_DO.idFromName("global");
  const stub = c.env.RELAY_DO.get(id);
  return stub.fetch(c.req.raw);
});

export class RelayDurableObject {
  private readonly state: DurableObjectState;

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("Upgrade") !== "websocket") {
      return new Response("Expected WebSocket upgrade", { status: 426 });
    }

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    const connectedAt = new Date().toISOString();

    server.serializeAttachment({ connectedAt });
    this.state.acceptWebSocket(server);

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== "string") {
      ws.send(JSON.stringify({ ok: false, error: "binary messages are not supported" }));
      return;
    }

    const parsed = BridgeHelloMessageSchema.safeParse(JSON.parse(message));
    if (!parsed.success) {
      ws.send(JSON.stringify({ ok: false, error: "invalid bridge message" }));
      return;
    }

    await this.registerBridge(parsed.data.bridge, ws);
    ws.send(JSON.stringify({ ok: true, type: "bridge.registered", bridgeId: parsed.data.bridge.id }));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const attachment = ws.deserializeAttachment() as { bridgeId?: string } | undefined;
    if (attachment?.bridgeId) {
      await this.state.storage.delete(`bridge:${attachment.bridgeId}`);
    }
  }

  private async registerBridge(bridge: BridgeMetadata, ws: WebSocket): Promise<void> {
    const key = `bridge:${bridge.id}`;
    const existing = await this.state.storage.get<BridgeMetadata>(key);

    if (existing?.status === "connected") {
      ws.close(1008, "duplicate bridge id");
      return;
    }

    await this.state.storage.put(key, bridge);
    ws.serializeAttachment({
      ...(ws.deserializeAttachment() as object | undefined),
      bridgeId: bridge.id
    });
  }
}

export default app;
