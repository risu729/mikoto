import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import is from "@sindresorhus/is";
import { z } from "zod";

import type { CodexChromeReadInput } from "./chrome-read";
import { createChromeReadTaskInput, createReadOnlyTaskPrompt } from "./chrome-read";
import type { CodexRunInput } from "./codex";
import { CodexAppServerClient, MAX_TOOL_TIMEOUT_MS } from "./codex";
import type { CodexAsyncTaskPayload, CodexAsyncTaskResultPayload, JsonValue } from "./tasks";
import { CodexTaskManager } from "./tasks";
import type { CodexMcpToolName } from "./tools";
import { CODEX_MCP_TOOLS } from "./tools";

type CreateCodexMcpServerOptions = {
	client?: CodexAppServerClient;
	completedTaskTtlMs?: number;
};

const CodexTaskOptionSchema = {
	cwd: z.string().min(1).optional(),
	timeoutMs: z.number().int().positive().max(MAX_TOOL_TIMEOUT_MS).optional(),
};

const CodexTaskStartInputSchema = z.object({
	...CodexTaskOptionSchema,
	prompt: z.string().min(1),
});

const CodexChromeReadStartInputSchema = z.object({
	...CodexTaskOptionSchema,
	request: z.string().min(1),
});

const CodexTaskIdInputSchema = z.object({
	taskId: z.string().min(1),
});

type CodexTaskStartToolInput = z.infer<typeof CodexTaskStartInputSchema>;
type CodexChromeReadStartToolInput = z.infer<typeof CodexChromeReadStartInputSchema>;

const createJsonResult = (payload: JsonValue, isError = false): CallToolResult => ({
	content: [
		{
			text: JSON.stringify(payload),
			type: "text",
		},
	],
	isError,
});

const findToolDescription = (name: CodexMcpToolName): string => {
	const tool = CODEX_MCP_TOOLS.find((item) => item.name === name);

	return tool?.description ?? "";
};

const normalizeTaskInput = (input: CodexTaskStartToolInput): CodexRunInput => {
	const taskInput: CodexRunInput = {
		prompt: createReadOnlyTaskPrompt(input.prompt),
		toolKind: "task",
	};

	if (input.cwd) {
		taskInput.cwd = input.cwd;
	}
	if (input.timeoutMs) {
		taskInput.timeoutMs = input.timeoutMs;
	}

	return taskInput;
};

const normalizeChromeReadInput = (input: CodexChromeReadStartToolInput): CodexChromeReadInput => {
	const chromeReadInput: CodexChromeReadInput = {
		request: input.request,
	};

	if (input.cwd) {
		chromeReadInput.cwd = input.cwd;
	}
	if (input.timeoutMs) {
		chromeReadInput.timeoutMs = input.timeoutMs;
	}

	return chromeReadInput;
};

const createPayloadResult = (
	payload: CodexAsyncTaskPayload | CodexAsyncTaskResultPayload,
): CallToolResult => createJsonResult(payload, !payload.ok);

const registerTaskTools = (server: McpServer, tasks: CodexTaskManager): void => {
	server.registerTool(
		"codex_task_start",
		{
			description: findToolDescription("codex_task_start"),
			inputSchema: CodexTaskStartInputSchema,
			title: "Start Codex Task",
		},
		(input) => createPayloadResult(tasks.start("task", normalizeTaskInput(input))),
	);
};

const registerChromeReadTools = (server: McpServer, tasks: CodexTaskManager): void => {
	server.registerTool(
		"codex_chrome_read_start",
		{
			description: findToolDescription("codex_chrome_read_start"),
			inputSchema: CodexChromeReadStartInputSchema,
			title: "Start Browser Read With Codex",
		},
		(input) =>
			createPayloadResult(
				tasks.start("chrome_read", createChromeReadTaskInput(normalizeChromeReadInput(input))),
			),
	);
};

const registerRunTools = (server: McpServer, tasks: CodexTaskManager): void => {
	server.registerTool(
		"codex_run_status",
		{
			description: findToolDescription("codex_run_status"),
			inputSchema: CodexTaskIdInputSchema,
			title: "Check Codex Run",
		},
		(input) => createPayloadResult(tasks.status(input.taskId)),
	);
	server.registerTool(
		"codex_run_result",
		{
			description: findToolDescription("codex_run_result"),
			inputSchema: CodexTaskIdInputSchema,
			title: "Get Codex Run Result",
		},
		(input) => createPayloadResult(tasks.result(input.taskId)),
	);
	server.registerTool(
		"codex_run_cancel",
		{
			description: findToolDescription("codex_run_cancel"),
			inputSchema: CodexTaskIdInputSchema,
			title: "Cancel Codex Run",
		},
		async (input) => createPayloadResult(await tasks.cancel(input.taskId)),
	);
};

const createTaskManager = async (
	options: CreateCodexMcpServerOptions,
): Promise<CodexTaskManager> => {
	const client = options.client ?? (await CodexAppServerClient.create());
	const taskOptions = is.number(options.completedTaskTtlMs)
		? { completedTaskTtlMs: options.completedTaskTtlMs }
		: {};

	return new CodexTaskManager(client, taskOptions);
};

const createCodexMcpServer = async (
	options: CreateCodexMcpServerOptions = {},
): Promise<McpServer> => {
	const server = new McpServer({
		name: "mikoto-codex-mcp",
		version: "0.0.0",
	});
	const tasks = await createTaskManager(options);

	registerTaskTools(server, tasks);
	registerChromeReadTools(server, tasks);
	registerRunTools(server, tasks);

	return server;
};

export {
	CodexChromeReadStartInputSchema,
	CodexTaskIdInputSchema,
	CodexTaskStartInputSchema,
	createCodexMcpServer,
};
