// oxlint-disable eslint/max-lines eslint/max-statements promise/prefer-await-to-callbacks promise/prefer-await-to-then -- Async task state transitions are centralized in one small manager.
import is from "@sindresorhus/is";

import type {
	CodexAppServerClient,
	CodexRunInput,
	CodexRunResult,
	CodexTaskStatus,
	CodexToolKind,
	NormalizedCodexItem,
} from "./codex";

type JsonValue = boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };

type CodexAsyncTaskSnapshot = {
	cancelRequested: boolean;
	createdAt: string;
	durationMs: number;
	error?: string;
	expiresAt?: string;
	finalText: string;
	id: string;
	items: NormalizedCodexItem[];
	kind: CodexToolKind;
	lastActivityAt: string;
	ok: boolean;
	partialText: string;
	status: CodexTaskStatus;
	threadId?: string;
	turnId?: string;
	updatedAt: string;
	warnings: string[];
};

type CodexAsyncTaskPayload =
	| {
			ok: true;
			task: CodexAsyncTaskSnapshot;
	  }
	| {
			error: {
				code: string;
				message: string;
			};
			ok: false;
			task?: CodexAsyncTaskSnapshot;
	  };

type CodexAsyncTaskResultPayload =
	| {
			ok: true;
			result: CodexRunResult;
			task: CodexAsyncTaskSnapshot;
	  }
	| {
			error: {
				code: string;
				message: string;
			};
			ok: false;
			task?: CodexAsyncTaskSnapshot;
	  };

type CodexTaskManagerOptions = {
	completedTaskTtlMs?: number;
	idFactory?: (kind: CodexToolKind) => string;
	now?: () => number;
};

type CodexTaskState = {
	cancel?: () => Promise<void>;
	cancelRequested: boolean;
	completedAtMs?: number;
	createdAtMs: number;
	error?: string;
	expiresAtMs?: number;
	finalText: string;
	id: string;
	items: NormalizedCodexItem[];
	kind: CodexToolKind;
	lastActivityAtMs: number;
	partialText: string;
	result?: CodexRunResult;
	status: CodexTaskStatus;
	threadId?: string;
	turnId?: string;
	updatedAtMs: number;
	warnings: string[];
};

const DEFAULT_COMPLETED_TASK_TTL_MS = 30 * 60 * 1000;

const toIso = (timestampMs: number): string => new Date(timestampMs).toISOString();

const createTaskError = (
	code: string,
	message: string,
	task?: CodexAsyncTaskSnapshot,
): CodexAsyncTaskPayload => ({
	error: { code, message },
	ok: false,
	...(task ? { task } : {}),
});

const createTaskResultError = (
	code: string,
	message: string,
	task?: CodexAsyncTaskSnapshot,
): CodexAsyncTaskResultPayload => ({
	error: { code, message },
	ok: false,
	...(task ? { task } : {}),
});

class CodexTaskManager {
	readonly #client: CodexAppServerClient;
	readonly #completedTaskTtlMs: number;
	readonly #idFactory: (kind: CodexToolKind) => string;
	readonly #now: () => number;
	readonly #tasks = new Map<string, CodexTaskState>();

	constructor(client: CodexAppServerClient, options: CodexTaskManagerOptions = {}) {
		this.#client = client;
		this.#completedTaskTtlMs = options.completedTaskTtlMs ?? DEFAULT_COMPLETED_TASK_TTL_MS;
		this.#idFactory = options.idFactory ?? ((kind) => `${kind}_${crypto.randomUUID()}`);
		this.#now = options.now ?? Date.now;
	}

