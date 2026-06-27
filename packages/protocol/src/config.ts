import { z } from "zod";

const ToolAliasSchema = z.object({
	name: z.string().min(1),
	target: z.string().min(1),
});

const BaseServerSchema = z.object({
	aliases: z.array(ToolAliasSchema).default([]),
	id: z.string().min(1),
});

const StdioServerSchema = BaseServerSchema.extend({
	args: z.array(z.string()).default([]),
	command: z.string().min(1),
	cwd: z.string().optional(),
	env: z.record(z.string(), z.string()).default({}),
	transport: z.literal("stdio"),
});

const HttpServerSchema = BaseServerSchema.extend({
	transport: z.literal("http"),
	url: z.url(),
});

const BackendServerSchema = z.discriminatedUnion("transport", [
	StdioServerSchema,
	HttpServerSchema,
]);

const MikotoConfigSchema = z.object({
	bridge: z
		.object({
			id: z.string().min(1).optional(),
		})
		.default({}),
	relay: z.object({
		url: z.string().min(1),
	}),
	servers: z.array(BackendServerSchema).default([]),
});

type ToolAlias = z.infer<typeof ToolAliasSchema>;
type BackendServer = z.infer<typeof BackendServerSchema>;
type MikotoConfig = z.infer<typeof MikotoConfigSchema>;

export {
	type BackendServer,
	BackendServerSchema,
	HttpServerSchema,
	type MikotoConfig,
	MikotoConfigSchema,
	StdioServerSchema,
	type ToolAlias,
	ToolAliasSchema,
};
