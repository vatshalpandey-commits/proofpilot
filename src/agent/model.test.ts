import { describe, expect, it } from "vitest";

import { runAgent } from "./loop";
import { ModelRequestError, RateLimitRetryModel, type AgentModel } from "./model";
import { ToolRegistry } from "./tool";

describe("Groq rate-limit recovery", () => {
  it("respects retry timing, retries the same step, and records recovery", async () => {
    let calls = 0;
    const delays: number[] = [];
    const provider: AgentModel = { async decide() {
      calls += 1;
      if (calls < 3) throw new ModelRequestError("slow down", true, 429, "groq", calls === 1 ? 1_250 : undefined);
      return { action: "final", plan: ["Finish"], rationale: "Recovered.", answer: "Done.", claims: [], challenges: [] };
    } };
    const model = new RateLimitRetryModel(provider, { maxRetries: 2, baseDelayMs: 500, sleep: async (ms) => { delays.push(ms); } });
    const result = await runAgent("Explain rate-limit recovery", model, new ToolRegistry(), { maxSteps: 1 });
    expect(calls).toBe(3);
    expect(delays).toEqual([1_250, 1_000]);
    expect(result.state.step).toBe(1);
    expect(result.state.trace.filter((event) => event.title === "Provider rate limit — retrying")).toHaveLength(2);
  });

  it("stops after the bounded retry budget is exhausted", async () => {
    let calls = 0;
    const provider: AgentModel = { async decide() { calls += 1; throw new ModelRequestError("still limited", true, 429, "groq", 1); } };
    const model = new RateLimitRetryModel(provider, { maxRetries: 2, sleep: async () => undefined });
    await expect(runAgent("Explain retry exhaustion", model, new ToolRegistry(), { maxSteps: 4 })).rejects.toMatchObject({ status: 429, retryable: false });
    expect(calls).toBe(3);
  });
});
