import { loadBridgeConfig } from "./config";

type CliOptions = {
	configPath: string;
};

const parseArgs = (argv: string[]): CliOptions => {
	const configIndex = argv.indexOf("--config");
	return {
		configPath: configIndex >= 0 ? (argv[configIndex + 1] ?? "mikoto.toml") : "mikoto.toml",
	};
};

const main = async (argv = process.argv.slice(2)): Promise<void> => {
	const { configPath } = parseArgs(argv);
	const config = await loadBridgeConfig(configPath);
	const unsupportedHttp = config.servers.find((server) => server.transport === "http");

	if (unsupportedHttp) {
		throw new Error(`HTTP backend transport is not implemented yet: ${unsupportedHttp.id}`);
	}

	process.stdout.write("mikoto bridge scaffold\n");
	process.stdout.write(`bridge=${config.bridge.id} os=${config.os} relay=${config.relay.url}\n`);
	process.stdout.write(`configured_backends=${config.servers.length}\n`);
};

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}
