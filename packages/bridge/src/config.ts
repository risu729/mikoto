import { readFile } from "node:fs/promises";
import { hostname, platform } from "node:os";

import { MikotoConfigSchema } from "@mikoto/protocol";
import { parse } from "smol-toml";

type MikotoConfig = import("@mikoto/protocol").MikotoConfig;
type ResolvedBridgeConfig = MikotoConfig & {
	bridge: {
		id: string;
	};
	os: string;
};

const loadBridgeConfig = async (path = "mikoto.toml"): Promise<ResolvedBridgeConfig> => {
	const raw = await readFile(path, "utf8");
	const parsed = parse(raw);
	const config = MikotoConfigSchema.parse(parsed);
	const relayUrl = process.env["MIKOTO_RELAY_URL"] ?? config.relay.url;
	const bridgeId = process.env["MIKOTO_BRIDGE_ID"] ?? config.bridge.id ?? hostname();

	return {
		...config,
		bridge: {
			id: bridgeId,
		},
		os: platform(),
		relay: {
			...config.relay,
			url: relayUrl,
		},
	};
};

export { loadBridgeConfig, type ResolvedBridgeConfig };
