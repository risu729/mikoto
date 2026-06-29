import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { loadBridgeConfig } from "./config";
import { createBridgeHelloMessage } from "./index";

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
			[{ inputSchema: { properties: {}, type: "object" }, name: "codex.codex_check" }],
		);

		expect(message).toMatchObject({
			bridge: {
				id: "dev-machine",
				os: "linux",
				status: "connected",
				tools: ["codex.codex_check"],
			},
			tools: [{ name: "codex.codex_check" }],
			type: "bridge.hello",
		});
		expect(Date.parse(message.bridge.lastHeartbeat)).not.toBeNaN();
	});
});
