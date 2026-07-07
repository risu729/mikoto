const CODEX_MCP_TOOLS = [
	{
		description:
			"Start a bounded read-only Codex task and return a task id for polling instead of waiting for completion.",
		name: "codex_task_start",
	},
	{
		description:
			"Start a bounded read-only browser request through Codex and @Chrome and return a task id for polling.",
		name: "codex_chrome_read_start",
	},
	{
		description: "Return status, partial text, and normalized items for a running Codex run.",
		name: "codex_run_status",
	},
	{
		description: "Return the final normalized result for a completed Codex run.",
		name: "codex_run_result",
	},
	{
		description: "Request cancellation for a running Codex run.",
		name: "codex_run_cancel",
	},
] as const;

type CodexMcpToolName = (typeof CODEX_MCP_TOOLS)[number]["name"];

export { CODEX_MCP_TOOLS };
export type { CodexMcpToolName };
