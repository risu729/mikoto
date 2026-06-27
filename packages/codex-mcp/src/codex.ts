import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";

const CHECK_AFTER_MS = 1_000;
const DEFAULT_TOOL_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_BYTES = 64_000;
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

type CodexChild = ReturnType<typeof spawn> & {
	stderr: NonNullable<ReturnType<typeof spawn>["stderr"]>;
	stdout: NonNullable<ReturnType<typeof spawn>["stdout"]>;
};

type OutputCapture = {
	read: () => Pick<CodexRunResult, "stderr" | "stdout">;
};

const appendBounded = (current: string, chunk: Buffer): string => {
	const next = `${current}${chunk.toString("utf8")}`;

	return next.length > MAX_OUTPUT_BYTES ? next.slice(-MAX_OUTPUT_BYTES) : next;
};

const buildCodexExecArgs = (input: CodexTaskInput): string[] => {
	const args = ["exec", "--json", "--skip-git-repo-check"];

	if (input.model) {
		args.push("--model", input.model);
	}

	args.push(input.prompt);

	return args;
};

const commandExists = async (command: string): Promise<boolean> => {
	const child = spawn(command, ["--version"], { stdio: "ignore" });

	try {
		const [code] = (await once(child, "close")) as [number | null];

		return code === 0;
	} catch {
		return false;
	}
};

const createSpawnOptions = (cwd: string | undefined): { cwd?: string } => (cwd ? { cwd } : {});

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

const createCodexChild = async (request: CodexTaskRequest): Promise<CodexChild> => {
	const command = await resolveInstalledCodexCommand();
	const executable = command.at(0);

	if (!executable) {
		throw new Error("Codex command resolution returned an empty command");
	}

	return spawn(executable, [...command.slice(1), ...buildCodexExecArgs(request)], {
		...createSpawnOptions(request.cwd),
		stdio: "pipe",
	}) as CodexChild;
};

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

const startKillTimers = (
	child: CodexChild,
	request: CodexTaskRequest,
	onTimeout: () => void,
): NodeJS.Timeout[] => [
	setTimeout(() => {
		if (!child.killed) {
			child.kill("SIGKILL");
		}
	}, request.timeoutMs + TERMINATION_GRACE_MS),
	setTimeout(() => {
		onTimeout();
		child.kill("SIGTERM");
	}, request.timeoutMs),
];

const stopKillTimers = (timers: NodeJS.Timeout[]): void => {
	for (const timer of timers) {
		clearTimeout(timer);
	}
};

const captureOutput = (child: CodexChild): OutputCapture => {
	let stderr = "";
	let stdout = "";

	child.stdout.on("data", (chunk: Buffer) => {
		stdout = appendBounded(stdout, chunk);
	});
	child.stderr.on("data", (chunk: Buffer) => {
		stderr = appendBounded(stderr, chunk);
	});

	return {
		read: () => ({ stderr, stdout }),
	};
};

const runCodexCliTask = async (request: CodexTaskRequest): Promise<CodexRunResult> => {
	const child = await createCodexChild(request);
	let timedOut = false;
	const output = captureOutput(child);
	const timers = startKillTimers(child, request, () => {
		timedOut = true;
	});

	try {
		const [exitCode] = (await once(child, "close")) as [number | null];

		return { exitCode, timedOut, ...output.read() };
	} finally {
		stopKillTimers(timers);
	}
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
		const startedAt = new Date().toISOString();
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
			completedAt: new Date().toISOString(),
			exitCode: result.exitCode,
			status,
			stderr: result.stderr,
			stdout: result.stdout,
		});
		delete task.checkAfterMs;
	}

	static failTask(task: CodexTaskRecord, error: unknown): void {
		Object.assign(task, {
			completedAt: new Date().toISOString(),
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
	DEFAULT_TOOL_TIMEOUT_MS,
	MAX_TOOL_TIMEOUT_MS,
	resolveCodexCommand,
};
export type { CodexRunResult, CodexTaskInput, CodexTaskManagerOptions, CodexTaskRunner };
