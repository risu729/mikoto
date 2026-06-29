import { SELF } from "cloudflare:test";
import { expect } from "vitest";

type McpToolTextResult = {
	result: { content: [{ text: string; type: "text" }] };
};
type McpToolResult = {
	result: {
		content: Array<{ text?: string; type: string }>;
		isError?: boolean;
	};
};
type McpInitializeResult = {
	result: {
		capabilities: { tools?: unknown };
		protocolVersion: string;
		serverInfo: { name: string; version: string };
	};
};
type McpToolsListResult = {
	result: {
		tools: Array<{
			description?: string;
			inputSchema?: unknown;
			name: string;
			title?: string;
		}>;
	};
};
type BridgeListPayload = {
	bridges: Array<{
		id: string;
		os: string;
		status: string;
		toolMetadata: Array<{ name: string }>;
		tools: string[];
	}>;
};
type ToolCallPayload = {
	error?: { code: string; message: string };
	id: string;
	ok: boolean;
	result?: unknown;
	type: "tool.result";
};
type WebSocketCloseSnapshot = {
	code: number;
	reason: string;
};

const MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_TOOL = "codex.codex_chrome_read";

const waitForMessage = (webSocket: WebSocket): Promise<string> =>
	// oxlint-disable-next-line promise/avoid-new
	new Promise((resolve, reject) => {
		webSocket.addEventListener("message", (event) => resolve(String(event.data)), {
			once: true,
		});
		webSocket.addEventListener("error", () => reject(new Error("WebSocket error")), {
			once: true,
		});
	});

const waitForClose = (webSocket: WebSocket): Promise<WebSocketCloseSnapshot> =>
	// oxlint-disable-next-line promise/avoid-new
	new Promise((resolve) => {
		webSocket.addEventListener(
			"close",
			(event) => resolve({ code: event.code, reason: event.reason }),
			{
				once: true,
			},
		);
	});

const openBridgeWebSocket = async (): Promise<WebSocket> => {
	const response = await SELF.fetch("http://example.com/bridge", {
		headers: {
			Upgrade: "websocket",
		},
	});
	const { webSocket } = response;

	expect(response.status).toBe(101);
	expect(webSocket).toBeDefined();

	if (!webSocket) {
		throw new Error("Missing WebSocket");
	}

	webSocket.accept();
	return webSocket;
};

const sendBridgeHello = (webSocket: WebSocket, bridgeId = "dev-machine"): void => {
	webSocket.send(
		JSON.stringify({
			bridge: {
				id: bridgeId,
				lastHeartbeat: "2026-06-29T00:00:00.000Z",
				os: "windows",
				status: "connected",
				tools: ["stale.tool_name"],
			},
			tools: [
				{
					description: "Read browser context.",
					inputSchema: {
						additionalProperties: false,
						properties: {
							request: { type: "string" },
						},
						required: ["request"],
						type: "object",
					},
					name: DEFAULT_TOOL,
				},
			],
			type: "bridge.hello",
		}),
	);
};

const postMcp = async (body: unknown): Promise<Response> =>
	await SELF.fetch("http://example.com/mcp", {
		body: JSON.stringify(body),
		headers: {
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
			"mcp-protocol-version": MCP_PROTOCOL_VERSION,
		},
		method: "POST",
	});

const initializeMcp = async (): Promise<McpInitializeResult> => {
	const response = await postMcp({
		id: 1,
		jsonrpc: "2.0",
		method: "initialize",
		params: {
			capabilities: {},
			clientInfo: {
				name: "mikoto-relay-test",
				version: "0.0.0",
			},
			protocolVersion: MCP_PROTOCOL_VERSION,
		},
	});

	expect(response.status).toBe(200);
	return (await response.json()) as McpInitializeResult;
};

const listMcpTools = async (): Promise<McpToolsListResult> => {
	const response = await postMcp({
		id: 2,
		jsonrpc: "2.0",
		method: "tools/list",
		params: {},
	});

	expect(response.status).toBe(200);
	return (await response.json()) as McpToolsListResult;
};

