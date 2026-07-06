import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import { selectDisconnectedBridgeKeys } from "./routing";
import type { RegisteredBridge } from "./routing";
import {
	DEFAULT_TOOL,
	callRawMcpTool,
	registerBridge,
	registerBridgeWithId,
	sendToolSuccess,
	waitForMessage,
} from "./test-helpers";

afterEach(async () => {
	await reset();
});

type DispatcherInput = {
	arguments?: Record<string, unknown>;
	bridgeId?: string;
	tool: string;
};

type ToolCallPayload = {
	error?: { code: string; message: string };
	id: string;
	ok: boolean;
	result?: unknown;
	type: "tool.result";
};

const callDispatcherTool = async (input: DispatcherInput): Promise<ToolCallPayload> => {
	const body = await callRawMcpTool("mikoto_call_tool", input);

	return JSON.parse(body.result.content[0]?.text ?? "{}") as ToolCallPayload;
};

const callSuccessfulDispatcherTool = async (
	input: DispatcherInput,
): Promise<Awaited<ReturnType<typeof callRawMcpTool>>["result"]> => {
	const body = await callRawMcpTool("mikoto_call_tool", input);

	return body.result;
};

describe("relay bridge stale records", () => {
	it("selects stored bridges without live sockets for pruning", () => {
		const bridges = new Map<string, RegisteredBridge>([
			[
				"bridge:alive-machine",
				{
					connectedAt: "2026-07-06T00:00:00.000Z",
					id: "alive-machine",
					lastHeartbeat: "2026-07-06T00:00:00.000Z",
					os: "windows",
					status: "connected",
					toolMetadata: [],
					tools: [],
				},
			],
			[
				"bridge:stale-machine",
				{
					connectedAt: "2026-07-06T00:00:00.000Z",
					id: "stale-machine",
					lastHeartbeat: "2026-07-06T00:00:00.000Z",
					os: "windows",
					status: "connected",
					toolMetadata: [],
					tools: [],
				},
			],
			[
				"bridge:already-disconnected",
				{
					connectedAt: "2026-07-06T00:00:00.000Z",
					id: "already-disconnected",
					lastHeartbeat: "2026-07-06T00:00:00.000Z",
					os: "windows",
					status: "disconnected",
					toolMetadata: [],
					tools: [],
				},
			],
		]);

		expect(selectDisconnectedBridgeKeys(bridges, new Set(["alive-machine"]))).toEqual([
			"bridge:stale-machine",
		]);
	});
});

describe("relay dynamic tool dispatcher routing", () => {
	it("forwards a dynamic tool call to the selected bridge", async () => {
		const webSocket = await registerBridge();
		const call = callSuccessfulDispatcherTool({
			arguments: { request: "read page" },
			bridgeId: "dev-machine",
			tool: DEFAULT_TOOL,
		});
		const request = JSON.parse(await waitForMessage(webSocket)) as { id: string; tool: string };

		expect(request).toMatchObject({
			arguments: { request: "read page" },
			bridgeId: "dev-machine",
			tool: DEFAULT_TOOL,
			type: "tool.call",
		});
		sendToolSuccess(webSocket, request, { content: [{ text: "done", type: "text" }] });

		await expect(call).resolves.toEqual({
			content: [{ text: "done", type: "text" }],
		});
		webSocket.close();
	});
});

describe("relay dynamic tool dispatcher defaults", () => {
	it("defaults dynamic tool arguments to an empty object", async () => {
		const webSocket = await registerBridge();
		const call = callSuccessfulDispatcherTool({ bridgeId: "dev-machine", tool: DEFAULT_TOOL });
		const request = JSON.parse(await waitForMessage(webSocket)) as { id: string };

		expect(request).toMatchObject({
			arguments: {},
			bridgeId: "dev-machine",
			tool: DEFAULT_TOOL,
			type: "tool.call",
		});
		sendToolSuccess(webSocket, request, { content: [{ text: "done", type: "text" }] });

		await expect(call).resolves.toEqual({
			content: [{ text: "done", type: "text" }],
		});
		webSocket.close();
	});
});

describe("relay dynamic tool dispatcher errors", () => {
	it("returns bridge selection errors through the dispatcher", async () => {
		const first = await registerBridgeWithId("first-machine");
		const second = await registerBridgeWithId("second-machine");

		await expect(callDispatcherTool({ tool: DEFAULT_TOOL })).resolves.toMatchObject({
			error: { code: "ambiguous_bridge" },
			ok: false,
			type: "tool.result",
		});
		await expect(
			callDispatcherTool({ bridgeId: "missing-machine", tool: DEFAULT_TOOL }),
		).resolves.toMatchObject({
			error: { code: "missing_bridge" },
			ok: false,
			type: "tool.result",
		});

		first.close();
		second.close();
	});

	it("returns tool lookup and backend result errors through the dispatcher", async () => {
		await expect(callDispatcherTool({ tool: DEFAULT_TOOL })).resolves.toMatchObject({
			error: { code: "tool_not_found" },
			ok: false,
			type: "tool.result",
		});

		const webSocket = await registerBridge();
		const call = callRawMcpTool("mikoto_call_tool", {
			bridgeId: "dev-machine",
			tool: DEFAULT_TOOL,
		});
		const request = JSON.parse(await waitForMessage(webSocket)) as { id: string };
		sendToolSuccess(webSocket, request, { content: "invalid" });

		const body = await call;
		expect(body.result.isError).toBe(true);
		expect(JSON.parse(body.result.content[0]?.text ?? "{}")).toMatchObject({
			error: { code: "invalid_backend_result" },
			ok: false,
			type: "tool.result",
		});
		webSocket.close();
	});
});

describe("relay bridge in-flight calls", () => {
	it("rejects a second in-flight call to the same bridge", async () => {
		const webSocket = await registerBridge();
		const first = callSuccessfulDispatcherTool({ bridgeId: "dev-machine", tool: DEFAULT_TOOL });
		const request = JSON.parse(await waitForMessage(webSocket)) as { id: string };

		await expect(
			callDispatcherTool({ bridgeId: "dev-machine", tool: DEFAULT_TOOL }),
		).resolves.toMatchObject({
			error: { code: "bridge_busy" },
			ok: false,
			type: "tool.result",
		});

		sendToolSuccess(webSocket, request, { content: [{ text: "done", type: "text" }] });
		await expect(first).resolves.toEqual({ content: [{ text: "done", type: "text" }] });
		webSocket.close();
	});

	it("rejects an in-flight call when the bridge disconnects", async () => {
		const webSocket = await registerBridge();
		const call = callDispatcherTool({ bridgeId: "dev-machine", tool: DEFAULT_TOOL });

		await waitForMessage(webSocket);
		webSocket.close();

		await expect(call).resolves.toMatchObject({
			error: { code: "bridge_disconnected" },
			ok: false,
			type: "tool.result",
		});
	});
});
