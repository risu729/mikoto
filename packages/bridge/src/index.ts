import { MIKOTO_VERSION, RelayToBridgeMessageSchema } from "@mikoto/protocol";
import type {
	BridgeHelloMessage,
	JsonObject,
	JsonValue,
	ToolCallRequest,
	ToolCallResult,
	ToolInfo,
} from "@mikoto/protocol";

import { startConfiguredBackends } from "./backends";
import type { BackendDiscovery } from "./backends";
import { loadBridgeConfig } from "./config";
import type { ResolvedBridgeConfig } from "./config";

type CliOptions = {
	configPath: string;
};

const parseArgs = (argv: string[]): CliOptions => {
	const configIndex = argv.indexOf("--config");
	return {
		configPath: configIndex >= 0 ? (argv[configIndex + 1] ?? "mikoto.toml") : "mikoto.toml",
	};
};

const printVersion = (argv: string[]): boolean => {
	if (!argv.includes("--version") && !argv.includes("-v")) {
		return false;
	}

	process.stdout.write(`${MIKOTO_VERSION}\n`);
	return true;
};

const nowIso = (): string => new Date().toISOString();

const createBridgeHelloMessage = (
	config: ResolvedBridgeConfig,
	tools: ToolInfo[] = [],
): BridgeHelloMessage => ({
	bridge: {
		id: config.bridge.id,
		lastHeartbeat: nowIso(),
		os: config.os,
		status: "connected",
		tools: tools.map((tool) => tool.name),
	},
	tools,
	type: "bridge.hello",
});

const parseRelayMessage = (message: string): null | ToolCallRequest => {
	try {
		return RelayToBridgeMessageSchema.parse(JSON.parse(message) as unknown);
	} catch {
		return null;
	}
};

const readRelayMessageId = (message: string): null | string => {
	try {
		const parsed = JSON.parse(message) as unknown;
		if (parsed && typeof parsed === "object") {
			const { id } = parsed as Record<string, unknown>;
			if (typeof id === "string" && id.length > 0) {
				return id;
			}
		}
	} catch {
		return null;
	}

	return null;
};

const createToolSuccess = (id: string, result: JsonValue): ToolCallResult => ({
	id,
	ok: true,
	result,
	type: "tool.result",
});

const createToolError = (id: string, code: string, message: string): ToolCallResult => ({
	error: {
		code,
		message,
	},
	id,
	ok: false,
	type: "tool.result",
});

const handleRelayToolCall = async (
	backendDiscovery: BackendDiscovery,
	request: ToolCallRequest,
): Promise<ToolCallResult> => {
	try {
		return createToolSuccess(
			request.id,
			await backendDiscovery.callTool(request.tool, request.arguments as JsonObject),
		);
	} catch (error) {
		return createToolError(
			request.id,
			"backend_tool_error",
			error instanceof Error ? error.message : String(error),
		);
	}
};

const handleRelayMessage = async (
	backendDiscovery: BackendDiscovery,
	socket: WebSocket,
	data: string,
): Promise<void> => {
	const request = parseRelayMessage(data);
	if (!request) {
		const id = readRelayMessageId(data);
		if (id) {
			socket.send(
				JSON.stringify(createToolError(id, "invalid_relay_message", "Invalid relay tool call.")),
			);
		}
		process.stdout.write(`relay ${data}\n`);
		return;
	}

	socket.send(JSON.stringify(await handleRelayToolCall(backendDiscovery, request)));
};

const connectRelay = (
	config: ResolvedBridgeConfig,
	backendDiscovery: BackendDiscovery,
): Promise<void> =>
	// oxlint-disable-next-line promise/avoid-new
	new Promise((resolve, reject) => {
		const socket = new WebSocket(config.relay.url);

		socket.addEventListener("open", () => {
			socket.send(JSON.stringify(createBridgeHelloMessage(config, backendDiscovery.tools)));
			process.stdout.write(`connected relay=${config.relay.url}\n`);
		});
		socket.addEventListener("message", async (event) => {
			try {
				await handleRelayMessage(backendDiscovery, socket, String(event.data));
			} catch (error) {
				process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
			}
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

const runBridge = async (configPath: string): Promise<void> => {
	const config = await loadBridgeConfig(configPath);
	const backendDiscovery = await startConfiguredBackends(config.servers);

	process.stdout.write("mikoto bridge scaffold\n");
	process.stdout.write(`bridge=${config.bridge.id} os=${config.os} relay=${config.relay.url}\n`);
	process.stdout.write(`configured_backends=${config.servers.length}\n`);
	process.stdout.write(`discovered_tools=${backendDiscovery.tools.length}\n`);

	try {
		await connectRelay(config, backendDiscovery);
	} finally {
		await backendDiscovery.close();
	}
};

const main = async (argv = process.argv.slice(2)): Promise<void> => {
	if (!printVersion(argv)) {
		await runBridge(parseArgs(argv).configPath);
	}
};

if (import.meta.main) {
	try {
		await main();
	} catch (error) {
		process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
		process.exit(1);
	}
}

export { connectRelay, createBridgeHelloMessage, handleRelayMessage, parseArgs };
