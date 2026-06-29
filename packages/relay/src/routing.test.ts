import { reset } from "cloudflare:test";
import { afterEach, describe, expect, it } from "vitest";

import {
	DEFAULT_TOOL,
	callLocalTool,
	callSuccessfulExposedTool,
	registerBridge,
	registerBridgeWithId,
	sendToolSuccess,
	waitForMessage,
} from "./test-helpers";

afterEach(async () => {
	await reset();
});

describe("relay bridge tool routing", () => {
	it("forwards a tool call to the selected bridge", async () => {
		const webSocket = await registerBridge();
		const call = callSuccessfulExposedTool(DEFAULT_TOOL, {
			arguments: { request: "read page" },
			bridgeId: "dev-machine",
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

describe("relay bridge selection errors", () => {
	it("rejects ambiguous bridge selection", async () => {
		const first = await registerBridgeWithId("first-machine");
		const second = await registerBridgeWithId("second-machine");

		await expect(callLocalTool({ tool: DEFAULT_TOOL })).resolves.toMatchObject({
			error: { code: "ambiguous_bridge" },
			ok: false,
			type: "tool.result",
		});

		first.close();
		second.close();
	});

	it("rejects missing bridge selection", async () => {
		const webSocket = await registerBridge();

		await expect(
			callLocalTool({ bridgeId: "missing-machine", tool: DEFAULT_TOOL }),
		).resolves.toMatchObject({
			error: { code: "missing_bridge" },
			ok: false,
			type: "tool.result",
		});

		webSocket.close();
	});
});

describe("relay bridge in-flight calls", () => {
	it("rejects a second in-flight call to the same bridge", async () => {
		const webSocket = await registerBridge();
		const first = callSuccessfulExposedTool(DEFAULT_TOOL, { bridgeId: "dev-machine" });
		const request = JSON.parse(await waitForMessage(webSocket)) as { id: string };

		await expect(
			callLocalTool({ bridgeId: "dev-machine", tool: DEFAULT_TOOL }),
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
		const call = callLocalTool({ bridgeId: "dev-machine", tool: DEFAULT_TOOL });

		await waitForMessage(webSocket);
		webSocket.close();

		await expect(call).resolves.toMatchObject({
			error: { code: "bridge_disconnected" },
			ok: false,
			type: "tool.result",
		});
	});
});
