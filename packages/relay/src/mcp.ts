import { JsonObjectSchema } from "@mikoto/protocol";
import type { JsonObject, ToolCallResult, ToolInfo } from "@mikoto/protocol";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
	CallToolRequestSchema,
	CallToolResultSchema,
	ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult, Tool } from "@modelcontextprotocol/sdk/types.js";

import type { RegisteredBridge } from "./routing";

type Env = {
	RELAY_DO: DurableObjectNamespace;
};

const BRIDGE_ID_META_KEYS = ["mikoto/bridgeId", "bridgeId"] as const;

const getRelayStub = (env: Env): DurableObjectStub => {
	const durableObjectId = env.RELAY_DO.idFromName("global");
	return env.RELAY_DO.get(durableObjectId);
};

const createJsonToolResult = (payload: unknown, isError = false): CallToolResult => ({
	content: [
		{
			text: JSON.stringify(payload),
			type: "text",
		},
	],
	isError,
});

const readBridges = async (env: Env): Promise<RegisteredBridge[]> => {
	const response = await getRelayStub(env).fetch("http://relay.local/bridges");
	const { bridges } = (await response.json()) as { bridges: RegisteredBridge[] };

	return bridges;
};

const callBridgeTool = async (
	env: Env,
	input: {
		arguments: JsonObject;
		bridgeId?: string;
		tool: string;
	},
): Promise<ToolCallResult> => {
	const response = await getRelayStub(env).fetch("http://relay.local/tool-call", {
		body: JSON.stringify(input),
		method: "POST",
	});

	return (await response.json()) as ToolCallResult;
};

const listExposedTools = (bridges: RegisteredBridge[]): ToolInfo[] => {
	const tools = new Map<string, ToolInfo>();

	for (const bridge of bridges) {
		for (const tool of bridge.toolMetadata) {
			if (!tools.has(tool.name)) {
				tools.set(tool.name, tool);
			}
		}
	}

	return Array.from(tools.values()).sort((left, right) => left.name.localeCompare(right.name));
};

const createListBridgesTool = (): Tool => ({
	description: "List currently connected local Mikoto bridges.",
	inputSchema: {
		additionalProperties: false,
		properties: {},
		type: "object",
	},
	name: "mikoto_list_bridges",
	title: "List Mikoto Bridges",
});

const createExposedTool = (tool: ToolInfo): Tool => {
	const exposed: Tool = {
		inputSchema: tool.inputSchema as Tool["inputSchema"],
		name: tool.name,
		title: tool.name,
	};

	if (tool.description) {
		exposed.description = tool.description;
	}

	return exposed;
};

const readBridgeIdMeta = (meta: unknown): null | string => {
	if (!meta || typeof meta !== "object") {
		return null;
	}

	for (const key of BRIDGE_ID_META_KEYS) {
		const value = (meta as Record<string, unknown>)[key];
		if (typeof value === "string" && value.length > 0) {
			return value;
		}
	}

	return null;
};

const toCallToolResult = (result: ToolCallResult): CallToolResult => {
	if (!result.ok) {
		return createJsonToolResult(result, true);
	}

	const parsed = CallToolResultSchema.safeParse(result.result);
	if (!parsed.success) {
		return createJsonToolResult(
			{
				error: {
					code: "invalid_backend_result",
					message: "Backend tool returned an invalid MCP tool result.",
				},
				id: result.id,
				ok: false,
				type: "tool.result",
			},
			true,
		);
	}

	return parsed.data;
};

const handleToolCall = async (input: {
	args: JsonObject;
	bridgeId: null | string;
	env: Env;
	name: string;
}): Promise<CallToolResult> => {
	const { args, bridgeId, env, name } = input;

	if (name === "mikoto_list_bridges") {
		return createJsonToolResult({ bridges: await readBridges(env) });
	}

	return toCallToolResult(
		await callBridgeTool(env, {
			arguments: args,
			...(bridgeId ? { bridgeId } : {}),
			tool: name,
		}),
	);
};

const createRelayMcpServer = (env: Env): Server => {
	const server = new Server(
		{
			name: "mikoto-relay",
			version: "0.0.0",
		},
		{
			capabilities: {
				tools: {},
			},
		},
	);

	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [
			createListBridgesTool(),
			...listExposedTools(await readBridges(env)).map((tool) => createExposedTool(tool)),
		],
	}));
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const meta = request.params["_meta"];

		return await handleToolCall({
			args: JsonObjectSchema.parse(request.params.arguments ?? {}),
			bridgeId: readBridgeIdMeta(meta),
			env,
			name: request.params.name,
		});
	});

	return server;
};

export default createRelayMcpServer;
