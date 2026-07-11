import { JsonObjectSchema } from "@mikoto/protocol";
import type { JsonObject, ToolCallResult } from "@mikoto/protocol";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

import type { RegisteredBridge } from "./routing";

const CALL_TOOL_NAME = "mikoto_call_tool";
const LIST_BRIDGES_TOOL_NAME = "mikoto_list_bridges";
const EmptyInputSchema = z.strictObject({});
const CallToolInputSchema = z.strictObject({
	arguments: JsonObjectSchema.optional(),
	bridgeId: z.string().min(1).optional(),
	tool: z.string().min(1),
});

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

const createRelayMcpServer = (env: Env): McpServer => {
	const server = new McpServer({
		name: "mikoto-relay",
		version: "0.0.0",
	});

	server.registerTool(
		LIST_BRIDGES_TOOL_NAME,
		{
			description: "List currently connected local Mikoto bridges.",
			inputSchema: EmptyInputSchema,
			title: "List Mikoto Bridges",
		},
		async () => createJsonToolResult({ bridges: await readBridges(env) }),
	);
	server.registerTool(
		CALL_TOOL_NAME,
		{
			description:
				"Call a tool on a connected local Mikoto bridge. Call mikoto_list_bridges first, inspect each bridge's toolMetadata, then pass the selected backend tool name and arguments here.",
			inputSchema: CallToolInputSchema,
			title: "Call Mikoto Tool",
		},
		async (input) =>
			toCallToolResult(
				await callBridgeTool(env, {
					arguments: input.arguments ?? {},
					...(input.bridgeId ? { bridgeId: input.bridgeId } : {}),
					tool: input.tool,
				}),
			),
	);

	return server;
};

export default createRelayMcpServer;
