// oxlint-disable eslint/complexity eslint/max-lines eslint/max-lines-per-function eslint/max-statements eslint/no-undefined promise/avoid-new -- App-server JSON-RPC handling is intentionally centralized and callback-driven.
import { spawn } from "node:child_process";
import { env as processEnv } from "node:process";
import { createInterface } from "node:readline";

import { execa } from "execa";
import { DateTime } from "luxon";

const APP_SERVER_PROTOCOL_REFERENCE =
	"Derived from `codex app-server generate-ts` using @openai/codex@0.142.4.";

const CODEX_TASK_MODEL = "gpt-5.5";
const CODEX_TASK_REASONING_EFFORT = "medium";
const CODEX_CHROME_READ_MODEL = "gpt-5.5";
const CODEX_CHROME_READ_REASONING_EFFORT = "low";
const DEFAULT_TOOL_TIMEOUT_MS = 300_000;
const MAX_ITEM_TEXT_BYTES = 16 * 1024;
const MAX_TOOL_TIMEOUT_MS = 300_000;

type JsonValue = boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };
type RequestId = number | string;
type CodexToolKind = "chrome_read" | "task";
type CodexRunStatus = "completed" | "failed" | "interrupted" | "timed_out";
type NormalizedCodexItem =
	| {
			id?: string;
			text: string;
			type: "agent_message";
	  }
	| {
			id?: string;
			text: string;
			type: "plan";
	  }
	| {
			id?: string;
			text: string;
			type: "reasoning";
	  }
	| {
			aggregatedOutput?: string;
			command: string;
			exitCode: null | number;
			id?: string;
			status?: string;
			type: "command_execution";
	  }
	| {
			error?: string;
			id?: string;
			server: string;
			status?: string;
			tool: string;
			type: "mcp_tool_call";
	  }
	| {
			id?: string;
			query: string;
			type: "web_search";
	  }
	| {
			id?: string;
			rawType: string;
			type: "unknown";
	  };

type CodexRunInput = {
	cwd?: string;
	prompt: string;
	timeoutMs?: number;
	toolKind: CodexToolKind;
};

type CodexRunResult = {
	durationMs: number;
	error?: string;
	finalText: string;
	items: NormalizedCodexItem[];
	ok: boolean;
	status: CodexRunStatus;
	threadId?: string;
	turnId?: string;
	warnings: string[];
};

type CodexAppServerCommand = {
	args: string[];
	command: string;
};
type CodexCommandEnvironment = {
	MIKOTO_CODEX_COMMAND?: string;
};

type CodexAppServerClientOptions = {
	command?: CodexAppServerCommand;
	stderr?: NodeJS.WritableStream;
};

type JsonRpcRequest = {
	id: RequestId;
	method: string;
	params?: unknown;
};

type JsonRpcResponse = {
	error?: {
		code: number;
		data?: unknown;
		message: string;
	};
	id: RequestId;
	result?: unknown;
};

type JsonRpcNotification = {
	method: string;
	params?: unknown;
};

type PendingRequest = {
	reject: (error: Error) => void;
	resolve: (result: unknown) => void;
};

type PendingTurn = {
	deltaTextByItemId: Map<string, string>;
	items: NormalizedCodexItem[];
	reject: (error: Error) => void;
	resolve: (result: CompletedTurn) => void;
	threadId: string;
	turnId: string;
	warnings: string[];
};

type CompletedTurn = {
	deltaText: string;
	items: NormalizedCodexItem[];
	status: CodexRunStatus;
	warnings: string[];
};

type ThreadStartResponse = {
	thread: {
		id?: unknown;
	};
};

type TurnStartResponse = {
	turn: {
		id?: unknown;
	};
};

const collectDeltaText = (pending: PendingTurn): string =>
	[...pending.deltaTextByItemId.values()].join("");

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

const resolveCodexCommand = (hasMise = true): string[] => {
	if (hasMise) {
		return ["mise", "x", "codex@latest", "--", "codex"];
	}

	return ["bunx", "codex@latest"];
};

const parseCommandLine = (value: string): string[] => {
	const args: string[] = [];
	let current = "";
	let quote: null | string = null;

	for (let index = 0; index < value.length; index += 1) {
		const char = value[index] ?? "";

		if (quote) {
			if (char === quote) {
				quote = null;
			} else {
				current += char;
			}
		} else if (char === "'" || char === '"') {
			quote = char;
		} else if (/\s/u.test(char)) {
			if (current) {
				args.push(current);
				current = "";
			}
		} else {
			current += char;
		}
	}

	if (quote) {
		throw new Error("MIKOTO_CODEX_COMMAND contains an unterminated quote");
	}
	if (current) {
		args.push(current);
	}

	return args;
};

