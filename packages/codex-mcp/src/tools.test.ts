import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { afterEach, describe, expect, it } from "vitest";

import {
	createChromeReadPrompt,
	createChromeReadTaskInput,
	createReadOnlyTaskPrompt,
} from "./chrome-read";
import {
	CODEX_CHROME_READ_MODEL,
	CODEX_CHROME_READ_REASONING_EFFORT,
	CODEX_TASK_MODEL,
	CODEX_TASK_REASONING_EFFORT,
	CodexAppServerClient,
	DEFAULT_TOOL_TIMEOUT_MS,
	resolveCodexCommand,
	resolveInstalledCodexCommand,
} from "./codex";
import { CODEX_MCP_TOOLS } from "./tools";

const fakeAppServerPath = fileURLToPath(new URL("./fixtures/fake-app-server.ts", import.meta.url));
const clients: CodexAppServerClient[] = [];
const tempDirs: string[] = [];

const createTempPathWithCommands = async (commands: readonly string[]): Promise<string> => {
	const dir = await mkdtemp(join(tmpdir(), "mikoto-codex-path-"));
	tempDirs.push(dir);

	await Promise.all(
		commands.map(async (command) => {
			if (process.platform === "win32") {
				await writeFile(join(dir, `${command}.cmd`), "@echo off\r\necho fake\r\n");
			} else {
				const path = join(dir, command);
				await writeFile(path, "#!/bin/sh\necho fake\n");
				await chmod(path, 0o755);
			}
		}),
	);

	return dir;
};

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

afterEach(async () => {
	await Promise.all(clients.splice(0).map((client) => client.close()));
	await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })));
});

describe("codex MCP tool set", () => {
	it("exposes async fire-and-poll Codex tools", () => {
		expect(CODEX_MCP_TOOLS.map((tool) => tool.name)).toEqual([
			"codex_task_start",
			"codex_chrome_read_start",
			"codex_run_status",
			"codex_run_result",
			"codex_run_cancel",
		]);
	});

	it("respects PATH before falling back to mise and bunx", async () => {
		await expect(
			resolveCodexCommand(await createTempPathWithCommands(["codex", "mise", "bunx"])),
		).resolves.toEqual(["codex"]);
		await expect(
			resolveCodexCommand(await createTempPathWithCommands(["mise", "bunx"])),
		).resolves.toEqual(["mise", "x", "codex@latest", "--", "codex"]);
		await expect(resolveCodexCommand(await createTempPathWithCommands(["bunx"]))).resolves.toEqual([
			"bunx",
			"codex@latest",
		]);
	});

	it("fails clearly when no Codex command fallback is available", async () => {
		await expect(resolveCodexCommand(await createTempPathWithCommands([]))).rejects.toThrow(
			"Unable to find Codex CLI",
		);
	});

	it("documents fixed model defaults in code", () => {
		expect(CODEX_TASK_MODEL).toBe("gpt-5.5");
		expect(CODEX_TASK_REASONING_EFFORT).toBe("medium");
		expect(CODEX_CHROME_READ_MODEL).toBe("gpt-5.5");
		expect(CODEX_CHROME_READ_REASONING_EFFORT).toBe("low");
	});
});

describe("Codex command resolution", () => {
	it("allows an explicit Codex command override", async () => {
		await expect(
			resolveInstalledCodexCommand({
				MIKOTO_CODEX_COMMAND: "C:\\tools\\codex.exe",
			}),
		).resolves.toEqual({
			args: [],
			command: "C:\\tools\\codex.exe",
		});
	});

	it("parses Codex command override arguments and quoted paths", async () => {
		await expect(
			resolveInstalledCodexCommand({
				MIKOTO_CODEX_COMMAND: '"C:\\Program Files\\Codex\\codex.exe" --profile windows',
			}),
		).resolves.toEqual({
			args: ["--profile", "windows"],
			command: "C:\\Program Files\\Codex\\codex.exe",
		});
	});

	it("rejects an empty Codex command override", async () => {
		await expect(
			resolveInstalledCodexCommand({
				MIKOTO_CODEX_COMMAND: "   ",
			}),
		).rejects.toThrow("MIKOTO_CODEX_COMMAND must not be empty");
	});

	it("rejects a Codex command override with an unterminated quote", async () => {
		await expect(
			resolveInstalledCodexCommand({
				MIKOTO_CODEX_COMMAND: '"C:\\Program Files\\Codex\\codex.exe',
			}),
		).rejects.toThrow("MIKOTO_CODEX_COMMAND contains an unterminated quote");
	});
});