const callRawMcpTool = async (
	name: string,
	input: unknown,
	meta?: Record<string, unknown>,
): Promise<McpToolResult> => {
	const response = await postMcp({
		id: 3,
		jsonrpc: "2.0",
		method: "tools/call",
		params: {
			arguments: input,
			...(meta ? { _meta: meta } : {}),
			name,
		},
	});

	expect(response.status).toBe(200);
	return (await response.json()) as McpToolResult;
};

const callMcpTool = async (
	name: string,
	input: unknown,
	meta?: Record<string, unknown>,
): Promise<unknown> => {
	const body = (await callRawMcpTool(name, input, meta)) as McpToolTextResult;

	return JSON.parse(body.result.content[0].text) as unknown;
};

const callListBridgesTool = async (): Promise<BridgeListPayload> =>
	(await callMcpTool("mikoto_list_bridges", {})) as BridgeListPayload;

const createBridgeMeta = (bridgeId?: string): null | Record<string, unknown> =>
	bridgeId ? { "mikoto/bridgeId": bridgeId } : null;

const callExposedTool = async (
	tool: string,
	input: {
		arguments?: Record<string, unknown>;
		bridgeId?: string;
	},
): Promise<ToolCallPayload> => {
	const meta = createBridgeMeta(input.bridgeId);
	const result = meta
		? await callMcpTool(tool, input.arguments ?? {}, meta)
		: await callMcpTool(tool, input.arguments ?? {});

	return result as ToolCallPayload;
};

const callSuccessfulExposedTool = async (
	tool: string,
	input: {
		arguments?: Record<string, unknown>;
		bridgeId?: string;
	},
): Promise<McpToolResult["result"]> => {
	const meta = createBridgeMeta(input.bridgeId);
	const body = meta
		? await callRawMcpTool(tool, input.arguments ?? {}, meta)
		: await callRawMcpTool(tool, input.arguments ?? {});

	return body.result;
};

const callLocalTool = async (input: {
	arguments?: Record<string, unknown>;
	bridgeId?: string;
	tool: string;
}): Promise<ToolCallPayload> => {
	const { tool, ...toolInput } = input;

	return await callExposedTool(tool, toolInput);
};

const fetchUnsupportedMcpMethod = async (): Promise<Response> =>
	await SELF.fetch("http://example.com/mcp", {
		body: JSON.stringify({
			id: 4,
			jsonrpc: "2.0",
			method: "tools/list",
			params: {},
		}),
		headers: {
			accept: "application/json, text/event-stream",
			"content-type": "application/json",
			"mcp-protocol-version": MCP_PROTOCOL_VERSION,
		},
		method: "PUT",
	});

const registerBridgeWithId = async (bridgeId: string): Promise<WebSocket> => {
	const webSocket = await openBridgeWebSocket();

	sendBridgeHello(webSocket, bridgeId);
	await expect(waitForMessage(webSocket)).resolves.toBe(
		JSON.stringify({ bridgeId, ok: true, type: "bridge.registered" }),
	);

	return webSocket;
};

const registerBridge = async (): Promise<WebSocket> => await registerBridgeWithId("dev-machine");

const sendToolSuccess = (webSocket: WebSocket, request: { id: string }, result: unknown): void => {
	webSocket.send(
		JSON.stringify({
			id: request.id,
			ok: true,
			result,
			type: "tool.result",
		}),
	);
};

export {
	DEFAULT_TOOL,
	MCP_PROTOCOL_VERSION,
	callListBridgesTool,
	callLocalTool,
	callSuccessfulExposedTool,
	fetchUnsupportedMcpMethod,
	initializeMcp,
	listMcpTools,
	openBridgeWebSocket,
	registerBridge,
	registerBridgeWithId,
	sendBridgeHello,
	sendToolSuccess,
	waitForClose,
	waitForMessage,
};
