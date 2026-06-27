import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import { CodexTaskManager, MAX_TOOL_TIMEOUT_MS } from "./codex";
import { CODEX_MCP_TOOLS } from "./tools";

type JsonValue = boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };

type CodexTaskInput = import("./codex").CodexTaskInput;

type CreateCodexMcpServerOptions = {
	taskManager?: CodexTaskManager;
};

const CodexTaskInputSchema = {
	cwd: z.string().min(1).optional(),
	model: z.string().min(1).optional(),
	prompt: z.string().min(1),
	timeoutMs: z.number().int().positive().max(MAX_TOOL_TIMEOUT_MS).optional(),
};

const CodexCheckInputSchema = {
	taskId: z.string().min(1),
};

const createJsonResult = (payload: JsonValue): CallToolResult => ({
	content: [
		{
			text: JSON.stringify(payload),
			type: "text",
		},
	],
});

const findToolDescription = (name: string): string => {
	const tool = CODEX_MCP_TOOLS.find((item) => item.name === name);

	return tool?.description ?? "";
};

const normalizeTaskInput = (input: {
	cwd?: string | undefined;
	model?: string | undefined;
	prompt: string;
	timeoutMs?: number | undefined;
}): CodexTaskInput => {
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

	return server;
};

export { CodexCheckInputSchema, CodexTaskInputSchema, createCodexMcpServer };
