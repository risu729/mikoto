import { CODEX_MCP_TOOLS } from "./tools";

const main = (): void => {
	process.stdout.write("mikoto-codex-mcp scaffold\n");
	process.stdout.write(`tools=${CODEX_MCP_TOOLS.map((tool) => tool.name).join(",")}\n`);
};

if (import.meta.main) {
	try {
		main();
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}
