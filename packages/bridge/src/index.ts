import { loadBridgeConfig } from "./config";

type CliOptions = {
  configPath: string;
};

function parseArgs(argv: string[]): CliOptions {
  const configIndex = argv.indexOf("--config");
  return {
    configPath: configIndex >= 0 ? argv[configIndex + 1] ?? "mikoto.toml" : "mikoto.toml"
  };
}

export async function main(argv = process.argv.slice(2)): Promise<void> {
  const { configPath } = parseArgs(argv);
  const config = await loadBridgeConfig(configPath);
  const unsupportedHttp = config.servers.find((server) => server.transport === "http");

  if (unsupportedHttp) {
    throw new Error(`HTTP backend transport is not implemented yet: ${unsupportedHttp.id}`);
  }

  console.log("mikoto bridge scaffold");
  console.log(`bridge=${config.bridge.id} os=${config.os} relay=${config.relay.url}`);
  console.log(`configured_backends=${config.servers.length}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}

