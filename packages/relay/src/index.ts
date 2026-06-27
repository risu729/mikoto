import { BridgeHelloMessageSchema } from "@mikoto/protocol";
import { Hono } from "hono";

type BridgeMetadata = import("@mikoto/protocol").BridgeMetadata;
type Env = {
	RELAY_DO: DurableObjectNamespace;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (context) => context.json({ ok: true }));

app.all("/mcp", (context) =>
	context.json(
		{
			error: {
				code: "not_implemented",
				message: "Streamable HTTP MCP endpoint is scaffolded but not implemented yet.",
			},
		},
		501,
	),
);

app.get("/bridge", (context) => {
	const durableObjectId = context.env.RELAY_DO.idFromName("global");
	const stub = context.env.RELAY_DO.get(durableObjectId);
	return stub.fetch(context.req.raw);
});

class RelayDurableObject {
	private readonly state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	fetch(request: Request): Response {
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
			webSocket: client,
		});
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") {
			ws.send(JSON.stringify({ error: "binary messages are not supported", ok: false }));
			return;
		}

		const parsed = BridgeHelloMessageSchema.safeParse(JSON.parse(message));
		if (!parsed.success) {
			ws.send(JSON.stringify({ error: "invalid bridge message", ok: false }));
			return;
		}

		await this.registerBridge(parsed.data.bridge, ws);
		ws.send(
			JSON.stringify({ bridgeId: parsed.data.bridge.id, ok: true, type: "bridge.registered" }),
		);
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
			bridgeId: bridge.id,
		});
	}
}

export default app;
export { RelayDurableObject };
