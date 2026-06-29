import { BridgeHelloMessageSchema } from "@mikoto/protocol";
import type { BridgeHelloMessage, BridgeMetadata, ToolInfo } from "@mikoto/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { Context } from "hono";
import { Hono } from "hono";

type Env = {
	RELAY_DO: DurableObjectNamespace;
};
type RegisteredBridge = BridgeMetadata & {
	connectedAt: string;
	toolMetadata: ToolInfo[];
};

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (context) => context.json({ ok: true }));

const getRelayStub = (env: Env): DurableObjectStub => {
	const durableObjectId = env.RELAY_DO.idFromName("global");
	return env.RELAY_DO.get(durableObjectId);
};

const createJsonToolResult = (payload: unknown): CallToolResult => ({
	content: [
		{
			text: JSON.stringify(payload),
			type: "text",
		},
	],
});

const createRelayMcpServer = (env: Env): McpServer => {
	const server = new McpServer({
		name: "mikoto-relay",
		version: "0.0.0",
	});

	server.registerTool(
		"mikoto_list_bridges",
		{
			description: "List currently connected local Mikoto bridges.",
			inputSchema: {},
			title: "List Mikoto Bridges",
		},
		async () => {
			const response = await getRelayStub(env).fetch("http://relay.local/bridges");
			const { bridges } = (await response.json()) as { bridges: RegisteredBridge[] };

			return createJsonToolResult({ bridges });
		},
	);

	return server;
};

type HonoContext = Context<{ Bindings: Env }>;

app.all("/mcp", async (context: HonoContext) => {
	// Stateless SDK transports must be request-scoped; reusing one across requests throws.
	const server = createRelayMcpServer(context.env);
	const transport = new WebStandardStreamableHTTPServerTransport({
		enableJsonResponse: true,
	});

	await server.connect(transport);

	try {
		return await transport.handleRequest(context.req.raw);
	} finally {
		await server.close();
	}
});

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

		const registered = await this.registerBridge(parsed.data, ws);
		if (!registered) {
			return;
		}

		sendBridgeRegistered(ws, parsed.data.bridge.id);
	}

	private async registerBridge(message: BridgeHelloMessage, ws: WebSocket): Promise<boolean> {
		const { bridge } = message;
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
			toolMetadata: message.tools,
			tools: message.tools.map((tool) => tool.name),
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
