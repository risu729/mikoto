const CODEX_MCP_TOOLS = [
	{
		description: "Run a bounded Codex task.",
		name: "codex_task",
	},
	{
		description: "Check Codex task or session state.",
		name: "codex_check",
	},
] as const;

type CodexMcpToolName = (typeof CODEX_MCP_TOOLS)[number]["name"];

export { CODEX_MCP_TOOLS };
export type { CodexMcpToolName };
