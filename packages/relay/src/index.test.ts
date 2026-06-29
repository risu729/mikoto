import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import worker from "./index";
import {
	DEFAULT_TOOL,
	MCP_PROTOCOL_VERSION,
	callListBridgesTool,
	fetchUnsupportedMcpMethod,
	initializeMcp,
	listMcpTools,
	openBridgeWebSocket,
	registerBridge,
	sendBridgeHello,
	waitForClose,
} from "./test-helpers";

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

		expect(body.result.tools).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					description: "List currently connected local Mikoto bridges.",
					name: "mikoto_list_bridges",
					title: "List Mikoto Bridges",
				}),
			]),
		);
		expect(body.result.tools).not.toEqual(
			expect.arrayContaining([expect.objectContaining({ name: DEFAULT_TOOL })]),
		);
	});

	it("lets the SDK reject unsupported MCP HTTP methods", async () => {
		const response = await fetchUnsupportedMcpMethod();

		expect(response.status).toBe(405);
		expect(response.headers.get("allow")).toBe("GET, POST, DELETE");
	});
});

describe("relay MCP local tool exposure", () => {
	it("lists connected local bridge tools through Streamable HTTP", async () => {
		const webSocket = await registerBridge();
		const body = await listMcpTools();

		expect(body.result.tools).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
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
					title: DEFAULT_TOOL,
				}),
			]),
		);

		webSocket.close();
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
