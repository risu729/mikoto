import { describe, expect, it } from "vitest";

import {
	BridgeHelloMessageSchema,
	BridgeToRelayMessageSchema,
	RelayToBridgeMessageSchema,
	ToolCallResultSchema,
} from "./relay";

const bridgeMetadata = {
	id: "dev-machine",
	lastHeartbeat: "2026-06-27T00:00:00.000Z",
	os: "linux",
	status: "connected",
	tools: ["codex.codex_chrome_read"],
} as const;

describe("BridgeHelloMessageSchema", () => {
	it("accepts safe bridge metadata and tool metadata", () => {
		const message = BridgeHelloMessageSchema.parse({
			bridge: bridgeMetadata,
			tools: [
				{
					description: "Read visible browser state.",
					inputSchema: {
						additionalProperties: false,
						properties: {
							request: { type: "string" },
						},
						required: ["request"],
						type: "object",
					},
					name: "codex.codex_chrome_read",
				},
			],
			type: "bridge.hello",
		});

		expect(message.tools[0]?.name).toBe("codex.codex_chrome_read");
	});

	it("defaults missing tool input schemas to an object schema", () => {
		const message = BridgeHelloMessageSchema.parse({
			bridge: bridgeMetadata,
			tools: [{ name: "codex.codex_check" }],
			type: "bridge.hello",
		});

		expect(message.tools[0]?.inputSchema).toEqual({
			additionalProperties: true,
			properties: {},
			type: "object",
		});
	});
});

describe("BridgeHelloMessageSchema validation", () => {
	it("rejects unsafe non-json tool metadata", () => {
		const result = BridgeHelloMessageSchema.safeParse({
			bridge: bridgeMetadata,
			tools: [
				{
					inputSchema: {
						value: Number.NaN,
					},
					name: "codex.codex_chrome_read",
				},
			],
			type: "bridge.hello",
		});

		expect(result.success).toBe(false);
	});

	it("rejects unknown bridge message keys", () => {
		const result = BridgeHelloMessageSchema.safeParse({
			bridge: bridgeMetadata,
			secret: "do not accept this",
			tools: [],
			type: "bridge.hello",
		});

		expect(result.success).toBe(false);
	});
});

describe("RelayToBridgeMessageSchema", () => {
	it("accepts tool calls with json arguments", () => {
		const request = RelayToBridgeMessageSchema.parse({
			arguments: {
				request: "summarize this page",
			},
			bridgeId: "dev-machine",
			id: "call-1",
			tool: "codex.codex_chrome_read",
			type: "tool.call",
		});

		expect(request.arguments).toEqual({ request: "summarize this page" });
	});

	it("defaults missing tool call arguments", () => {
		const request = RelayToBridgeMessageSchema.parse({
			id: "call-1",
			tool: "codex.codex_check",
			type: "tool.call",
		});

		expect(request.arguments).toEqual({});
	});

	it("rejects non-json tool call arguments", () => {
		const result = RelayToBridgeMessageSchema.safeParse({
			arguments: {
				value: Number.NaN,
			},
			id: "call-1",
			tool: "codex.codex_check",
			type: "tool.call",
		});

		expect(result.success).toBe(false);
	});
});

describe("ToolCallResultSchema", () => {
	it("accepts successful json results", () => {
		const result = ToolCallResultSchema.parse({
			id: "call-1",
			ok: true,
			result: {
				items: ["one", "two"],
			},
			type: "tool.result",
		});

		expect(result.ok).toBe(true);
	});

	it("accepts structured error results", () => {
		const result = ToolCallResultSchema.parse({
			error: {
				code: "bridge_busy",
				message: "Bridge already has an in-flight tool call.",
			},
			id: "call-1",
			ok: false,
			type: "tool.result",
		});

		expect(result.ok).toBe(false);
	});

	it("rejects success results with errors", () => {
		const result = ToolCallResultSchema.safeParse({
			error: {
				code: "unexpected",
				message: "Should not be accepted.",
			},
			id: "call-1",
			ok: true,
			type: "tool.result",
		});

		expect(result.success).toBe(false);
	});
});

describe("BridgeToRelayMessageSchema", () => {
	it("accepts supported bridge-to-relay message envelopes", () => {
		const result = BridgeToRelayMessageSchema.safeParse({
			bridgeId: "dev-machine",
			lastHeartbeat: "2026-06-27T00:00:00.000Z",
			status: "connected",
			type: "bridge.heartbeat",
		});

		expect(result.success).toBe(true);
	});
});
