const CODEX_MCP_TOOLS = [
	{
		description: "Run a bounded read-only Codex task and return the final result.",
		name: "codex_task",
	},
	{
		description: "Run a bounded read-only browser request through Codex and @Chrome.",
		name: "codex_chrome_read",
	},
] as const;

type CodexMcpToolName = (typeof CODEX_MCP_TOOLS)[number]["name"];

export { CODEX_MCP_TOOLS };
export type { CodexMcpToolName };
