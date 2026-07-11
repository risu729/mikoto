import type {
	BridgeHelloMessage,
	JsonObject,
	ToolCallError,
	ToolCallRequest,
	ToolCallResult,
} from "@mikoto/protocol";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { Context } from "hono";
import { Hono } from "hono";

import { parseBridgeMessage, sendBridgeError, sendBridgeRegistered } from "./bridge-messages";
import {
	acceptBridgeSocket,
	bridgeStorageKey,
	deleteBridgeStorage,
	pruneDisconnectedBridgeStorage,
	storeRegisteredBridge,
} from "./bridge-registry";
import createRelayMcpServer from "./mcp";
import { createPendingError, createToolError, selectBridge } from "./routing";
import type { PendingToolCall, RegisteredBridge } from "./routing";

type ToolCallPayload = {
	arguments: JsonObject;
	bridgeId?: string;
	tool: string;
};

const TOOL_CALL_TIMEOUT_MS = 300_000;

const app = new Hono<{ Bindings: Env }>();

app.get("/health", (context) => context.json({ ok: true }));

const getRelayStub = (env: Env): DurableObjectStub => {
	const durableObjectId = env.RELAY_DO.idFromName("global");
	return env.RELAY_DO.get(durableObjectId);
};

app.all("/", async (context: Context<{ Bindings: Env }>) => {
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

class RelayDurableObject {
	private readonly pendingToolCalls = new Map<string, PendingToolCall>();
	private readonly state: DurableObjectState;

	constructor(state: DurableObjectState) {
		this.state = state;
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url);

		if (url.pathname === "/bridges") {
			return await this.listBridges();
		}

		if (url.pathname === "/tool-call" && request.method === "POST") {
			return await this.callBridgeTool(request);
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected WebSocket upgrade", { status: 426 });
		}

		return acceptBridgeSocket(this.state);
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
			await deleteBridgeStorage(this.state, attachment.bridgeId);
			this.rejectBridgeDisconnected(attachment.bridgeId);
		}
	}

	private async handleBridgeTextMessage(ws: WebSocket, message: string): Promise<void> {
		const parsed = parseBridgeMessage(message);
		if (parsed.kind === "tool-result") {
			this.resolvePendingToolCall(parsed.value);
		} else if (parsed.kind === "hello") {
			await this.registerBridgeHello(ws, parsed.value);
		} else if (parsed.kind === "invalid-json") {
			sendBridgeError(ws, "invalid json");
		} else {
			sendBridgeError(ws, "invalid bridge message");
		}
	}

	private async registerBridgeHello(ws: WebSocket, message: BridgeHelloMessage): Promise<void> {
		const registered = await this.registerBridge(message, ws);
		if (!registered) {
			return;
		}

		sendBridgeRegistered(ws, message.bridge.id);
	}

	private async registerBridge(message: BridgeHelloMessage, ws: WebSocket): Promise<boolean> {
		await this.pruneDisconnectedBridges();

		const { bridge } = message;
		const existing = await this.state.storage.get<RegisteredBridge>(bridgeStorageKey(bridge.id));

		if (existing?.status === "connected") {
			ws.close(1008, "duplicate bridge id");
			return false;
		}

		await storeRegisteredBridge(this.state, ws, message);

		return true;
	}

	private findBridgeSocket(bridgeId: string): WebSocket | undefined {
		return this.state.getWebSockets().find((ws) => {
			const attachment = ws.deserializeAttachment() as { bridgeId?: string } | undefined;
			return attachment?.bridgeId === bridgeId;
		});
	}

	private async pruneDisconnectedBridges(): Promise<void> {
		await pruneDisconnectedBridgeStorage(this.state, (bridgeId) => {
			this.rejectBridgeDisconnected(bridgeId);
		});
	}

	private async readBridges(): Promise<RegisteredBridge[]> {
		await this.pruneDisconnectedBridges();

		const list = await this.state.storage.list<RegisteredBridge>({ prefix: "bridge:" });
		return Array.from(list.values()).sort((left, right) => left.id.localeCompare(right.id));
	}

	private async callBridgeTool(request: Request): Promise<Response> {
		const payload = (await request.json()) as ToolCallPayload;
		const id = crypto.randomUUID();
		const selected = selectBridge(await this.readBridges(), payload.tool, payload.bridgeId);

		if (selected.error || !selected.bridge) {
			return Response.json(
				createToolError(
					id,
					selected.error?.code ?? "missing_bridge",
					selected.error?.message ?? "Bridge not found.",
				),
			);
		}

		const result = await this.sendBridgeToolCall(selected.bridge.id, {
			arguments: payload.arguments,
			bridgeId: selected.bridge.id,
			id,
			tool: payload.tool,
			type: "tool.call",
		});

		return Response.json(result);
	}

	private sendBridgeToolCall(bridgeId: string, request: ToolCallRequest): Promise<ToolCallResult> {
		const socket = this.findBridgeSocket(bridgeId);
		if (!socket) {
			return Promise.resolve(
				createToolError(request.id, "bridge_disconnected", `Bridge is not connected: ${bridgeId}`),
			);
		}
		if (this.bridgeHasPendingCall(bridgeId)) {
			return Promise.resolve(
				createToolError(
					request.id,
					"bridge_busy",
					`Bridge already has an in-flight tool call: ${bridgeId}`,
				),
			);
		}
		if (this.pendingToolCalls.has(request.id)) {
			return Promise.resolve(
				createToolError(
					request.id,
					"duplicate_tool_call_id",
					`Tool call id is already pending: ${request.id}`,
				),
			);
		}

		return this.createPendingToolCall(bridgeId, request, socket);
	}

	private bridgeHasPendingCall(bridgeId: string): boolean {
		return Array.from(this.pendingToolCalls.values()).some((call) => call.bridgeId === bridgeId);
	}

	private createPendingToolCall(
		bridgeId: string,
		request: ToolCallRequest,
		socket: WebSocket,
	): Promise<ToolCallResult> {
		const deferred = Promise.withResolvers<ToolCallResult>();
		const timeoutRef: { current?: ReturnType<typeof setTimeout> } = {};
		let settled = false;
		const settle = (result: ToolCallResult): void => {
			if (settled) {
				return;
			}

			settled = true;
			this.pendingToolCalls.delete(request.id);
			if (timeoutRef.current) {
				clearTimeout(timeoutRef.current);
			}
			deferred.resolve(result);
		};
		timeoutRef.current = setTimeout(() => {
			settle(createToolError(request.id, "tool_timeout", "Tool call timed out."));
		}, TOOL_CALL_TIMEOUT_MS);

		this.pendingToolCalls.set(request.id, {
			bridgeId,
			reject: (error) => {
				settle(createToolError(request.id, error.code, error.message));
			},
			resolve: (result) => {
				settle(result);
			},
		});
		try {
			socket.send(JSON.stringify(request));
		} catch {
			settle(createToolError(request.id, "bridge_disconnected", "Bridge send failed."));
		}

		return deferred.promise;
	}

	private rejectPendingCallsForBridge(bridgeId: string, error: ToolCallError): void {
		for (const [id, pending] of this.pendingToolCalls) {
			if (pending.bridgeId === bridgeId) {
				this.pendingToolCalls.delete(id);
				pending.reject(error);
			}
		}
	}

	private rejectBridgeDisconnected(bridgeId: string): void {
		this.rejectPendingCallsForBridge(
			bridgeId,
			createPendingError("bridge_disconnected", "Bridge disconnected during tool call."),
		);
	}

	private resolvePendingToolCall(result: ToolCallResult): void {
		const pending = this.pendingToolCalls.get(result.id);
		if (!pending) {
			return;
		}

		this.pendingToolCalls.delete(result.id);
		pending.resolve(result);
	}

	private async listBridges(): Promise<Response> {
		return Response.json({ bridges: await this.readBridges() });
	}
}

export default app;
export { RelayDurableObject };
