import { describe, expect, it } from "vitest";

import { createResearchToolRegistry } from "./registry";

describe("recovery fault injection", () => {
  it("throws a labeled runtime tool failure through the real registry path", async () => {
    const registry = createResearchToolRegistry({ tavilyApiKey: "unused-in-first-fault", chaosMode: true });
    const result = await registry.execute("web_search", { query: "test recovery" }, 1_000);

    expect(result).toMatchObject({
      ok: false,
      code: "TOOL_ERROR",
      retryable: true,
    });
    expect(result.ok || result.error).toContain("FAULT_INJECTION");
  });
});
