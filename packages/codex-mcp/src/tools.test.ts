import { describe, expect, it } from "vitest";

import {
	buildCodexExecArgs,
	CodexTaskManager,
	DEFAULT_TOOL_TIMEOUT_MS,
	resolveCodexCommand,
} from "./codex";
import { CODEX_MCP_TOOLS } from "./tools";

describe("codex MCP scaffold", () => {
	it("exposes only the small non-Chrome tool set", () => {
		expect(CODEX_MCP_TOOLS.map((tool) => tool.name)).toEqual(["codex_task", "codex_check"]);
	});

	it("prefers mise for Codex CLI resolution", () => {
		expect(resolveCodexCommand(true).slice(0, 4)).toEqual(["mise", "x", "codex@latest", "--"]);
		expect(resolveCodexCommand(false)[0]).toBe("bunx");
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
