import { hostname, platform } from "node:os";
import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";
import { MikotoConfigSchema, type MikotoConfig } from "@mikoto/protocol";

export type ResolvedBridgeConfig = MikotoConfig & {
  bridge: {
    id: string;
  };
  os: string;
};

export async function loadBridgeConfig(path = "mikoto.toml"): Promise<ResolvedBridgeConfig> {
  const raw = await readFile(path, "utf8");
  const parsed = parse(raw);
  const config = MikotoConfigSchema.parse(parsed);
  const relayUrl = process.env["MIKOTO_RELAY_URL"] ?? config.relay.url;
  const bridgeId = process.env["MIKOTO_BRIDGE_ID"] ?? config.bridge.id ?? hostname();

  return {
    ...config,
    bridge: {
      id: bridgeId
    },
    relay: {
      ...config.relay,
      url: relayUrl
    },
    os: platform()
  };
}
