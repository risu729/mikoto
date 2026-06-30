import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createCodexMcpServer } from "./server";

const main = async (): Promise<void> => {
	const server = await createCodexMcpServer();
	const transport = new StdioServerTransport();

	process.stderr.write("mikoto-codex-mcp listening on stdio\n");
	await server.connect(transport);
};

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}