const parseConfiguredCodexCommand = (value: string): CodexAppServerCommand => {
	const trimmed = value.trim();

	if (!trimmed) {
		throw new Error("MIKOTO_CODEX_COMMAND must not be empty");
	}

	const [command = "", ...args] = parseCommandLine(trimmed);

	if (!command) {
		throw new Error("MIKOTO_CODEX_COMMAND must include a command");
	}

	return { args, command };
};

const resolveInstalledCodexCommand = async (
	environment: CodexCommandEnvironment = processEnv,
): Promise<CodexAppServerCommand> => {
	const configuredCommand = environment.MIKOTO_CODEX_COMMAND;
	if (configuredCommand !== undefined) {
		return parseConfiguredCodexCommand(configuredCommand);
	}

	const command = resolveCodexCommand(await commandExists("mise"));
	const executable = command.at(0);

	if (!executable) {
		throw new Error("Codex command resolution returned an empty command");
	}

	return {
		args: command.slice(1),
		command: executable,
	};
};

const normalizeTimeoutMs = (timeoutMs: number | undefined): number => {
	if (!timeoutMs) {
		return DEFAULT_TOOL_TIMEOUT_MS;
	}

	return Math.min(timeoutMs, MAX_TOOL_TIMEOUT_MS);
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
	typeof value === "object" && value !== null && !Array.isArray(value);

const getString = (value: unknown, fallback = ""): string =>
	typeof value === "string" ? value : fallback;

const getNumberOrNull = (value: unknown): null | number =>
	typeof value === "number" ? value : null;

const truncateText = (value: string): string => {
	if (Buffer.byteLength(value) <= MAX_ITEM_TEXT_BYTES) {
		return value;
	}

	return `${value.slice(0, MAX_ITEM_TEXT_BYTES)}\n[truncated]`;
};

const getDurationMs = (startedAt: DateTime): number =>
	Math.round(DateTime.utc().diff(startedAt).as("milliseconds"));

const normalizeItem = (item: unknown): NormalizedCodexItem | undefined => {
	if (!isRecord(item)) {
		return undefined;
	}

	const type = getString(item["type"], "unknown");
	const id = getString(item["id"]) || undefined;

	switch (type) {
		case "agentMessage": {
			const normalized: NormalizedCodexItem = {
				text: truncateText(getString(item["text"])),
				type: "agent_message",
			};

			if (id) {
				normalized.id = id;
			}

			return normalized;
		}
		case "plan": {
			const normalized: NormalizedCodexItem = {
				text: truncateText(getString(item["text"])),
				type: "plan",
			};

			if (id) {
				normalized.id = id;
			}

			return normalized;
		}
		case "reasoning": {
			const summary = Array.isArray(item["summary"])
				? item["summary"].filter((part): part is string => typeof part === "string")
				: [];
			const content = Array.isArray(item["content"])
				? item["content"].filter((part): part is string => typeof part === "string")
				: [];

			const normalized: NormalizedCodexItem = {
				text: truncateText([...summary, ...content].join("\n")),
				type: "reasoning",
			};

			if (id) {
				normalized.id = id;
			}

			return normalized;
		}
		case "commandExecution": {
			const output = getString(item["aggregatedOutput"]);
			const status = getString(item["status"]) || undefined;
			const normalized: NormalizedCodexItem = {
				command: getString(item["command"]),
				exitCode: getNumberOrNull(item["exitCode"]),
				type: "command_execution",
			};

			if (id) {
				normalized.id = id;
			}
			if (status) {
				normalized.status = status;
			}
			if (output) {
				normalized.aggregatedOutput = truncateText(output);
			}

			return normalized;
		}
		case "mcpToolCall": {
			const error = isRecord(item["error"]) ? getString(item["error"]["message"]) : undefined;
			const status = getString(item["status"]) || undefined;
			const normalized: NormalizedCodexItem = {
				server: getString(item["server"]),
				tool: getString(item["tool"]),
				type: "mcp_tool_call",
			};

			if (id) {
				normalized.id = id;
			}
			if (status) {
				normalized.status = status;
			}
			if (error) {
				normalized.error = error;
			}

			return normalized;
		}
		case "webSearch": {
			const normalized: NormalizedCodexItem = {
				query: getString(item["query"]),
				type: "web_search",
			};

			if (id) {
				normalized.id = id;
			}

			return normalized;
		}
		default: {
			const normalized: NormalizedCodexItem = { rawType: type, type: "unknown" };

			if (id) {
				normalized.id = id;
			}

			return normalized;
		}
	}
};

const parseThreadId = (result: unknown): string => {
	if (
		!isRecord(result) ||
		!isRecord(result["thread"]) ||
		typeof result["thread"]["id"] !== "string"
	) {
		throw new Error("Codex app-server returned thread/start without a thread id");
	}

	return result["thread"]["id"];
};

const parseTurnId = (result: unknown): string => {
	if (!isRecord(result) || !isRecord(result["turn"]) || typeof result["turn"]["id"] !== "string") {
		throw new Error("Codex app-server returned turn/start without a turn id");
	}

	return result["turn"]["id"];
};
const createThreadStartParams = (input: CodexRunInput): JsonValue => {
	const model = input.toolKind === "chrome_read" ? CODEX_CHROME_READ_MODEL : CODEX_TASK_MODEL;
	const params: Record<string, JsonValue> = {
		approvalPolicy: "never",
		ephemeral: true,
		model,
		sandbox: "read-only",
	};

	if (input.cwd) {
		params["cwd"] = input.cwd;
	}

	return params;
};

const createTurnStartParams = (
	input: CodexRunInput,
	threadId: string,
): Record<string, JsonValue> => ({
	effort:
		input.toolKind === "chrome_read"
			? CODEX_CHROME_READ_REASONING_EFFORT
			: CODEX_TASK_REASONING_EFFORT,
	input: [
		{
			text: input.prompt,
			text_elements: [],
			type: "text",
		},
	],
	threadId,
});

class CodexAppServerClient {
	readonly #command: CodexAppServerCommand;
	readonly #pendingRequests = new Map<RequestId, PendingRequest>();
	readonly #pendingTurns = new Map<string, PendingTurn>();
	readonly #queuedTurnNotifications = new Map<string, JsonRpcNotification[]>();
	readonly #stderr: NodeJS.WritableStream;
	#child: ReturnType<typeof spawn> | undefined;
	#closedError: Error | undefined;
	#nextRequestId = 1;

	constructor(options: CodexAppServerClientOptions) {
		this.#command = options.command ?? {
			args: ["app-server", "--listen", "stdio://"],
			command: "codex",
		};
		this.#stderr = options.stderr ?? process.stderr;
	}

	static async create(options: CodexAppServerClientOptions = {}): Promise<CodexAppServerClient> {
		const command = options.command ?? (await resolveInstalledCodexCommand());
		const client = new CodexAppServerClient({
			...options,
			command: {
				args: [...command.args, "app-server", "--listen", "stdio://"],
				command: command.command,
			},
		});

		await client.start();

		return client;
	}

	async start(): Promise<void> {
		if (this.#child) {
			return;
		}

		const child = spawn(this.#command.command, this.#command.args, {
			stdio: ["pipe", "pipe", "pipe"],
		});

		this.#child = child;
		child.stderr?.on("data", (chunk) => this.#stderr.write(chunk));
		child.once("exit", (code, signal) => {
			const error = new Error(
				`Codex app-server exited unexpectedly (${signal ? `signal ${signal}` : `code ${code}`})`,
			);

			this.#closedError ??= error;
			this.#rejectAll(error);
		});
		child.stdin?.on("error", (error) => {
			const appServerError = error instanceof Error ? error : new Error(String(error));

			this.#closedError ??= appServerError;
			this.#rejectAll(appServerError);
		});

		const lines = createInterface({ input: child.stdout });

		lines.on("line", (line) => this.#handleLine(line));

		await this.#request("initialize", {
			capabilities: {
				experimentalApi: false,
				requestAttestation: false,
			},
			clientInfo: {
				name: "mikoto-codex-mcp",
				title: null,
				version: "0.0.0",
			},
		});
		this.#notify("initialized");
	}

	close(): void {
		if (!this.#child) {
			return;
		}

		this.#closedError = new Error("Codex app-server client closed");
		this.#child.kill();
		this.#child = undefined;
	}

	async run(input: CodexRunInput): Promise<CodexRunResult> {
		const startedAt = DateTime.utc();
		const timeoutMs = normalizeTimeoutMs(input.timeoutMs);
		let threadId = "";
		let turnId = "";
		let timeout: null | ReturnType<typeof setTimeout> = null;
		let timedOut = false;

		try {
			const thread = await this.#request("thread/start", createThreadStartParams(input));

			threadId = parseThreadId(thread as ThreadStartResponse);
			const turn = await this.#request("turn/start", createTurnStartParams(input, threadId));

			turnId = parseTurnId(turn as TurnStartResponse);
			const activeThreadId = threadId;
			const activeTurnId = turnId;

			const completed = await new Promise<CompletedTurn>((resolve, reject) => {
				const pending: PendingTurn = {
					deltaTextByItemId: new Map(),
					items: [],
					reject,
					resolve,
					threadId: activeThreadId,
					turnId: activeTurnId,
					warnings: [],
				};

				this.#pendingTurns.set(activeTurnId, pending);
				timeout = setTimeout(() => {
					timedOut = true;
					this.#pendingTurns.delete(activeTurnId);
					this.#interruptTurn(activeThreadId, activeTurnId).catch(() => {
						// Timeout results should still return even if interruption fails.
					});
					resolve({
						deltaText: collectDeltaText(pending),
						items: pending.items,
						status: "timed_out",
						warnings: pending.warnings,
					});
				}, timeoutMs);
				const queuedNotifications = this.#queuedTurnNotifications.get(activeTurnId) ?? [];

				this.#queuedTurnNotifications.delete(activeTurnId);
				for (const notification of queuedNotifications) {
					this.#handleNotification(notification);
				}
			});
			const finalText = CodexAppServerClient.#createFinalText(
				completed.items,
				completed.deltaText,
				completed.warnings,
			);
			const status = timedOut ? "timed_out" : completed.status;
			const result: CodexRunResult = {
				durationMs: getDurationMs(startedAt),
				finalText,
				items: completed.items,
				ok: status === "completed",
				status,
				warnings: completed.warnings,
			};

			if (threadId) {
				result.threadId = threadId;
			}
			if (turnId) {
				result.turnId = turnId;
			}

			return result;
		} catch (error) {
			return {
				durationMs: getDurationMs(startedAt),
				error: error instanceof Error ? error.message : String(error),
				finalText: "",
				items: [],
				ok: false,
				status: timedOut ? "timed_out" : "failed",
				...(threadId ? { threadId } : {}),
				...(turnId ? { turnId } : {}),
				warnings: [],
			};
		} finally {
			if (timeout) {
				clearTimeout(timeout);
			}
		}
	}

	async #interruptTurn(threadId: string, turnId: string): Promise<void> {
		try {
			await this.#request("turn/interrupt", { threadId, turnId });
		} catch {
			// Timeout results should still return even if interruption fails.
		}
	}

	static #createFinalText(
		items: NormalizedCodexItem[],
		deltaText: string,
		warnings: string[],
	): string {
		const completedMessages = items.filter(
			(item): item is Extract<NormalizedCodexItem, { type: "agent_message" }> =>
				item.type === "agent_message",
		);
		const finalMessage = completedMessages.at(-1);

		if (finalMessage?.text) {
			return finalMessage.text;
		}

		if (deltaText) {
			warnings.push(
				"Used accumulated agent message deltas because no completed agent message was received.",
			);
		}

		return deltaText;
	}

	#handleLine(line: string): void {
		try {
			const message = JSON.parse(line) as unknown;

			if (!isRecord(message)) {
				return;
			}

			if ("id" in message) {
				this.#handleResponse(message as JsonRpcResponse);

				return;
			}

			if (typeof message["method"] === "string") {
				this.#handleNotification(message as JsonRpcNotification);
			}
		} catch {
			this.#stderr.write(`Ignoring invalid Codex app-server JSON line: ${line}\n`);
		}
	}

	#handleResponse(message: JsonRpcResponse): void {
		const pending = this.#pendingRequests.get(message.id);

		if (!pending) {
			return;
		}

		this.#pendingRequests.delete(message.id);

		if (message.error) {
			pending.reject(new Error(message.error.message));

			return;
		}

		pending.resolve(message.result);
	}

	#handleNotification(message: JsonRpcNotification): void {
		const turnId = CodexAppServerClient.#getNotificationTurnId(message);

		if (turnId && !this.#pendingTurns.has(turnId)) {
			const queued = this.#queuedTurnNotifications.get(turnId) ?? [];

			queued.push(message);
			this.#queuedTurnNotifications.set(turnId, queued);

			return;
		}

		switch (message.method) {
			case "item/agentMessage/delta":
				this.#handleAgentMessageDelta(message.params);
				break;
			case "item/completed":
				this.#handleItemCompleted(message.params);
				break;
			case "turn/completed":
				this.#handleTurnCompleted(message.params);
				break;
			case "error":
				this.#handleTurnError(message.params);
				break;
			default:
				break;
		}
	}

	static #getNotificationTurnId(message: JsonRpcNotification): string | undefined {
		const { params } = message;

		if (!isRecord(params)) {
			return undefined;
		}

		if (typeof params["turnId"] === "string") {
			return params["turnId"];
		}

		if (isRecord(params["turn"]) && typeof params["turn"]["id"] === "string") {
			return params["turn"]["id"];
		}

		return undefined;
	}

	#handleAgentMessageDelta(params: unknown): void {
		if (
			!isRecord(params) ||
			typeof params["turnId"] !== "string" ||
			typeof params["itemId"] !== "string" ||
			typeof params["delta"] !== "string"
		) {
			return;
		}

		const pending = this.#pendingTurns.get(params["turnId"]);

		if (!pending) {
			return;
		}

		pending.deltaTextByItemId.set(
			params["itemId"],
			`${pending.deltaTextByItemId.get(params["itemId"]) ?? ""}${params["delta"]}`,
		);
	}

	#handleItemCompleted(params: unknown): void {
		if (!isRecord(params) || typeof params["turnId"] !== "string") {
			return;
		}

		const pending = this.#pendingTurns.get(params["turnId"]);

		if (!pending) {
			return;
		}

		const item = normalizeItem(params["item"]);

		if (item) {
			pending.items.push(item);
		}
	}

	#handleTurnCompleted(params: unknown): void {
		if (!isRecord(params) || typeof params["threadId"] !== "string") {
			return;
		}

		const { turn } = params;

		if (!isRecord(turn)) {
			return;
		}

		const turnId = getString(turn["id"]);
		const pending = this.#pendingTurns.get(turnId);

		if (!pending) {
			return;
		}

		this.#pendingTurns.delete(turnId);
		pending.resolve({
			deltaText: collectDeltaText(pending),
			items: pending.items,
			status: getString(turn["status"]) === "interrupted" ? "interrupted" : "completed",
			warnings: pending.warnings,
		});
	}

	#handleTurnError(params: unknown): void {
		if (!isRecord(params) || typeof params["turnId"] !== "string") {
			return;
		}

		const pending = this.#pendingTurns.get(params["turnId"]);

		if (!pending) {
			return;
		}

		this.#pendingTurns.delete(params["turnId"]);
		const error = isRecord(params["error"])
			? getString(params["error"]["message"], "Codex turn failed")
			: "Codex turn failed";

		pending.resolve({
			deltaText: collectDeltaText(pending),
			items: pending.items,
			status: "failed",
			warnings: [...pending.warnings, error],
		});
	}

	#notify(method: string, params?: unknown): void {
		this.#write({ method, ...(params === undefined ? {} : { params }) });
	}

	#rejectAll(error: Error): void {
		for (const pending of this.#pendingRequests.values()) {
			pending.reject(error);
		}
		this.#pendingRequests.clear();

		for (const pending of this.#pendingTurns.values()) {
			pending.reject(error);
		}
		this.#pendingTurns.clear();
	}

	#request(method: string, params?: unknown): Promise<unknown> {
		if (this.#closedError) {
			return Promise.reject(this.#closedError);
		}

		const id = this.#nextRequestId;

		this.#nextRequestId += 1;

		return new Promise((resolve, reject) => {
			this.#pendingRequests.set(id, { reject, resolve });
			this.#write({ id, method, ...(params === undefined ? {} : { params }) });
		});
	}

	#write(message: JsonRpcNotification | JsonRpcRequest): void {
		if (!this.#child?.stdin?.writable || this.#closedError) {
			throw this.#closedError ?? new Error("Codex app-server is not running");
		}

		this.#child.stdin.write(`${JSON.stringify(message)}\n`);
	}
}

export {
	APP_SERVER_PROTOCOL_REFERENCE,
	CODEX_CHROME_READ_MODEL,
	CODEX_CHROME_READ_REASONING_EFFORT,
	CODEX_TASK_MODEL,
	CODEX_TASK_REASONING_EFFORT,
	CodexAppServerClient,
	DEFAULT_TOOL_TIMEOUT_MS,
	MAX_ITEM_TEXT_BYTES,
	MAX_TOOL_TIMEOUT_MS,
	normalizeTimeoutMs,
	resolveCodexCommand,
	resolveInstalledCodexCommand,
};
export type {
	CodexAppServerClientOptions,
	CodexAppServerCommand,
	CodexRunInput,
	CodexRunResult,
	CodexToolKind,
	NormalizedCodexItem,
};
