import { describe, expect, it } from "vitest";
import { z } from "zod";

import { runAgent } from "./loop";
import { ModelRequestError, QuotaFallbackModel, type AgentModel } from "./model";
import { ToolRegistry } from "./tool";

describe("custom agent loop", () => {
  it("executes a model-selected tool and returns a final answer", async () => {
    let turn = 0;
    const model: AgentModel = {
      async decide() {
        turn += 1;
        if (turn === 1) {
          return {
            action: "tool",
            plan: ["Calculate the result", "Answer the user"],
            rationale: "The question needs an exact calculation.",
            tool: "double",
            arguments: { value: 21 },
          };
        }
        return {
          action: "final",
          plan: ["Answer the user"],
          rationale: "The calculated result is available.",
          answer: "The result is 42.",
          claims: [],
        };
      },
    };
    const tools = new ToolRegistry().register({
      name: "double",
      description: "Doubles a number",
      parameters: { type: "object" },
      inputSchema: z.object({ value: z.number() }),
      async execute(input: { value: number }) {
        return input.value * 2;
      },
    });

    const result = await runAgent("What is twice 21?", model, tools);

    expect(result.status).toBe("completed");
    expect(result.answer).toBe("The result is 42.");
    expect(result.state.observations[0].result.ok).toBe(true);
  });

  it("turns a failed tool call into an observation the model can recover from", async () => {
    let turn = 0;
    const model: AgentModel = {
      async decide({ state }) {
        turn += 1;
        if (turn === 1) {
          return {
            action: "tool",
            plan: ["Try the unreliable source"],
            rationale: "Evidence is required.",
            tool: "unreliable",
            arguments: {},
          };
        }
        expect(state.recentObservations[0].outcome.ok).toBe(false);
        return {
          action: "final",
          plan: ["Explain the limitation"],
          rationale: "The failure is visible and another attempt would not help.",
          answer: "The source failed, so the limitation is reported honestly.",
          claims: [],
        };
      },
    };
    const tools = new ToolRegistry().register({
      name: "unreliable",
      description: "Always fails in this test",
      parameters: { type: "object" },
      inputSchema: z.object({}),
      async execute() {
        throw new Error("Simulated provider failure");
      },
    });

    const result = await runAgent("Investigate something", model, tools);

    expect(result.status).toBe("completed");
    expect(result.state.trace.some((event) => event.type === "recovery")).toBe(true);
  });

  it("records a visible recovery when the primary model reaches its quota", async () => {
    const primary: AgentModel = {
      async decide() {
        throw new ModelRequestError("Quota exceeded", true, 429, "gemini");
      },
    };
    const fallback: AgentModel = {
      async decide() {
        return {
          action: "final",
          plan: ["Answer with the available evidence"],
          rationale: "The fallback provider completed the decision.",
          answer: "Recovered successfully.",
          claims: [],
        };
      },
    };

    const result = await runAgent(
      "Explain the evidence clearly",
      new QuotaFallbackModel(primary, fallback),
      new ToolRegistry(),
      { maxSteps: 1 },
    );

    expect(result.status).toBe("completed");
    expect(result.answer).toBe("Recovered successfully.");
    expect(result.state.trace).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "recovery",
          title: "Provider quota recovered",
        }),
      ]),
    );
  });

  it("maps final claims only to evidence captured from real tool output", async () => {
    let turn = 0;
    const model: AgentModel = {
      async decide({ state }) {
        turn += 1;
        if (turn === 1) return { action: "tool", plan: ["Search", "Synthesize"], rationale: "Find evidence.", tool: "web_search", arguments: { query: "solar growth" } };
        expect(state.relevantEvidence[0].id).toBe("EV-001");
        return {
          action: "final",
          plan: ["Synthesize"],
          rationale: "The evidence supports a finding.",
          answer: "Solar capacity is growing.",
          claims: [
            { id: "CL-001", text: "Solar capacity is growing.", evidenceIds: ["EV-001"] },
            { id: "CL-002", text: "Unsupported claim.", evidenceIds: ["EV-999"] },
          ],
        };
      },
    };
    const tools = new ToolRegistry().register({
      name: "web_search",
      description: "Searches",
      parameters: { type: "object" },
      inputSchema: z.object({ query: z.string() }),
      async execute() {
        return { results: [{ title: "Energy report", url: "https://example.com/report", snippet: "Solar capacity grew by 20 percent." }] };
      },
    });

    const result = await runAgent("Research solar capacity growth", model, tools, { maxSteps: 2 });
    expect(result.report.claims).toEqual([{ id: "CL-001", text: "Solar capacity is growing.", evidenceIds: ["EV-001"] }]);
    expect(result.state.evidence[0]).toMatchObject({ url: "https://example.com/report", tool: "web_search" });
    expect(result.state.trace.some((event) => event.id === result.state.evidence[0].eventId)).toBe(true);
  });
});
