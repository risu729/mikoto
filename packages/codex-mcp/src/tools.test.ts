import { describe, expect, it } from "vitest";

import { createChromeReadPrompt, createChromeReadTaskInput } from "./chrome-read";
import {
	buildCodexExecArgs,
	CodexTaskManager,
	createExecaOptions,
	DEFAULT_TOOL_TIMEOUT_MS,
	MAX_OUTPUT_BYTES,
	resolveCodexCommand,
} from "./codex";
import { CODEX_MCP_TOOLS } from "./tools";

describe("codex MCP scaffold", () => {
	it("exposes the semantic Codex tool set", () => {
		expect(CODEX_MCP_TOOLS.map((tool) => tool.name)).toEqual([
			"codex_task",
			"codex_check",
			"codex_chrome_read",
		]);
	});

	it("prefers mise for Codex CLI resolution", () => {
		expect(resolveCodexCommand(true).slice(0, 4)).toEqual(["mise", "x", "codex@latest", "--"]);
		expect(resolveCodexCommand(false)[0]).toBe("bunx");
	});
});

describe("chrome read policy", () => {
	it("creates a read-only @Chrome prompt", () => {
		const prompt = createChromeReadPrompt("Click the notification and summarize the details");

		expect(prompt).toContain("@Chrome");
		expect(prompt).toContain("Click the notification and summarize the details");
		expect(prompt).toContain("Use read-only browser access");
		expect(prompt).toContain("You may navigate or interact only when required to read");
		expect(prompt).toContain("raw HTML");
	});

	it("converts arbitrary browser read requests into Codex task input", () => {
		const input = createChromeReadTaskInput({
			model: "gpt-5.4-mini",
			request: "Click the notification and summarize the details",
		});

		expect(input.model).toBe("gpt-5.4-mini");
		expect(input.prompt).toContain("Click the notification and summarize the details");
	});
});

describe("buildCodexExecArgs", () => {
	it("builds a bounded JSON Codex exec command", () => {
		expect(buildCodexExecArgs({ prompt: "hi" })).toEqual([
			"exec",
			"--json",
			"--skip-git-repo-check",
			"hi",
		]);
	});

	it("passes an explicit model when provided", () => {
		expect(buildCodexExecArgs({ model: "gpt-5.4-mini", prompt: "hi" })).toContain("gpt-5.4-mini");
	});
});

describe("createExecaOptions", () => {
	it("closes stdin for non-interactive Codex exec runs", () => {
		expect(
			createExecaOptions({
				prompt: "hi",
				taskId: "task-1",
				timeoutMs: 1_000,
			}),
		).toMatchObject({
			maxBuffer: MAX_OUTPUT_BYTES,
			reject: false,
			stdin: "ignore",
			timeout: 1_000,
		});
	});

	it("allows large Codex JSON event streams from browser tasks", () => {
		expect(MAX_OUTPUT_BYTES).toBeGreaterThanOrEqual(8 * 1024 * 1024);
	});

	it("passes cwd through when provided", () => {
		expect(
			createExecaOptions({
				cwd: "/tmp/mikoto",
				prompt: "hi",
				taskId: "task-1",
				timeoutMs: 1_000,
			}),
		).toMatchObject({
			cwd: "/tmp/mikoto",
			stdin: "ignore",
		});
	});
});

describe("CodexTaskManager", () => {
	it("starts tasks asynchronously and exposes completion through checks", async () => {
		const manager = new CodexTaskManager({
			runner: () =>
				Promise.resolve({
					exitCode: 0,
					stderr: "",
					stdout: '{"msg":"hi"}',
					timedOut: false,
				}),
		});
		const started = manager.startTask({ prompt: "hi" });

		expect(started.status).toBe("running");
		expect(started.timeoutMs).toBe(DEFAULT_TOOL_TIMEOUT_MS);

		await Promise.resolve();

		const checked = manager.checkTask(started.taskId);

		expect(checked.status).toBe("completed");
		expect(checked.stdout).toBe('{"msg":"hi"}');
	});

	it("reports unknown task IDs without throwing", () => {
		const manager = new CodexTaskManager();

		expect(manager.checkTask("missing")).toEqual({
			status: "not_found",
			taskId: "missing",
		});
	});
});
