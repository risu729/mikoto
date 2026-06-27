import { z } from "zod";

export const ToolAliasSchema = z.object({
  name: z.string().min(1),
  target: z.string().min(1)
});

const BaseServerSchema = z.object({
  id: z.string().min(1),
  aliases: z.array(ToolAliasSchema).default([])
});

export const StdioServerSchema = BaseServerSchema.extend({
  transport: z.literal("stdio"),
  command: z.string().min(1),
  args: z.array(z.string()).default([]),
  cwd: z.string().optional(),
  env: z.record(z.string(), z.string()).default({})
});

export const HttpServerSchema = BaseServerSchema.extend({
  transport: z.literal("http"),
  url: z.url()
});

export const BackendServerSchema = z.discriminatedUnion("transport", [
  StdioServerSchema,
  HttpServerSchema
]);

export const MikotoConfigSchema = z.object({
  bridge: z
    .object({
      id: z.string().min(1).optional()
    })
    .default({}),
  relay: z.object({
    url: z.string().min(1)
  }),
  servers: z.array(BackendServerSchema).default([])
});

export type ToolAlias = z.infer<typeof ToolAliasSchema>;
export type BackendServer = z.infer<typeof BackendServerSchema>;
export type MikotoConfig = z.infer<typeof MikotoConfigSchema>;

