import { SELF, reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import worker from "./index";

type McpToolTextResult = {
	result: { content: [{ text: string; type: "text" }] };
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
type WebSocketCloseSnapshot = {
	code: number;
	reason: string;
};

const MCP_PROTOCOL_VERSION = "2025-06-18";

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

const sendBridgeHello = (webSocket: WebSocket): void => {
	webSocket.send(
		JSON.stringify({
			bridge: {
				id: "dev-machine",
				lastHeartbeat: "2026-06-29T00:00:00.000Z",
				os: "windows",
				status: "connected",
				tools: ["stale.tool_name"],
			},
			tools: [
				{
					description: "Read browser context.",
					name: "codex.codex_chrome_read",
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

const callListBridgesTool = async (): Promise<BridgeListPayload> => {
	const response = await postMcp({
		id: 3,
		jsonrpc: "2.0",
		method: "tools/call",
		params: {
			arguments: {},
			name: "mikoto_list_bridges",
		},
	});
	const body = (await response.json()) as McpToolTextResult;

	expect(response.status).toBe(200);
	return JSON.parse(body.result.content[0].text) as BridgeListPayload;
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

const registerBridge = async (): Promise<WebSocket> => {
	const webSocket = await openBridgeWebSocket();

	sendBridgeHello(webSocket);
	await expect(waitForMessage(webSocket)).resolves.toBe(
		JSON.stringify({ bridgeId: "dev-machine", ok: true, type: "bridge.registered" }),
	);

	return webSocket;
};

afterEach(async () => {
	await reset();
});

describe("relay worker scaffold", () => {
	it("serves health checks", async () => {
		const response = await worker.fetch(new Request("http://example.com/health"));
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
	});
});

describe("relay MCP endpoint", () => {
	it("serves MCP initialize through Streamable HTTP", async () => {
		const body = await initializeMcp();

		expect(body.result).toMatchObject({
			capabilities: {
				tools: {},
			},
			protocolVersion: MCP_PROTOCOL_VERSION,
			serverInfo: {
				name: "mikoto-relay",
				version: "0.0.0",
			},
		});
	});

	it("lists relay-owned MCP tools through Streamable HTTP", async () => {
		const body = await listMcpTools();

		expect(body.result.tools).toEqual([
			expect.objectContaining({
				description: "List currently connected local Mikoto bridges.",
				name: "mikoto_list_bridges",
				title: "List Mikoto Bridges",
			}),
		]);
	});

	it("lets the SDK reject unsupported MCP HTTP methods", async () => {
		const response = await fetchUnsupportedMcpMethod();

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, POST, DELETE");
	});
});

describe("relay bridge registration", () => {
	it("registers a bridge and lists it through the MCP tool", async () => {
		const webSocket = await registerBridge();
		const payload = await callListBridgesTool();

		expect(payload.bridges).toMatchObject([
			{
				id: "dev-machine",
				os: "windows",
				status: "connected",
				toolMetadata: [
					{
						name: "codex.codex_chrome_read",
					},
				],
				tools: ["codex.codex_chrome_read"],
			},
		]);

		webSocket.close();
	});

	it("rejects duplicate bridge IDs", async () => {
		const first = await registerBridge();
		const second = await openBridgeWebSocket();

		const close = waitForClose(second);
		sendBridgeHello(second);

		await expect(close).resolves.toEqual({
			code: 1008,
			reason: "duplicate bridge id",
		});

		first.close();
	});
});