describe("prompt policies", () => {
	it("creates a short read-only Codex task prompt", () => {
		const prompt = createReadOnlyTaskPrompt("Summarize this repository");

		expect(prompt).toContain("read-only MCP tool");
		expect(prompt).toContain("Summarize this repository");
	});

	it("creates a read-only @Chrome prompt", () => {
		const prompt = createChromeReadPrompt("Click the notification and summarize the details");

		expect(prompt).toContain("@Chrome");
		expect(prompt).toContain("Click the notification and summarize the details");
		expect(prompt).toContain("Use read-only browser access");
		expect(prompt).toContain("You may navigate or interact only when required to read");
		expect(prompt).toContain("raw HTML");
	});

	it("converts arbitrary browser read requests into Codex run input", () => {
		const input = createChromeReadTaskInput({
			request: "Click the notification and summarize the details",
		});

		expect(input.prompt).toContain("Click the notification and summarize the details");
		expect(input.toolKind).toBe("chrome_read");
	});
});

describe("CodexAppServerClient successful runs", () => {
	it("runs a turn and returns a normalized final result", async () => {
		const client = await createFakeClient();
		const result = await client.run({
			prompt: "hi",
			toolKind: "task",
		});

		expect(result).toMatchObject({
			finalText: "Hello from fake app-server",
			ok: true,
			status: "completed",
			threadId: "thread-1",
			turnId: "turn-1",
		});
		expect(result.items).toEqual([
			{
				id: "item-1",
				text: "Hello from fake app-server",
				type: "agent_message",
			},
		]);
	});
});

describe("CodexAppServerClient failed runs", () => {
	it("returns a structured failed result for app-server turn errors", async () => {
		const client = await createFakeClient("turn-failed");
		const result = await client.run({
			prompt: "hi",
			toolKind: "task",
		});

		expect(result.ok).toBe(false);
		expect(result.status).toBe("failed");
		expect(result.warnings).toContain("fake turn failed");
	});

	it("interrupts app-server turns on timeout", async () => {
		const client = await createFakeClient("timeout-never-completes");
		const result = await client.run({
			prompt: "hi",
			timeoutMs: 1,
			toolKind: "task",
		});

		expect(result.ok).toBe(false);
		expect(result.status).toBe("timed_out");
	});

	it("uses accumulated deltas when no completed agent message arrives", async () => {
		const client = await createFakeClient("delta-completed-no-item");
		const result = await client.run({
			prompt: "hi",
			toolKind: "task",
		});

		expect(result.ok).toBe(true);
		expect(result.status).toBe("completed");
		expect(result.finalText).toBe("partial");
		expect(result.warnings).toContain(
			"Used accumulated agent message deltas because no completed agent message was received.",
		);
	});
});

describe("CodexAppServerClient process lifecycle", () => {
	it("fails hard if the owned app-server exits", async () => {
		const client = new CodexAppServerClient({
			command: {
				args: [fakeAppServerPath, "exit-after-init"],
				command: process.execPath,
			},
		});

		await client.start();
		clients.push(client);
		await sleep(10);
		const result = await client.run({
			prompt: "hi",
			toolKind: "task",
		});

		expect(result.ok).toBe(false);
		expect(result.error).toContain("Codex app-server exited unexpectedly");
	});

	it("uses a five minute timeout by default", () => {
		expect(DEFAULT_TOOL_TIMEOUT_MS).toBe(300_000);
	});
});
