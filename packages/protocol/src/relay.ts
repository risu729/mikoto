import { z } from "zod";

const BridgeStatusSchema = z.enum(["connected", "busy", "disconnected"]);

const ToolInfoSchema = z.object({
	description: z.string().optional(),
	inputSchema: z.unknown().optional(),
	name: z.string().min(1),
});

const BridgeMetadataSchema = z.object({
	id: z.string().min(1),
	lastHeartbeat: z.string().datetime(),
	os: z.string().min(1),
	status: BridgeStatusSchema,
	tools: z.array(z.string()),
});

const BridgeHelloMessageSchema = z.object({
	bridge: BridgeMetadataSchema,
	tools: z.array(ToolInfoSchema),
	type: z.literal("bridge.hello"),
});

const ToolCallRequestSchema = z.object({
	arguments: z.record(z.string(), z.unknown()).default({}),
	bridgeId: z.string().min(1).optional(),
	id: z.string().min(1),
	tool: z.string().min(1),
	type: z.literal("tool.call"),
});

const ToolCallResultSchema = z.object({
	error: z
		.object({
			code: z.string().min(1),
			message: z.string().min(1),
		})
		.optional(),
	id: z.string().min(1),
	ok: z.boolean(),
	result: z.unknown().optional(),
	type: z.literal("tool.result"),
});

type BridgeStatus = z.infer<typeof BridgeStatusSchema>;
type ToolInfo = z.infer<typeof ToolInfoSchema>;
type BridgeMetadata = z.infer<typeof BridgeMetadataSchema>;
type BridgeHelloMessage = z.infer<typeof BridgeHelloMessageSchema>;
type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
type ToolCallResult = z.infer<typeof ToolCallResultSchema>;

export {
	type BridgeHelloMessage,
	BridgeHelloMessageSchema,
	type BridgeMetadata,
	BridgeMetadataSchema,
	type BridgeStatus,
	BridgeStatusSchema,
	type ToolCallRequest,
	ToolCallRequestSchema,
	type ToolCallResult,
	ToolCallResultSchema,
	type ToolInfo,
	ToolInfoSchema,
};
