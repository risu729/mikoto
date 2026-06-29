import { loadBridgeConfig } from "./config";

type BridgeHelloMessage = import("@mikoto/protocol").BridgeHelloMessage;
type ResolvedBridgeConfig = import("./config").ResolvedBridgeConfig;
type CliOptions = {
	configPath: string;
};

const parseArgs = (argv: string[]): CliOptions => {
	const configIndex = argv.indexOf("--config");
	return {
		configPath: configIndex >= 0 ? (argv[configIndex + 1] ?? "mikoto.toml") : "mikoto.toml",
	};
};

const nowIso = (): string => new Date().toISOString();

const createBridgeHelloMessage = (config: ResolvedBridgeConfig): BridgeHelloMessage => ({
	bridge: {
		id: config.bridge.id,
		lastHeartbeat: nowIso(),
		os: config.os,
		status: "connected",
		tools: [],
	},
	tools: [],
	type: "bridge.hello",
});

const connectRelay = (config: ResolvedBridgeConfig): Promise<void> =>
	// oxlint-disable-next-line promise/avoid-new
	new Promise((resolve, reject) => {
		const socket = new WebSocket(config.relay.url);

		socket.addEventListener("open", () => {
			socket.send(JSON.stringify(createBridgeHelloMessage(config)));
			process.stdout.write(`connected relay=${config.relay.url}\n`);
		});
		socket.addEventListener("message", (event) => {
			process.stdout.write(`relay ${String(event.data)}\n`);
		});
		socket.addEventListener("error", () => {
			reject(new Error(`Failed to connect relay: ${config.relay.url}`));
		});
		socket.addEventListener("close", (event) => {
			if (event.wasClean && event.code === 1000) {
				resolve();
				return;
			}

			reject(new Error(`Relay connection closed: code=${event.code} reason=${event.reason}`));
		});
	});

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
	await connectRelay(config);
};

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}

export { connectRelay, createBridgeHelloMessage, parseArgs };
