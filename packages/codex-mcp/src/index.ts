import { CODEX_MCP_TOOLS } from "./tools";

export async function main(): Promise<void> {
  console.log("mikoto-codex-mcp scaffold");
  console.log(`tools=${CODEX_MCP_TOOLS.map((tool) => tool.name).join(",")}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

