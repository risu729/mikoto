import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { CodexChromeReadInput } from "./chrome-read";
import { createChromeReadTaskInput } from "./chrome-read";
import type { CodexTaskInput } from "./codex";
import { CodexTaskManager, MAX_TOOL_TIMEOUT_MS } from "./codex";
import type { CodexMcpToolName } from "./tools";
import { CODEX_MCP_TOOLS } from "./tools";

type JsonValue = boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };

type CreateCodexMcpServerOptions = {
	taskManager?: CodexTaskManager;
};

const CodexTaskOptionSchema = {
	cwd: z.string().min(1).optional(),
	model: z.string().min(1).optional(),
	timeoutMs: z.number().int().positive().max(MAX_TOOL_TIMEOUT_MS).optional(),
};

const CodexTaskInputSchema = z.object({
	...CodexTaskOptionSchema,
	prompt: z.string().min(1),
});

const CodexCheckInputSchema = z.object({
	taskId: z.string().min(1),
});

const CodexChromeReadInputSchema = z.object({
	...CodexTaskOptionSchema,
	request: z.string().min(1),
});

type CodexTaskToolInput = z.infer<typeof CodexTaskInputSchema>;
type CodexChromeReadToolInput = z.infer<typeof CodexChromeReadInputSchema>;

const createJsonResult = (payload: JsonValue): CallToolResult => ({
	content: [
		{
			text: JSON.stringify(payload),
			type: "text",
		},
	],
});

const findToolDescription = (name: CodexMcpToolName): string => {
	const tool = CODEX_MCP_TOOLS.find((item) => item.name === name);

	return tool?.description ?? "";
};

const normalizeTaskInput = (input: CodexTaskToolInput): CodexTaskInput => {
	const taskInput: CodexTaskInput = {
		prompt: input.prompt,
	};

	if (input.cwd) {
		taskInput.cwd = input.cwd;
	}
	if (input.model) {
		taskInput.model = input.model;
	}
	if (input.timeoutMs) {
		taskInput.timeoutMs = input.timeoutMs;
	}

	return taskInput;
};

const normalizeChromeReadInput = (input: CodexChromeReadToolInput): CodexChromeReadInput => {
	const chromeReadInput: CodexChromeReadInput = {
		request: input.request,
	};

	if (input.cwd) {
		chromeReadInput.cwd = input.cwd;
	}
	if (input.model) {
		chromeReadInput.model = input.model;
	}
	if (input.timeoutMs) {
		chromeReadInput.timeoutMs = input.timeoutMs;
	}

	return chromeReadInput;
};

const startChromeReadTask = (
	taskManager: CodexTaskManager,
	input: CodexChromeReadInput,
): CallToolResult => createJsonResult(taskManager.startTask(createChromeReadTaskInput(input)));

const createCodexMcpServer = (options: CreateCodexMcpServerOptions = {}): McpServer => {
	const server = new McpServer({
		name: "mikoto-codex-mcp",
		version: "0.0.0",
	});
	const taskManager = options.taskManager ?? new CodexTaskManager();

	server.registerTool(
		"codex_task",
		{
			description: findToolDescription("codex_task"),
			inputSchema: CodexTaskInputSchema,
			title: "Run Codex Task",
		},
		(input) => createJsonResult(taskManager.startTask(normalizeTaskInput(input))),
	);
	server.registerTool(
		"codex_check",
		{
			description: findToolDescription("codex_check"),
			inputSchema: CodexCheckInputSchema,
			title: "Check Codex Task",
		},
		(input) => createJsonResult(taskManager.checkTask(input.taskId)),
	);
	server.registerTool(
		"codex_chrome_read",
		{
			description: findToolDescription("codex_chrome_read"),
			inputSchema: CodexChromeReadInputSchema,
			title: "Read Browser With Codex",
		},
		(input) => startChromeReadTask(taskManager, normalizeChromeReadInput(input)),
	);

	return server;
};

export {
	CodexCheckInputSchema,
	CodexChromeReadInputSchema,
	CodexTaskInputSchema,
	createCodexMcpServer,
};
