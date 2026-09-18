import { describe, expect, it } from "vitest";

import { buildWorkingState } from "./context";
import type { AgentState } from "./types";

describe("compact model context", () => {
  it("keeps raw evidence in state but sends a bounded working context", () => {
    const raw = "x".repeat(12_000);
    const state: AgentState = {
      goal: "Investigate a claim",
      mission: { kind: "research" },
      maxSteps: 5,
      plan: ["Read evidence"],
      step: 4,
      observations: Array.from({ length: 5 }, (_, index) => ({ step: index + 1, tool: "read_webpage", input: { url: `https://example.com/${index}` }, result: { ok: true as const, data: { content: raw }, durationMs: 1 } })),
      evidence: Array.from({ length: 14 }, (_, index) => ({ id: `EV-${index + 1}`, title: "Source", url: "https://example.com", supportingText: raw, tool: "read_webpage", step: index + 1, eventId: `event-${index + 1}` })),
      trace: [{ id: "secret-trace", step: 1, type: "decision", title: "Decision", detail: raw, timestamp: new Date().toISOString() }],
      seenToolCalls: [],
    };
    const working = buildWorkingState(state);
    expect(state.observations[0].result.ok && JSON.stringify(state.observations[0].result.data).length).toBeGreaterThan(10_000);
    expect(working.recentObservations).toHaveLength(3);
    expect(working.relevantEvidence).toHaveLength(12);
    expect(JSON.stringify(working)).not.toContain("secret-trace");
    expect(JSON.stringify(working).length).toBeLessThan(12_000);
  });
});
