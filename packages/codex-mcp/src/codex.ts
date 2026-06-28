import { randomUUID } from "node:crypto";

import { execa } from "execa";
import { DateTime } from "luxon";

const CHECK_AFTER_MS = 1_000;
const DEFAULT_TOOL_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 8 * 1024 * 1024;
const MAX_TOOL_TIMEOUT_MS = 300_000;
const TERMINATION_GRACE_MS = 2_000;

type CodexTaskInput = {
	cwd?: string;
	model?: string;
	prompt: string;
	timeoutMs?: number;
};
type CodexTaskRequest = {
	cwd?: string;
	model?: string;
	prompt: string;
	taskId: string;
	timeoutMs: number;
};
type CodexRunResult = {
	exitCode: number | null;
	stderr: string;
	stdout: string;
	timedOut: boolean;
};
type CodexTaskRunner = (request: CodexTaskRequest) => Promise<CodexRunResult>;
type CodexTaskStatus = "completed" | "failed" | "not_found" | "running" | "timed_out";

type CodexTaskSnapshot = {
	checkAfterMs?: number;
	completedAt?: string;
	error?: string;
	exitCode?: number | null;
	startedAt?: string;
	status: CodexTaskStatus;
	stderr?: string;
	stdout?: string;
	taskId: string;
	timeoutMs?: number;
};

type CodexTaskRecord = CodexTaskSnapshot & {
	startedAt: string;
	status: Exclude<CodexTaskStatus, "not_found">;
	timeoutMs: number;
};

type CodexTaskManagerOptions = {
	runner?: CodexTaskRunner;
};

type ExecaOptions = import("execa").Options;

const buildCodexExecArgs = (input: CodexTaskInput): string[] => {
	const args = ["exec", "--json", "--skip-git-repo-check"];

	if (input.model) {
		args.push("--model", input.model);
	}

	args.push(input.prompt);

	return args;
};

const commandExists = async (command: string): Promise<boolean> => {
	try {
		const result = await execa(command, ["--version"], {
			reject: false,
			stderr: "ignore",
			stdout: "ignore",
		});

		return !result.failed;
	} catch {
		return false;
	}
};

const createExecaOptions = (request: CodexTaskRequest): ExecaOptions => {
	const options = {
		forceKillAfterDelay: TERMINATION_GRACE_MS,
		maxBuffer: MAX_OUTPUT_BYTES,
		reject: false,
		stdin: "ignore",
		timeout: request.timeoutMs,
	} satisfies ExecaOptions;

	return request.cwd ? { ...options, cwd: request.cwd } : options;
};

const normalizeTimeoutMs = (timeoutMs: number | undefined): number => {
	if (!timeoutMs) {
		return DEFAULT_TOOL_TIMEOUT_MS;
	}

	return Math.min(timeoutMs, MAX_TOOL_TIMEOUT_MS);
};

const resolveCodexCommand = (hasMise = true): string[] => {
	if (hasMise) {
		return ["mise", "x", "codex@latest", "--", "codex"];
	}

	return ["bunx", "codex"];
};

const resolveInstalledCodexCommand = async (): Promise<string[]> =>
	resolveCodexCommand(await commandExists("mise"));

const getCompletionStatus = (
	result: CodexRunResult,
): Exclude<CodexTaskStatus, "not_found" | "running"> => {
	if (result.timedOut) {
		return "timed_out";
	}

	if (result.exitCode === 0) {
		return "completed";
	}

	return "failed";
};

const nowIso = (): string => {
	const iso = DateTime.utc().toISO();

	if (!iso) {
		throw new Error("Failed to create an ISO timestamp");
	}

	return iso;
};

const normalizeOutput = (output: unknown): string => {
	if (typeof output === "string") {
		return output;
	}

	if (Array.isArray(output)) {
		return output.join("\n");
	}

	if (output === null || typeof output === "undefined") {
		return "";
	}

	return String(output);
};

const runCodexCliTask = async (request: CodexTaskRequest): Promise<CodexRunResult> => {
	const command = await resolveInstalledCodexCommand();
	const executable = command.at(0);

	if (!executable) {
		throw new Error("Codex command resolution returned an empty command");
	}

	const result = await execa(
		executable,
		[...command.slice(1), ...buildCodexExecArgs(request)],
		createExecaOptions(request),
	);

	return {
		exitCode: result.exitCode ?? null,
		stderr: normalizeOutput(result.stderr),
		stdout: normalizeOutput(result.stdout),
		timedOut: result.timedOut,
	};
};

const createTaskRequest = (
	input: CodexTaskInput,
	taskId: string,
	timeoutMs: number,
): CodexTaskRequest => {
	const request: CodexTaskRequest = {
		prompt: input.prompt,
		taskId,
		timeoutMs,
	};

	if (input.cwd) {
		request.cwd = input.cwd;
	}
	if (input.model) {
		request.model = input.model;
	}

	return request;
};

class CodexTaskManager {
	readonly #runner: CodexTaskRunner;

	readonly #tasks = new Map<string, CodexTaskRecord>();

	constructor(options: CodexTaskManagerOptions = {}) {
		this.#runner = options.runner ?? runCodexCliTask;
	}

	checkTask(taskId: string): CodexTaskSnapshot {
		const task = this.#tasks.get(taskId);

		if (!task) {
			return {
				status: "not_found",
				taskId,
			};
		}

		return { ...task };
	}

	startTask(input: CodexTaskInput): CodexTaskSnapshot {
		const taskId = randomUUID();
		const startedAt = nowIso();
		const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
		const task: CodexTaskRecord = {
			checkAfterMs: CHECK_AFTER_MS,
			startedAt,
			status: "running",
			taskId,
			timeoutMs,
		};

		this.#tasks.set(taskId, task);
		this.#runTask(task, createTaskRequest(input, taskId, timeoutMs));

		return { ...task };
	}

	static completeTask(task: CodexTaskRecord, result: CodexRunResult): void {
		const status = getCompletionStatus(result);

		Object.assign(task, {
			completedAt: nowIso(),
			exitCode: result.exitCode,
			status,
			stderr: result.stderr,
			stdout: result.stdout,
		});
		delete task.checkAfterMs;
	}

	static failTask(task: CodexTaskRecord, error: unknown): void {
		Object.assign(task, {
			completedAt: nowIso(),
			error: error instanceof Error ? error.message : String(error),
			status: "failed",
		});
		delete task.checkAfterMs;
	}

	async #runTask(task: CodexTaskRecord, request: CodexTaskRequest): Promise<void> {
		try {
			const result = await this.#runner(request);

			CodexTaskManager.completeTask(task, result);
		} catch (error) {
			CodexTaskManager.failTask(task, error);
		}
	}
}

export {
	buildCodexExecArgs,
	CodexTaskManager,
	createExecaOptions,
	DEFAULT_TOOL_TIMEOUT_MS,
	MAX_OUTPUT_BYTES,
	MAX_TOOL_TIMEOUT_MS,
	resolveCodexCommand,
};
export type { CodexRunResult, CodexTaskInput, CodexTaskManagerOptions, CodexTaskRunner };
