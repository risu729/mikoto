import { z } from "zod";

const ServerIdSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9_-]+$/u);
const BridgeIdSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9_.-]+$/u);
const ToolNameSchema = z
	.string()
	.min(1)
	.regex(/^[A-Za-z0-9_.-]+$/u);

const urlWithProtocol = (protocols: readonly string[]) =>
	z
		.string()
		.min(1)
		.refine(
			(value) => {
				try {
					return protocols.includes(new URL(value).protocol);
				} catch {
					return false;
				}
			},
			{ message: `Expected URL protocol: ${protocols.join(", ")}` },
		);

const WebSocketUrlSchema = urlWithProtocol(["ws:", "wss:"]);
const HttpUrlSchema = urlWithProtocol(["http:", "https:"]);

const ToolAliasSchema = z.strictObject({
	name: z.string().min(1),
	target: ToolNameSchema,
});

const BaseServerSchema = z.strictObject({
	aliases: z.array(ToolAliasSchema).default([]),
	id: ServerIdSchema,
});

const StdioServerSchema = BaseServerSchema.extend({
	args: z.array(z.string()).default([]),
	command: z.string().min(1),
	cwd: z.string().optional(),
	env: z.record(z.string().min(1), z.string()).default({}),
	transport: z.literal("stdio"),
});

const HttpServerSchema = BaseServerSchema.extend({
	transport: z.literal("http"),
	url: HttpUrlSchema,
});

const BackendServerSchema = z.discriminatedUnion("transport", [
	StdioServerSchema,
	HttpServerSchema,
]);

const MikotoConfigSchema = z.strictObject({
	bridge: z
		.strictObject({
			id: BridgeIdSchema.optional(),
		})
		.default({}),
	relay: z.strictObject({
		url: WebSocketUrlSchema,
	}),
	servers: z.array(BackendServerSchema).default([]),
});

type BridgeId = z.infer<typeof BridgeIdSchema>;
type ServerId = z.infer<typeof ServerIdSchema>;
type ToolName = z.infer<typeof ToolNameSchema>;
type ToolAlias = z.infer<typeof ToolAliasSchema>;
type BackendServer = z.infer<typeof BackendServerSchema>;
type MikotoConfig = z.infer<typeof MikotoConfigSchema>;

export {
	type BackendServer,
	BackendServerSchema,
	type BridgeId,
	BridgeIdSchema,
	HttpServerSchema,
	type MikotoConfig,
	MikotoConfigSchema,
	type ServerId,
	ServerIdSchema,
	StdioServerSchema,
	type ToolAlias,
	ToolAliasSchema,
	type ToolName,
	ToolNameSchema,
};