	start(kind: CodexToolKind, input: CodexRunInput): CodexAsyncTaskPayload {
		this.#cleanup();

		const now = this.#now();
		const task: CodexTaskState = {
			cancelRequested: false,
			createdAtMs: now,
			finalText: "",
			id: this.#idFactory(kind),
			items: [],
			kind,
			lastActivityAtMs: now,
			partialText: "",
			status: "running",
			updatedAtMs: now,
			warnings: [],
		};

		this.#tasks.set(task.id, task);
		this.#runAsync(task, input).catch((error: unknown) => {
			this.#fail(task, error);
		});

		return { ok: true, task: this.#snapshot(task) };
	}

	status(taskId: string): CodexAsyncTaskPayload {
		this.#cleanup();

		const task = this.#tasks.get(taskId);
		if (!task) {
			return createTaskError("task_not_found", `Codex task not found: ${taskId}`);
		}

		return { ok: true, task: this.#snapshot(task) };
	}

	result(taskId: string): CodexAsyncTaskResultPayload {
		this.#cleanup();

		const task = this.#tasks.get(taskId);
		if (!task) {
			return createTaskResultError("task_not_found", `Codex task not found: ${taskId}`);
		}
		if (task.status === "running" || !task.result) {
			return createTaskResultError(
				"task_running",
				`Codex task is still running: ${taskId}`,
				this.#snapshot(task),
			);
		}

		return { ok: true, result: task.result, task: this.#snapshot(task) };
	}

	async cancel(taskId: string): Promise<CodexAsyncTaskPayload> {
		this.#cleanup();

		const task = this.#tasks.get(taskId);
		if (!task) {
			return createTaskError("task_not_found", `Codex task not found: ${taskId}`);
		}
		if (task.status !== "running") {
			return { ok: true, task: this.#snapshot(task) };
		}

		task.cancelRequested = true;
		this.#touch(task);
		await task.cancel?.();

		return { ok: true, task: this.#snapshot(task) };
	}

	async #runAsync(task: CodexTaskState, input: CodexRunInput): Promise<void> {
		try {
			const handle = await this.#client.startRun(input, {
				onProgress: (progress) => {
					task.items = progress.items;
					task.partialText = progress.partialText;
					task.threadId = progress.threadId;
					task.turnId = progress.turnId;
					task.warnings = progress.warnings;
					this.#touch(task);
				},
			});

			task.cancel = handle.cancel;
			task.threadId = handle.threadId;
			task.turnId = handle.turnId;
			this.#touch(task);
			if (task.cancelRequested) {
				await handle.cancel();
			}

			this.#complete(task, await handle.result);
		} catch (error) {
			this.#fail(task, error);
		}
	}

	#complete(task: CodexTaskState, result: CodexRunResult): void {
		const now = this.#now();

		task.completedAtMs = now;
		task.expiresAtMs = now + this.#completedTaskTtlMs;
		task.finalText = result.finalText;
		task.items = result.items;
		task.lastActivityAtMs = now;
		task.partialText = result.finalText || task.partialText;
		task.result = result;
		task.status = result.status;
		task.updatedAtMs = now;
		task.warnings = result.warnings;
		CodexTaskManager.#setRunIds(task, result.threadId, result.turnId);
		if (result.error) {
			task.error = result.error;
		}
	}

	#fail(task: CodexTaskState, error: unknown): void {
		const now = this.#now();

		task.completedAtMs = now;
		task.error = is.error(error) ? error.message : String(error);
		task.expiresAtMs = now + this.#completedTaskTtlMs;
		task.finalText = "";
		task.lastActivityAtMs = now;
		task.result = {
			durationMs: now - task.createdAtMs,
			error: task.error,
			finalText: "",
			items: task.items,
			ok: false,
			status: "failed",
			warnings: task.warnings,
		};
		task.status = "failed";
		task.updatedAtMs = now;
	}

	static #setRunIds(
		task: CodexTaskState,
		threadId: string | undefined,
		turnId: string | undefined,
	): void {
		if (threadId) {
			task.threadId = threadId;
		} else {
			delete task.threadId;
		}
		if (turnId) {
			task.turnId = turnId;
		} else {
			delete task.turnId;
		}
	}

	#touch(task: CodexTaskState): void {
		const now = this.#now();

		task.lastActivityAtMs = now;
		task.updatedAtMs = now;
	}

	#cleanup(): void {
		const now = this.#now();

		for (const [id, task] of this.#tasks) {
			if (task.expiresAtMs && task.expiresAtMs <= now) {
				this.#tasks.delete(id);
			}
		}
	}

	#snapshot(task: CodexTaskState): CodexAsyncTaskSnapshot {
		const now = this.#now();
		const durationEndMs = task.completedAtMs ?? now;
		const snapshot: CodexAsyncTaskSnapshot = {
			cancelRequested: task.cancelRequested,
			createdAt: toIso(task.createdAtMs),
			durationMs: durationEndMs - task.createdAtMs,
			finalText: task.finalText,
			id: task.id,
			items: task.items,
			kind: task.kind,
			lastActivityAt: toIso(task.lastActivityAtMs),
			ok: task.status === "completed",
			partialText: task.partialText,
			status: task.status,
			updatedAt: toIso(task.updatedAtMs),
			warnings: task.warnings,
		};

		if (task.error) {
			snapshot.error = task.error;
		}
		if (task.expiresAtMs) {
			snapshot.expiresAt = toIso(task.expiresAtMs);
		}
		if (task.threadId) {
			snapshot.threadId = task.threadId;
		}
		if (task.turnId) {
			snapshot.turnId = task.turnId;
		}

		return snapshot;
	}
}

export { CodexTaskManager, DEFAULT_COMPLETED_TASK_TTL_MS };
export type {
	CodexAsyncTaskPayload,
	CodexAsyncTaskResultPayload,
	CodexAsyncTaskSnapshot,
	JsonValue,
};
