import { describe, expect, it } from "vitest";
import worker from "./index";

describe("relay worker scaffold", () => {
  it("serves health checks", async () => {
    const response = await worker.fetch(new Request("http://example.com/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});

