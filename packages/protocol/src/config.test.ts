import Ajv2020 from "ajv/dist/2020";
import { describe, expect, it } from "vitest";

import docsSchema from "../../../packages/docs/public/schemas/mikoto.schema.json" with { type: "json" };
import rootSchema from "../../../schemas/mikoto.schema.json" with { type: "json" };
import { BackendServerSchema, MikotoConfigSchema } from "./config";

const validConfigs = [
	[
		"stdio backend",
		{
			relay: { url: "ws://localhost:8787/bridge" },
			servers: [
				{
					args: ["packages/codex-mcp/src/index.ts"],
					command: "bun",
					cwd: ".",
					env: { MIKOTO_BRIDGE_ID: "dev-machine" },
					id: "codex",
					transport: "stdio",
				},
			],
		},
	],
	[
		"http backend",
		{
			relay: { url: "wss://relay.example.com/bridge" },
			servers: [
				{
					aliases: [
						{
							name: "local_chrome_read_start",
							target: "codex.codex_chrome_read_start",
						},
					],
					id: "remote",
					transport: "http",
					url: "https://example.com/mcp",
				},
			],
		},
	],
] as const;

const invalidConfigs = [
	["unknown root key", { extra: true, relay: { url: "ws://localhost:8787/bridge" } }],
	["invalid relay URL", { relay: { url: "https://localhost:8787/bridge" } }],
	[
		"invalid backend id",
		{
			relay: { url: "ws://localhost:8787/bridge" },
			servers: [{ command: "bun", id: "codex server", transport: "stdio" }],
		},
	],
	[
		"invalid http backend URL",
		{
			relay: { url: "ws://localhost:8787/bridge" },
			servers: [{ id: "remote", transport: "http", url: "ws://example.com/mcp" }],
		},
	],
	[
		"unknown backend field",
		{
			relay: { url: "ws://localhost:8787/bridge" },
			servers: [{ command: "bun", id: "codex", timeoutMs: 1000, transport: "stdio" }],
		},
	],
] as const;

describe("MikotoConfigSchema stdio backends", () => {
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
});

describe("MikotoConfigSchema http backends", () => {
	it("accepts http transport in the config schema", () => {
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

	it("rejects non-http backend URLs", () => {
		const result = BackendServerSchema.safeParse({
			id: "remote",
			transport: "http",
			url: "ws://example.com/mcp",
		});

		expect(result.success).toBe(false);
	});
});

describe("MikotoConfigSchema validation", () => {
	it("accepts dotted bridge ids", () => {
		const config = MikotoConfigSchema.parse({
			bridge: { id: "dev-machine.local" },
			relay: { url: "ws://localhost:8787/bridge" },
		});

		expect(config.bridge.id).toBe("dev-machine.local");
	});

	it("rejects non-websocket relay URLs", () => {
		const result = MikotoConfigSchema.safeParse({
			relay: { url: "https://localhost:8787/bridge" },
		});

		expect(result.success).toBe(false);
	});

	it("rejects unknown root keys", () => {
		const result = MikotoConfigSchema.safeParse({
			extra: true,
			relay: { url: "ws://localhost:8787/bridge" },
		});

		expect(result.success).toBe(false);
	});

	it("rejects invalid backend ids", () => {
		const result = BackendServerSchema.safeParse({
			command: "bun",
			id: "codex server",
			transport: "stdio",
		});

		expect(result.success).toBe(false);
	});
});

describe("published mikoto.toml JSON Schema", () => {
	const ajv = new Ajv2020();
	const validateConfig = ajv.compile(rootSchema);

	it("publishes the same schema through the docs site", () => {
		expect(docsSchema).toEqual(rootSchema);
	});

	it.each(validConfigs)("accepts valid %s config like the runtime parser", (_name, config) => {
		expect(MikotoConfigSchema.safeParse(config).success).toBe(true);
		expect(validateConfig(config)).toBe(true);
	});

	it.each(invalidConfigs)("rejects %s like the runtime parser", (_name, config) => {
		expect(MikotoConfigSchema.safeParse(config).success).toBe(false);
		expect(validateConfig(config)).toBe(false);
	});
});
