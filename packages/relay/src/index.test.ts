import { SELF, reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import worker from "./index";

type McpToolTextResult = {
	result: { content: [{ text: string; type: "text" }] };
};
type BridgeListPayload = {
	bridges: Array<{ id: string; os: string; status: string }>;
};
type WebSocketCloseSnapshot = {
	code: number;
	reason: string;
};

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
				tools: [],
			},
			tools: [],
			type: "bridge.hello",
		}),
	);
};

const callListBridgesTool = async (): Promise<BridgeListPayload> => {
	const response = await SELF.fetch("http://example.com/mcp", {
		body: JSON.stringify({
			id: 1,
			jsonrpc: "2.0",
			method: "tools/call",
			params: {
				arguments: {},
				name: "mikoto_list_bridges",
			},
		}),
		headers: {
			"content-type": "application/json",
		},
		method: "POST",
	});
	const body = (await response.json()) as McpToolTextResult;

	expect(response.status).toBe(200);
	return JSON.parse(body.result.content[0].text) as BridgeListPayload;
};

const registerBridge = async (): Promise<WebSocket> => {
	const webSocket = await openBridgeWebSocket();

	sendBridgeHello(webSocket);
	await expect(waitForMessage(webSocket)).resolves.toBe(
		JSON.stringify({ bridgeId: "dev-machine", ok: true, type: "bridge.registered" }),
	);

	return webSocket;
};

describe("relay worker scaffold", () => {
	afterEach(async () => {
		await reset();
	});

	it("serves health checks", async () => {
		const response = await worker.fetch(new Request("http://example.com/health"));
		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toEqual({ ok: true });
	});

	it("registers a bridge and lists it through the MCP tool", async () => {
		const webSocket = await registerBridge();
		const payload = await callListBridgesTool();

		expect(payload.bridges).toMatchObject([
			{
				id: "dev-machine",
				os: "windows",
				status: "connected",
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
