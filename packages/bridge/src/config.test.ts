import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { loadBridgeConfig } from "./config";

describe("loadBridgeConfig", () => {
  it("defaults bridge id to a non-empty host name", async () => {
    const dir = await mkdtemp(join(tmpdir(), "mikoto-bridge-"));
    const configPath = join(dir, "mikoto.toml");

    await writeFile(
      configPath,
      `
[relay]
url = "ws://localhost:8787/bridge"
`
    );

    const config = await loadBridgeConfig(configPath);
    expect(config.bridge.id.length).toBeGreaterThan(0);
  });
});

