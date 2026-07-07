import { setTimeout as sleep } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import type { CodexRunOptions } from "./codex";
import { CodexAppServerClient } from "./codex";
import { CodexTaskManager } from "./tasks";

const longWait = <Value>(): Promise<Value> =>
	sleep(60 * 60 * 1000, null, { ref: false }) as unknown as Promise<Value>;

const createHangingCancelClient = (): CodexAppServerClient =>
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
				cancel: () => longWait<void>(),
				result: longWait(),
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

describe("CodexTaskManager stuck cancellation", () => {
	it("acknowledges cancellation without waiting for a stuck interrupt request", async () => {
		const manager = new CodexTaskManager(createHangingCancelClient(), {
			idFactory: () => "task-1",
		});

		manager.start("task", { prompt: "hi", timeoutMs: 10_000, toolKind: "task" });
		await waitFor(
			() => manager.status("task-1"),
			(payload) => payload.ok && payload.task.partialText === "partial",
		);

		expect(manager.cancel("task-1")).toMatchObject({
			ok: true,
			task: {
				cancelRequested: true,
				status: "running",
			},
		});
	});
});
