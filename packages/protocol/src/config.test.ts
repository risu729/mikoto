import { describe, expect, it } from "vitest";

import { MikotoConfigSchema } from "./config";

describe("MikotoConfigSchema", () => {
	it("accepts stdio backend configuration", () => {
		const config = MikotoConfigSchema.parse({
			relay: { url: "ws://localhost:8787/bridge" },
			servers: [
				{
					args: ["run", "start"],
					command: "bun",
					id: "codex",
					transport: "stdio",
				},
			],
		});

		expect(config.bridge).toEqual({});
		expect(config.servers[0]?.transport).toBe("stdio");
	});

	it("keeps http transport in the schema for future support", () => {
		const config = MikotoConfigSchema.parse({
			relay: { url: "ws://localhost:8787/bridge" },
			servers: [
				{
					id: "remote",
					transport: "http",
					url: "https://example.com/mcp",
				},
			],
		});

		expect(config.servers[0]?.transport).toBe("http");
	});
});
