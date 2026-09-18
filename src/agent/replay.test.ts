import { describe, expect, it } from "vitest";

import { replayVisibility } from "./replay";
import type { TraceEvent } from "./types";

const trace: TraceEvent[] = [
  { id: "decision-1", step: 1, type: "decision", title: "Decide", detail: "", timestamp: "2026-01-01T00:00:00Z" },
  { id: "tool-1", step: 1, type: "tool_started", title: "Search", detail: "", timestamp: "2026-01-01T00:00:01Z" },
  { id: "observation-1", step: 1, type: "observation", title: "Observed", detail: "", timestamp: "2026-01-01T00:00:02Z" },
  { id: "final-2", step: 2, type: "final", title: "Complete", detail: "", timestamp: "2026-01-01T00:00:03Z" },
];

describe("research replay projection", () => {
  it("does not reveal observations or evidence before their recorded event", () => {
    const before = replayVisibility(trace, 1);
    expect([...before.observedSteps]).toEqual([]);
    expect(before.visibleEventIds.has("observation-1")).toBe(false);
    expect(before.finalVisible).toBe(false);

    const after = replayVisibility(trace, 2);
    expect([...after.observedSteps]).toEqual([1]);
    expect(after.visibleEventIds.has("observation-1")).toBe(true);
  });

  it("reveals the report only when the final event is reached", () => {
    expect(replayVisibility(trace, 2).finalVisible).toBe(false);
    expect(replayVisibility(trace, 3).finalVisible).toBe(true);
  });
});
