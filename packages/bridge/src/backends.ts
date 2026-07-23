import { JsonObjectSchema, JsonValueSchema, MIKOTO_VERSION } from "@mikoto/protocol";
import type { BackendServer, JsonObject, JsonValue, ToolInfo } from "@mikoto/protocol";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
	getDefaultEnvironment,
	StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import type { StdioServerParameters } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ListToolsResult } from "@modelcontextprotocol/sdk/types.js";

import resolveBackendToolCallOptions from "./backend-timeouts";

type StdioBackendServer = Extract<BackendServer, { transport: "stdio" }>;
type BackendMcpClient = Pick<Client, "callTool" | "close" | "listTools">;
type BackendClientFactory = (server: StdioBackendServer) => Promise<BackendMcpClient>;
type ToolRoute = {
	backendId: string;
	backendToolName: string;
	client: BackendMcpClient;
};
type StartedBackend = {
	client: BackendMcpClient;
	close: () => Promise<void>;
	id: string;
	routes: Map<string, ToolRoute>;
	tools: ToolInfo[];
};
type BackendDiscovery = {
	callTool: (tool: string, args: JsonObject) => Promise<JsonValue>;
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
		version: MIKOTO_VERSION,
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

const toJsonValue = (value: unknown): JsonValue =>
	JsonValueSchema.parse(JSON.parse(JSON.stringify(value)) as unknown);

const addUniqueTool = (tools: Map<string, ToolInfo>, tool: ToolInfo): void => {
	if (tools.has(tool.name)) {
		throw new Error(`Duplicate exposed tool name: ${tool.name}`);
	}

	tools.set(tool.name, tool);
};

const addToolRoute = (routes: Map<string, ToolRoute>, toolName: string, route: ToolRoute): void => {
	if (routes.has(toolName)) {
		throw new Error(`Duplicate exposed tool name: ${toolName}`);
	}

	routes.set(toolName, route);
};

const addBackendTools = (
	routes: Map<string, ToolRoute>,
	tools: Map<string, ToolInfo>,
	started: StartedBackend[],
): void => {
	for (const backend of started) {
		for (const tool of backend.tools) {
			addUniqueTool(tools, tool);
			const route = backend.routes.get(tool.name);
			if (route) {
				addToolRoute(routes, tool.name, route);
			}
		}
	}
};

const addAliasTools = (
	routes: Map<string, ToolRoute>,
	tools: Map<string, ToolInfo>,
	config: BackendServer[],
): void => {
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
			const route = routes.get(alias.target);
			if (route) {
				addToolRoute(routes, alias.name, route);
			}
		}
	}
};

const buildBackendRoutes = (
	config: BackendServer[],
	started: StartedBackend[],
): { routes: Map<string, ToolRoute>; tools: ToolInfo[] } => {
	const routes = new Map<string, ToolRoute>();
	const tools = new Map<string, ToolInfo>();

	addBackendTools(routes, tools, started);
	addAliasTools(routes, tools, config);

	return {
		routes,
		tools: Array.from(tools.values()).sort((left, right) => left.name.localeCompare(right.name)),
	};
};

const createBackendToolRoutes = (
	server: StdioBackendServer,
	client: BackendMcpClient,
	tools: ToolInfo[],
): Map<string, ToolRoute> => {
	const routes = new Map<string, ToolRoute>();

	for (const tool of tools) {
		routes.set(tool.name, {
			backendId: server.id,
			backendToolName: tool.name.slice(server.id.length + 1),
			client,
		});
	}

	return routes;
};

const startStdioBackend = async (
	server: StdioBackendServer,
	clientFactory: BackendClientFactory,
): Promise<StartedBackend> => {
	const client = await clientFactory(server);
	const backend = {
		client,
		close: () => client.close(),
		id: server.id,
		routes: new Map<string, ToolRoute>(),
		tools: [] as ToolInfo[],
	};

	try {
		const { tools } = await client.listTools();
		backend.tools = tools.map((tool) => createPrefixedToolInfo(server, tool));
		backend.routes = createBackendToolRoutes(server, client, backend.tools);
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
): BackendDiscovery => {
	const { routes, tools } = buildBackendRoutes(servers, started);

	return {
		callTool: async (tool, args) => {
			const route = routes.get(tool);
			if (!route) {
				throw new Error(`Tool is not exposed by this bridge: ${tool}`);
			}

			const result = await route.client.callTool(
				{
					arguments: args,
					name: route.backendToolName,
				},
				CallToolResultSchema,
				resolveBackendToolCallOptions(args),
			);
			return toJsonValue(result);
		},
		close: () => closeStartedBackends(started),
		tools,
	};
};

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
	startConfiguredBackends,
};
