import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it, vi } from "vitest";

import type { BackendDiscovery } from "./backends";
import { loadBridgeConfig } from "./config";
import { createBridgeHelloMessage, handleRelayMessage } from "./index";

describe("loadBridgeConfig", () => {
	it("defaults bridge id to a non-empty host name", async () => {
		const dir = await mkdtemp(join(tmpdir(), "mikoto-bridge-"));
		const configPath = join(dir, "mikoto.toml");

		await writeFile(
			configPath,
			`
[relay]
url = "ws://localhost:8787/bridge"
`,
		);

		const config = await loadBridgeConfig(configPath);
		expect(config.bridge.id.length).toBeGreaterThan(0);
	});
});

describe("createBridgeHelloMessage", () => {
	it("creates the initial relay registration envelope", () => {
		const message = createBridgeHelloMessage(
			{
				bridge: { id: "dev-machine" },
				os: "linux",
				relay: { url: "ws://localhost:8787/bridge" },
				servers: [],
			},
			[{ inputSchema: { properties: {}, type: "object" }, name: "codex.codex_task" }],
		);

		expect(message).toMatchObject({
			bridge: {
				id: "dev-machine",
				os: "linux",
				status: "connected",
				tools: ["codex.codex_task"],
			},
			tools: [{ name: "codex.codex_task" }],
			type: "bridge.hello",
		});
		expect(Date.parse(message.bridge.lastHeartbeat)).not.toBeNaN();
	});
});

describe("handleRelayMessage", () => {
	it("returns a structured error for invalid relay messages with a call id", async () => {
		const send = vi.fn();
		const socket = { send } as unknown as WebSocket;
		const backendDiscovery = {
			callTool: vi.fn(),
			close: vi.fn(),
			tools: [],
		} satisfies BackendDiscovery;

		await handleRelayMessage(
			backendDiscovery,
			socket,
			JSON.stringify({ id: "call-1", type: "unexpected" }),
		);

		expect(send).toHaveBeenCalledWith(
			JSON.stringify({
				error: {
					code: "invalid_relay_message",
					message: "Invalid relay tool call.",
				},
				id: "call-1",
				ok: false,
				type: "tool.result",
			}),
		);
		expect(backendDiscovery.callTool).not.toHaveBeenCalled();
	});
});
