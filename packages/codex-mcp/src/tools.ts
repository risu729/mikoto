const CODEX_MCP_TOOLS = [
	{
		description: "Run a bounded Codex task.",
		name: "codex_task",
	},
	{
		description: "Check Codex task or session state.",
		name: "codex_check",
	},
	{
		description: "Read structured information from an allowed browser context without mutation.",
		name: "codex_chrome_read",
	},
] as const;

const resolveCodexCommand = (hasMise = true): string[] => {
	if (hasMise) {
		return ["mise", "x", "codex@latest", "--", "codex"];
	}

	return ["bunx", "codex"];
};

export { CODEX_MCP_TOOLS, resolveCodexCommand };
