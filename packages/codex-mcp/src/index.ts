import { MIKOTO_VERSION } from "@mikoto/protocol";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import is from "@sindresorhus/is";

import { createCodexMcpServer } from "./server";

const main = async (argv = process.argv.slice(2)): Promise<void> => {
	if (argv.includes("--version") || argv.includes("-v")) {
		process.stdout.write(`${MIKOTO_VERSION}\n`);
		return;
	}

	const server = await createCodexMcpServer();
	const transport = new StdioServerTransport();

	process.stderr.write("mikoto-codex-mcp listening on stdio\n");
	await server.connect(transport);
};

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		process.stderr.write(`${is.error(error) ? error.message : String(error)}\n`);
		process.exit(1);
	}
}
