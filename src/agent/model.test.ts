import { describe, expect, it } from "vitest";

import { runAgent } from "./loop";
import { createGroqRequestBody, createPrompt, ModelRequestError, RateLimitRetryModel, type AgentModel } from "./model";
import { ToolRegistry } from "./tool";

describe("Groq rate-limit recovery", () => {
  it("asks research synthesis for multiple genuine claim mappings", () => {
    const prompt = createPrompt({
      goal: "Compare two options",
      mission: { kind: "research" },
      maxSteps: 5,
      step: 4,
      plan: ["Synthesize"],
      recentObservations: [],
      relevantEvidence: [{ id: "EV-001", title: "Source", url: "https://example.com", supportingText: "Evidence", tool: "web_search", step: 1 }],
      latestToolResult: null,
    }, []);

    expect(prompt).toContain("map 3 to 5 distinct");
    expect(prompt).toMatch(/Fewer than 3 is\s+acceptable only/);
    expect(prompt).toContain('"id":"CL-003"');
  });

  it("disables Compound built-in tools so only ProofPilot owns the agent loop", () => {
    const body = createGroqRequestBody("groq/compound-mini", "choose one action");

    expect(body).toMatchObject({ compound_custom: { tools: { enabled_tools: [] } } });
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("max_completion_tokens");
  });

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

  it("caps a provider retry-after delay to the configured recovery budget", async () => {
    let calls = 0;
    const delays: number[] = [];
    const provider: AgentModel = { async decide() {
      calls += 1;
      if (calls === 1) throw new ModelRequestError("slow down", true, 429, "groq", 60_000);
      return { action: "final", plan: ["Finish"], rationale: "Recovered.", answer: "Done.", claims: [], challenges: [] };
    } };
    const model = new RateLimitRetryModel(provider, { maxRetries: 1, maxDelayMs: 2_000, sleep: async (ms) => { delays.push(ms); } });

    await model.decide({ state: { goal: "test", mission: { kind: "research" }, maxSteps: 1, step: 0, plan: [], recentObservations: [], relevantEvidence: [], latestToolResult: null }, tools: [] });

    expect(calls).toBe(2);
    expect(delays).toEqual([2_000]);
  });

  it("stops after the bounded retry budget is exhausted", async () => {
    let calls = 0;
    const provider: AgentModel = { async decide() { calls += 1; throw new ModelRequestError("still limited", true, 429, "groq", 1); } };
    const model = new RateLimitRetryModel(provider, { maxRetries: 2, sleep: async () => undefined });
    await expect(runAgent("Explain retry exhaustion", model, new ToolRegistry(), { maxSteps: 4 })).rejects.toMatchObject({ status: 429, retryable: false });
    expect(calls).toBe(3);
  });
});
