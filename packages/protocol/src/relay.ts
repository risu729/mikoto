import { z } from "zod";

import { BridgeIdSchema, ToolNameSchema } from "./config";

type JsonObject = { [key: string]: JsonValue };
type JsonValue = boolean | null | number | string | JsonObject | JsonValue[];

const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
	z.union([
		z.string(),
		z.number().finite(),
		z.boolean(),
		z.null(),
		z.array(JsonValueSchema),
		z.record(z.string(), JsonValueSchema),
	]),
);

const JsonObjectSchema: z.ZodType<JsonObject> = z.record(z.string(), JsonValueSchema);

const DefaultToolInputSchema = {
	additionalProperties: true,
	properties: {},
	type: "object",
} satisfies JsonObject;

const BridgeStatusSchema = z.enum(["connected", "busy", "disconnected"]);

const ToolInfoSchema = z.strictObject({
	description: z.string().optional(),
	inputSchema: JsonObjectSchema.default(DefaultToolInputSchema),
	name: ToolNameSchema,
});

const BridgeMetadataSchema = z.strictObject({
	id: BridgeIdSchema,
	lastHeartbeat: z.string().datetime(),
	os: z.string().min(1),
	status: BridgeStatusSchema,
	tools: z.array(ToolNameSchema),
});

const BridgeHelloMessageSchema = z.strictObject({
	bridge: BridgeMetadataSchema,
	tools: z.array(ToolInfoSchema),
	type: z.literal("bridge.hello"),
});

const BridgeToolSnapshotMessageSchema = z.strictObject({
	bridgeId: BridgeIdSchema,
	tools: z.array(ToolInfoSchema),
	type: z.literal("bridge.tool_snapshot"),
});

const BridgeHeartbeatMessageSchema = z.strictObject({
	bridgeId: BridgeIdSchema,
	lastHeartbeat: z.string().datetime(),
	status: BridgeStatusSchema,
	type: z.literal("bridge.heartbeat"),
});

const ToolCallRequestSchema = z.strictObject({
	arguments: JsonObjectSchema.default({}),
	bridgeId: BridgeIdSchema.optional(),
	id: z.string().min(1),
	tool: ToolNameSchema,
	type: z.literal("tool.call"),
});

const ToolCallErrorSchema = z.strictObject({
	code: z.string().min(1),
	details: JsonValueSchema.optional(),
	message: z.string().min(1),
});

const ToolCallSuccessResultSchema = z.strictObject({
	id: z.string().min(1),
	ok: z.literal(true),
	result: JsonValueSchema.optional(),
	type: z.literal("tool.result"),
});

const ToolCallErrorResultSchema = z.strictObject({
	error: ToolCallErrorSchema,
	id: z.string().min(1),
	ok: z.literal(false),
	type: z.literal("tool.result"),
});

const ToolCallResultSchema = z.discriminatedUnion("ok", [
	ToolCallSuccessResultSchema,
	ToolCallErrorResultSchema,
]);

const BridgeToRelayMessageSchema = z.union([
	BridgeHelloMessageSchema,
	BridgeHeartbeatMessageSchema,
	BridgeToolSnapshotMessageSchema,
	ToolCallErrorResultSchema,
	ToolCallSuccessResultSchema,
]);

const RelayToBridgeMessageSchema = ToolCallRequestSchema;

type BridgeStatus = z.infer<typeof BridgeStatusSchema>;
type ToolInfo = z.infer<typeof ToolInfoSchema>;
type BridgeMetadata = z.infer<typeof BridgeMetadataSchema>;
type BridgeHelloMessage = z.infer<typeof BridgeHelloMessageSchema>;
type BridgeHeartbeatMessage = z.infer<typeof BridgeHeartbeatMessageSchema>;
type BridgeToolSnapshotMessage = z.infer<typeof BridgeToolSnapshotMessageSchema>;
type BridgeToRelayMessage = z.infer<typeof BridgeToRelayMessageSchema>;
type RelayToBridgeMessage = z.infer<typeof RelayToBridgeMessageSchema>;
type ToolCallError = z.infer<typeof ToolCallErrorSchema>;
type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
type ToolCallResult = z.infer<typeof ToolCallResultSchema>;

export {
	type BridgeHelloMessage,
	BridgeHelloMessageSchema,
	type BridgeHeartbeatMessage,
	BridgeHeartbeatMessageSchema,
	type BridgeMetadata,
	BridgeMetadataSchema,
	type BridgeStatus,
	BridgeStatusSchema,
	type BridgeToolSnapshotMessage,
	BridgeToolSnapshotMessageSchema,
	type BridgeToRelayMessage,
	BridgeToRelayMessageSchema,
	type JsonObject,
	JsonObjectSchema,
	type JsonValue,
	JsonValueSchema,
	type RelayToBridgeMessage,
	RelayToBridgeMessageSchema,
	type ToolCallError,
	ToolCallErrorResultSchema,
	ToolCallErrorSchema,
	type ToolCallRequest,
	ToolCallRequestSchema,
	type ToolCallResult,
	ToolCallResultSchema,
	ToolCallSuccessResultSchema,
	type ToolInfo,
	ToolInfoSchema,
};
