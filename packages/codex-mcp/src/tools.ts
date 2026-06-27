export const CODEX_MCP_TOOLS = [
  {
    name: "codex_task",
    description: "Run a bounded Codex task."
  },
  {
    name: "codex_check",
    description: "Check Codex task or session state."
  },
  {
    name: "codex_chrome_read",
    description: "Read structured information from an allowed browser context without mutation."
  }
] as const;

export function resolveCodexCommand(hasMise = true): string[] {
  if (hasMise) {
    return ["mise", "x", "codex@latest", "--", "codex"];
  }

  return ["bunx", "codex"];
}

