import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, describe, expect, it } from "vitest";

import type { CodexRunOptions } from "./codex";
import { CodexAppServerClient } from "./codex";
import { createCodexMcpServer } from "./server";
import { CodexTaskManager, DEFAULT_COMPLETED_TASK_TTL_MS } from "./tasks";
import { CODEX_MCP_TOOLS } from "./tools";

const fakeAppServerPath = fileURLToPath(new URL("./fixtures/fake-app-server.ts", import.meta.url));
const clients: CodexAppServerClient[] = [];

const createFakeClient = async (scenario = "success"): Promise<CodexAppServerClient> => {
	const client = new CodexAppServerClient({
		command: {
			args: [fakeAppServerPath, scenario],
			command: process.execPath,
		},
		stderr: process.stderr,
	});

	await client.start();
	clients.push(client);

	return client;
};

const createRejectingRunClient = (): CodexAppServerClient =>
	({
		startRun: (_input: unknown, options: CodexRunOptions = {}) => {
			options.onProgress?.({
				deltaText: "partial",
				items: [],
				partialText: "partial",
				status: "running",
				threadId: "thread-1",
				turnId: "turn-1",
				warnings: [],
			});

			return Promise.resolve({
				cancel: () => Promise.resolve(),
				result: Promise.reject(new Error("fake handle failed")),
				threadId: "thread-1",
				turnId: "turn-1",
			});
		},
	}) as unknown as CodexAppServerClient;

const waitFor = async <Value>(
	read: () => Value,
	matches: (value: Value) => boolean,
): Promise<Value> => {
	for (let index = 0; index < 50; index += 1) {
		const value = read();

		if (matches(value)) {
			return value;
		}

		// oxlint-disable-next-line eslint/no-await-in-loop -- Polling tests need sequential waits.
		await sleep(10);
	}

	throw new Error("Timed out waiting for condition");
};

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
});

describe("CodexTaskManager completion", () => {
	it("starts a task and returns its final result later", async () => {
		const manager = new CodexTaskManager(await createFakeClient(), {
			idFactory: () => "task-1",
		});
		const started = manager.start("task", { prompt: "hi", toolKind: "task" });

		expect(started).toMatchObject({
			ok: true,
			task: { id: "task-1", status: "running" },
		});

		const completed = await waitFor(
			() => manager.result("task-1"),
			(payload) => payload.ok,
		);

		expect(completed).toMatchObject({
			ok: true,
			result: {
				finalText: "Hello from fake app-server",
				ok: true,
				status: "completed",
			},
			task: {
				finalText: "Hello from fake app-server",
				status: "completed",
			},
		});
	});
});

describe("CodexTaskManager progress", () => {
	it("returns partial progress while a task is still running", async () => {
		const manager = new CodexTaskManager(await createFakeClient("timeout-never-completes"), {
			idFactory: () => "task-1",
		});

		manager.start("task", { prompt: "hi", timeoutMs: 10_000, toolKind: "task" });
		const status = await waitFor(
			() => manager.status("task-1"),
			(payload) => payload.ok && payload.task.partialText === "partial",
		);

		expect(status).toMatchObject({
			ok: true,
			task: {
				items: [],
				partialText: "partial",
				status: "running",
			},
		});
		expect(manager.result("task-1")).toMatchObject({
			error: { code: "task_running" },
			ok: false,
		});
	});
});

describe("CodexTaskManager cancellation", () => {
	it("requests cancellation through the Codex app-server turn", async () => {
		const manager = new CodexTaskManager(await createFakeClient("interrupt-completes"), {
			idFactory: () => "task-1",
		});

		manager.start("task", { prompt: "hi", timeoutMs: 10_000, toolKind: "task" });
		await waitFor(
			() => manager.status("task-1"),
			(payload) => payload.ok && payload.task.partialText === "partial",
		);

		expect(manager.cancel("task-1")).toMatchObject({
			ok: true,
			task: { cancelRequested: true },
		});
		const result = await waitFor(
			() => manager.result("task-1"),
			(payload) => payload.ok,
		);

		expect(result).toMatchObject({
			ok: true,
			result: {
				ok: false,
				status: "interrupted",
			},
			task: {
				status: "interrupted",
			},
		});
	});
});

describe("CodexTaskManager cleanup", () => {
	it("cleans up completed tasks after the configured TTL", async () => {
		let now = 1_000;
		const manager = new CodexTaskManager(await createFakeClient(), {
			completedTaskTtlMs: 100,
			idFactory: () => "task-1",
			now: () => now,
		});

		manager.start("task", { prompt: "hi", toolKind: "task" });
		await waitFor(
			() => manager.result("task-1"),
			(payload) => payload.ok,
		);

		now += 101;

		expect(manager.status("task-1")).toMatchObject({
			error: { code: "task_not_found" },
			ok: false,
		});
	});
});

describe("CodexTaskManager TTL validation", () => {
	it("falls back to the default completed task TTL when configured with an invalid TTL", async () => {
		let now = 1_000;
		const manager = new CodexTaskManager(await createFakeClient(), {
			completedTaskTtlMs: -1,
			idFactory: () => "task-1",
			now: () => now,
		});

		manager.start("task", { prompt: "hi", toolKind: "task" });
		await waitFor(
			() => manager.result("task-1"),
			(payload) => payload.ok,
		);

		now += DEFAULT_COMPLETED_TASK_TTL_MS - 1;

		expect(manager.status("task-1")).toMatchObject({
			ok: true,
			task: { id: "task-1" },
		});

		now += 2;

		expect(manager.status("task-1")).toMatchObject({
			error: { code: "task_not_found" },
			ok: false,
		});
	});
});

describe("CodexTaskManager failures", () => {
	it("preserves known run ids on synthetic failed task results", async () => {
		const manager = new CodexTaskManager(createRejectingRunClient(), {
			idFactory: () => "task-1",
		});

		manager.start("task", { prompt: "hi", toolKind: "task" });

		const result = await waitFor(
			() => manager.result("task-1"),
			(payload) => payload.ok && payload.result.status === "failed",
		);

		expect(result).toMatchObject({
			ok: true,
			result: {
				error: "fake handle failed",
				status: "failed",
				threadId: "thread-1",
				turnId: "turn-1",
			},
			task: {
				threadId: "thread-1",
				turnId: "turn-1",
			},
		});
	});
});

describe("Codex async MCP server", () => {
	it("registers the async fire-and-poll tool set", async () => {
		const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
		const mcpClient = new Client({ name: "test", version: "0.0.0" });
		const server = await createCodexMcpServer({ client: await createFakeClient() });

		await Promise.all([mcpClient.connect(clientTransport), server.connect(serverTransport)]);

		const listed = await mcpClient.listTools();

		expect(listed.tools.map((tool) => tool.name)).toEqual(CODEX_MCP_TOOLS.map((tool) => tool.name));

		await mcpClient.close();
		await server.close();
	});
});
