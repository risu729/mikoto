import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { CodexChromeReadInput } from "./chrome-read";
import { createChromeReadTaskInput, createReadOnlyTaskPrompt } from "./chrome-read";
import type { CodexRunInput } from "./codex";
import { CodexAppServerClient, MAX_TOOL_TIMEOUT_MS } from "./codex";
import type { CodexMcpToolName } from "./tools";
import { CODEX_MCP_TOOLS } from "./tools";

type JsonValue = boolean | JsonValue[] | null | number | string | { [key: string]: JsonValue };

type CreateCodexMcpServerOptions = {
	client?: CodexAppServerClient;
};

const CodexTaskOptionSchema = {
	cwd: z.string().min(1).optional(),
	timeoutMs: z.number().int().positive().max(MAX_TOOL_TIMEOUT_MS).optional(),
};

const CodexTaskInputSchema = z.object({
	...CodexTaskOptionSchema,
	prompt: z.string().min(1),
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

const normalizeTaskInput = (input: CodexTaskToolInput): CodexRunInput => {
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

const normalizeChromeReadInput = (input: CodexChromeReadToolInput): CodexChromeReadInput => {
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

const runChromeReadTask = async (
	client: CodexAppServerClient,
	input: CodexChromeReadInput,
): Promise<CallToolResult> => createJsonResult(await client.run(createChromeReadTaskInput(input)));

const createCodexMcpServer = async (
	options: CreateCodexMcpServerOptions = {},
): Promise<McpServer> => {
	const server = new McpServer({
		name: "mikoto-codex-mcp",
		version: "0.0.0",
	});
	const client = options.client ?? (await CodexAppServerClient.create());

	server.registerTool(
		"codex_task",
		{
			description: findToolDescription("codex_task"),
			inputSchema: CodexTaskInputSchema,
			title: "Run Codex Task",
		},
		async (input) => createJsonResult(await client.run(normalizeTaskInput(input))),
	);
	server.registerTool(
		"codex_chrome_read",
		{
			description: findToolDescription("codex_chrome_read"),
			inputSchema: CodexChromeReadInputSchema,
			title: "Read Browser With Codex",
		},
		(input) => runChromeReadTask(client, normalizeChromeReadInput(input)),
	);

	return server;
};

export { CodexChromeReadInputSchema, CodexTaskInputSchema, createCodexMcpServer };
