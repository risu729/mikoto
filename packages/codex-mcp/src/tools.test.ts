import { describe, expect, it } from "vitest";
import { CODEX_MCP_TOOLS, resolveCodexCommand } from "./tools";

describe("codex MCP scaffold", () => {
  it("exposes the browser read tool name", () => {
    expect(CODEX_MCP_TOOLS.map((tool) => tool.name)).toContain("codex_chrome_read");
  });

  it("prefers mise for Codex CLI resolution", () => {
    expect(resolveCodexCommand(true).slice(0, 4)).toEqual(["mise", "x", "codex@latest", "--"]);
    expect(resolveCodexCommand(false)[0]).toBe("bunx");
  });
});

