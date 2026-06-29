import type { BackendServer } from "@mikoto/protocol";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";
import { describe, expect, it, vi } from "vitest";

import type { BackendClientFactory } from "./backends";
import { startConfiguredBackends } from "./backends";

type StdioBackendServer = Extract<BackendServer, { transport: "stdio" }>;

const createStdioServer = (overrides: Partial<StdioBackendServer> = {}): StdioBackendServer => ({
	aliases: [],
	args: [],
	command: "mock-mcp",
	env: {},
	id: "codex",
	transport: "stdio",
	...overrides,
});

const chromeReadTool = {
	description: "Read browser context.",
	inputSchema: {
		properties: {
			request: { type: "string" },
		},
		required: ["request"],
		type: "object",
	},
	name: "codex_chrome_read",
} satisfies ListToolsResult["tools"][number];

const expectedChromeReadTools = [
	{
		description: "Read browser context.",
		inputSchema: {
			properties: {
				request: { type: "string" },
			},
			required: ["request"],
			type: "object",
		},
		name: "codex.codex_chrome_read",
	},
	{
		description: "Read browser context.",
		inputSchema: {
			properties: {
				request: { type: "string" },
			},
			required: ["request"],
			type: "object",
		},
		name: "local_chrome_read",
	},
];

const createCloseMock = () => vi.fn<() => Promise<void>>(() => Promise.resolve());

const createClientFactory = (
	close: () => Promise<void>,
	result: Error | ListToolsResult,
): BackendClientFactory =>
	vi.fn(() =>
		Promise.resolve({
			close,
			listTools: () => (result instanceof Error ? Promise.reject(result) : Promise.resolve(result)),
		}),
	);

describe("startConfiguredBackends discovery", () => {
	it("discovers stdio tools with backend-prefixed names and aliases", async () => {
		const close = createCloseMock();
		const clientFactory = createClientFactory(close, { tools: [chromeReadTool] });
		const discovery = await startConfiguredBackends(
			[
				createStdioServer({
					aliases: [{ name: "local_chrome_read", target: "codex.codex_chrome_read" }],
				}),
			],
			{ clientFactory },
		);

		expect(discovery.tools).toEqual(expectedChromeReadTools);

		await discovery.close();
		expect(close).toHaveBeenCalledTimes(1);
	});

	it("fails when an alias target is missing", async () => {
		const close = createCloseMock();
		const clientFactory = createClientFactory(close, { tools: [] });

		await expect(
			startConfiguredBackends(
				[
					createStdioServer({
						aliases: [{ name: "missing_alias", target: "codex.missing" }],
					}),
				],
				{ clientFactory },
			),
		).rejects.toThrow("Alias missing_alias targets unknown tool: codex.missing");
		expect(close).toHaveBeenCalledTimes(1);
	});
});

describe("startConfiguredBackends failures", () => {
	it("returns a clear unimplemented error for HTTP backends", async () => {
		await expect(
			startConfiguredBackends([
				{
					aliases: [],
					id: "remote",
					transport: "http",
					url: "https://example.com/mcp",
				},
			]),
		).rejects.toThrow("HTTP backend transport is not implemented yet: remote");
	});

	it("fails startup when tool discovery fails", async () => {
		const close = createCloseMock();
		const clientFactory = createClientFactory(close, new Error("backend unavailable"));

		await expect(startConfiguredBackends([createStdioServer()], { clientFactory })).rejects.toThrow(
			"backend unavailable",
		);
		expect(close).toHaveBeenCalledTimes(1);
	});
});
