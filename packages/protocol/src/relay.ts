import { z } from "zod";

export const BridgeStatusSchema = z.enum(["connected", "busy", "disconnected"]);

export const ToolInfoSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  inputSchema: z.unknown().optional()
});

export const BridgeMetadataSchema = z.object({
  id: z.string().min(1),
  os: z.string().min(1),
  status: BridgeStatusSchema,
  lastHeartbeat: z.string().datetime(),
  tools: z.array(z.string())
});

export const BridgeHelloMessageSchema = z.object({
  type: z.literal("bridge.hello"),
  bridge: BridgeMetadataSchema,
  tools: z.array(ToolInfoSchema)
});

export const ToolCallRequestSchema = z.object({
  type: z.literal("tool.call"),
  id: z.string().min(1),
  tool: z.string().min(1),
  bridgeId: z.string().min(1).optional(),
  arguments: z.record(z.string(), z.unknown()).default({})
});

export const ToolCallResultSchema = z.object({
  type: z.literal("tool.result"),
  id: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1)
    })
    .optional()
});

export type BridgeStatus = z.infer<typeof BridgeStatusSchema>;
export type ToolInfo = z.infer<typeof ToolInfoSchema>;
export type BridgeMetadata = z.infer<typeof BridgeMetadataSchema>;
export type BridgeHelloMessage = z.infer<typeof BridgeHelloMessageSchema>;
export type ToolCallRequest = z.infer<typeof ToolCallRequestSchema>;
export type ToolCallResult = z.infer<typeof ToolCallResultSchema>;

