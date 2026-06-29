import { JsonObjectSchema } from "@mikoto/protocol";
import type { BackendServer, ToolInfo } from "@mikoto/protocol";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
	getDefaultEnvironment,
	StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

type StdioBackendServer = Extract<BackendServer, { transport: "stdio" }>;
type BackendMcpClient = {
	close: () => Promise<void>;
	listTools: () => Promise<ListToolsResult>;
};
type BackendClientFactory = (server: StdioBackendServer) => Promise<BackendMcpClient>;
type StartedBackend = {
	close: () => Promise<void>;
	id: string;
	tools: ToolInfo[];
};
type BackendDiscovery = {
	close: () => Promise<void>;
	tools: ToolInfo[];
};
type StartBackendsOptions = {
	clientFactory?: BackendClientFactory;
};

const createStdioParams = (server: StdioBackendServer): StdioServerParameters => {
	const params: StdioServerParameters = {
		command: server.command,
	};

	if (server.args.length > 0) {
		params.args = server.args;
	}
	if (server.cwd) {
		params.cwd = server.cwd;
	}
	if (Object.keys(server.env).length > 0) {
		params.env = { ...getDefaultEnvironment(), ...server.env };
	}

	return params;
};

const createStdioBackendClient: BackendClientFactory = async (server) => {
	const client = new Client({
		name: "mikoto-bridge",
		version: "0.0.0",
	});
	const transport = new StdioClientTransport(createStdioParams(server));

	await client.connect(transport);
	return client;
};

const errorMessage = (error: unknown): string =>
	error instanceof Error ? error.message : String(error);

const closeStartedBackends = async (backends: StartedBackend[]): Promise<void> => {
	await Promise.allSettled(backends.map((backend) => backend.close()));
};

const createPrefixedToolInfo = (
	server: StdioBackendServer,
	tool: ListToolsResult["tools"][number],
): ToolInfo => {
	const toolInfo: ToolInfo = {
		inputSchema: JsonObjectSchema.parse(tool.inputSchema),
		name: `${server.id}.${tool.name}`,
	};

	if (tool.description) {
		toolInfo.description = tool.description;
	}

	return toolInfo;
};

const addUniqueTool = (tools: Map<string, ToolInfo>, tool: ToolInfo): void => {
	if (tools.has(tool.name)) {
		throw new Error(`Duplicate exposed tool name: ${tool.name}`);
	}

	tools.set(tool.name, tool);
};

const addBackendTools = (tools: Map<string, ToolInfo>, started: StartedBackend[]): void => {
	for (const backend of started) {
		for (const tool of backend.tools) {
			addUniqueTool(tools, tool);
		}
	}
};

const addAliasTools = (tools: Map<string, ToolInfo>, config: BackendServer[]): void => {
	for (const server of config) {
		for (const alias of server.aliases) {
			const target = tools.get(alias.target);
			if (!target) {
				throw new Error(`Alias ${alias.name} targets unknown tool: ${alias.target}`);
			}

			addUniqueTool(tools, {
				...target,
				name: alias.name,
			});
		}
	}
};

const buildExposedTools = (config: BackendServer[], started: StartedBackend[]): ToolInfo[] => {
	const tools = new Map<string, ToolInfo>();

	addBackendTools(tools, started);
	addAliasTools(tools, config);

	return Array.from(tools.values()).sort((left, right) => left.name.localeCompare(right.name));
};

const startStdioBackend = async (
	server: StdioBackendServer,
	clientFactory: BackendClientFactory,
): Promise<StartedBackend> => {
	const client = await clientFactory(server);
	const backend = {
		close: () => client.close(),
		id: server.id,
		tools: [] as ToolInfo[],
	};

	try {
		const { tools } = await client.listTools();
		backend.tools = tools.map((tool) => createPrefixedToolInfo(server, tool));
		return backend;
	} catch (error) {
		await backend.close();
		throw error;
	}
};

const throwBackendStartupError = async (
	started: StartedBackend[],
	error: unknown,
): Promise<never> => {
	await closeStartedBackends(started);
	throw new Error(`Failed to start bridge backends: ${errorMessage(error)}`, { cause: error });
};

const findStartupError = (
	results: PromiseSettledResult<StartedBackend>[],
): PromiseRejectedResult | undefined => results.find((result) => result.status === "rejected");

const assertSupportedBackends = (servers: BackendServer[]): void => {
	const unsupportedHttp = servers.find((server) => server.transport === "http");
	if (unsupportedHttp) {
		throw new Error(
			`Failed to start bridge backends: HTTP backend transport is not implemented yet: ${unsupportedHttp.id}`,
		);
	}
};

const startStdioBackends = async (
	servers: BackendServer[],
	clientFactory: BackendClientFactory,
): Promise<StartedBackend[]> => {
	const stdioServers = servers.filter((server) => server.transport === "stdio");
	const results = await Promise.allSettled(
		stdioServers.map((server) => startStdioBackend(server, clientFactory)),
	);
	const started = results
		.filter((result) => result.status === "fulfilled")
		.map((result) => result.value);
	const startupError = findStartupError(results);

	if (startupError) {
		return await throwBackendStartupError(started, startupError.reason);
	}

	return started;
};

const createBackendDiscovery = (
	servers: BackendServer[],
	started: StartedBackend[],
): BackendDiscovery => ({
	close: () => closeStartedBackends(started),
	tools: buildExposedTools(servers, started),
});

const startConfiguredBackends = async (
	servers: BackendServer[],
	options: StartBackendsOptions = {},
): Promise<BackendDiscovery> => {
	const clientFactory = options.clientFactory ?? createStdioBackendClient;
	assertSupportedBackends(servers);
	const started = await startStdioBackends(servers, clientFactory);

	try {
		return createBackendDiscovery(servers, started);
	} catch (error) {
		return await throwBackendStartupError(started, error);
	}
};

export {
	type BackendClientFactory,
	type BackendDiscovery,
	type BackendMcpClient,
	buildExposedTools,
	startConfiguredBackends,
};
