import { BridgeHelloMessageSchema } from "@mikoto/protocol";
import { Hono } from "hono";

type BridgeMetadata = import("@mikoto/protocol").BridgeMetadata;
type JsonObject = import("@mikoto/protocol").JsonObject;
type Env = {
	RELAY_DO: DurableObjectNamespace;
};
type McpRequest = {
	id?: null | number | string;
	jsonrpc?: string;
	method?: string;
	params?: JsonObject;
};
type RegisteredBridge = BridgeMetadata & {
	connectedAt: string;
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (context) => context.json({ ok: true }));

const getRelayStub = (env: Env): DurableObjectStub => {
	const durableObjectId = env.RELAY_DO.idFromName("global");
	return env.RELAY_DO.get(durableObjectId);
};

const mcpToolResult = (payload: JsonObject) => ({
	content: [
		{
			text: JSON.stringify(payload),
			type: "text",
		},
	],
});

const createMcpResponse = (id: McpRequest["id"], result: JsonObject) => ({
	id,
	jsonrpc: "2.0",
	result,
});

const createMcpErrorResponse = (id: McpRequest["id"], code: number, message: string) => ({
	error: {
		code,
		message,
	},
	id,
	jsonrpc: "2.0",
});

const createInitializeResponse = (request: McpRequest) =>
	createMcpResponse(request.id, {
		capabilities: {
			tools: {},
		},
		protocolVersion: "2025-06-18",
		serverInfo: {
			name: "mikoto-relay",
			version: "0.0.0",
		},
	});

const createToolsListResponse = (request: McpRequest) =>
	createMcpResponse(request.id, {
		tools: [
			{
				description: "List currently connected local Mikoto bridges.",
				inputSchema: {
					additionalProperties: false,
					properties: {},
					type: "object",
				},
				name: "mikoto_list_bridges",
			},
		],
	});

const createToolsCallResponse = async (request: McpRequest, env: Env) => {
	const name = request.params?.["name"];

	if (name !== "mikoto_list_bridges") {
		return createMcpErrorResponse(request.id, -32602, "Unknown tool");
	}

	const response = await getRelayStub(env).fetch("http://relay.local/bridges");
	const { bridges } = (await response.json()) as { bridges: RegisteredBridge[] };

	return createMcpResponse(request.id, mcpToolResult({ bridges }));
};

const handleMcpRequest = async (request: McpRequest, env: Env) => {
	switch (request.method) {
		case "initialize":
			return createInitializeResponse(request);
		case "tools/list":
			return createToolsListResponse(request);
		case "tools/call":
			return await createToolsCallResponse(request, env);
		default:
			return createMcpErrorResponse(request.id, -32601, "Method not found");
	}
};

type HonoContext = import("hono").Context<{ Bindings: Env }>;

app.post("/mcp", async (context: HonoContext) => {
	const request = (await context.req.json().catch(() => null)) as McpRequest | null;

	if (!request || request.jsonrpc !== "2.0" || typeof request.method !== "string") {
		return context.json(createMcpErrorResponse(request?.id, -32600, "Invalid request"), 400);
	}

	return context.json(await handleMcpRequest(request, context.env));
});

app.all("/mcp", (context) =>
	context.json(createMcpErrorResponse(null, -32000, "Method not allowed"), 405),
);

app.get("/bridge", (context) => getRelayStub(context.env).fetch(context.req.raw));

const parseBridgeMessage = (message: string): { ok: true; value: unknown } | { ok: false } => {
	try {
		return { ok: true, value: JSON.parse(message) as unknown };
	} catch {
		return { ok: false };
	}
};

const sendBridgeError = (ws: WebSocket, error: string): void => {
	ws.send(JSON.stringify({ error, ok: false }));
};

const sendBridgeRegistered = (ws: WebSocket, bridgeId: string): void => {
	ws.send(JSON.stringify({ bridgeId, ok: true, type: "bridge.registered" }));
};

const parseBridgeHello = (
	ws: WebSocket,
	message: string,
): ReturnType<typeof BridgeHelloMessageSchema.safeParse> => {
	const raw = parseBridgeMessage(message);
	if (!raw.ok) {
		sendBridgeError(ws, "invalid json");
		return BridgeHelloMessageSchema.safeParse(null);
	}

	const parsed = BridgeHelloMessageSchema.safeParse(raw.value);
	if (!parsed.success) {
		sendBridgeError(ws, "invalid bridge message");
	}

	return parsed;
};

class RelayDurableObject {
	private readonly state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/bridges") {
			return await this.listBridges();
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}

		return this.acceptBridgeSocket();
	}

	async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
		if (typeof message !== "string") {
			sendBridgeError(ws, "binary messages are not supported");
			return;
		}

		await this.handleBridgeTextMessage(ws, message);
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		const attachment = ws.deserializeAttachment() as { bridgeId?: string } | undefined;
		if (attachment?.bridgeId) {
			await this.state.storage.delete(`bridge:${attachment.bridgeId}`);
		}
	}

	private acceptBridgeSocket(): Response {
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

	private async handleBridgeTextMessage(ws: WebSocket, message: string): Promise<void> {
		const parsed = parseBridgeHello(ws, message);
		if (!parsed.success) {
			return;
		}

		const registered = await this.registerBridge(parsed.data.bridge, ws);
		if (!registered) {
			return;
		}

		sendBridgeRegistered(ws, parsed.data.bridge.id);
	}

	private async registerBridge(bridge: BridgeMetadata, ws: WebSocket): Promise<boolean> {
		const key = `bridge:${bridge.id}`;
		const existing = await this.state.storage.get<RegisteredBridge>(key);

		if (existing?.status === "connected") {
			ws.close(1008, "duplicate bridge id");
			return false;
		}

		const attachment = ws.deserializeAttachment() as { connectedAt?: string } | undefined;
		await this.state.storage.put(key, {
			...bridge,
			connectedAt: attachment?.connectedAt ?? new Date().toISOString(),
		});
		ws.serializeAttachment({
			...(ws.deserializeAttachment() as object | undefined),
			bridgeId: bridge.id,
		});

		return true;
	}

	private async listBridges(): Promise<Response> {
		const list = await this.state.storage.list<RegisteredBridge>({ prefix: "bridge:" });
		const bridges = Array.from(list.values()).sort((left, right) =>
			left.id.localeCompare(right.id),
		);

		return Response.json({ bridges });
	}
}

export default app;
export { RelayDurableObject };
