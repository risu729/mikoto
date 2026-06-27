import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/{protocol,bridge,codex-mcp}/src/**/*.test.ts"]
  }
});

