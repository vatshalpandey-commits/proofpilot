import { describe, expect, it } from "vitest";

import { parseAgentDecision } from "./decision";

describe("agent decision parsing", () => {
  it("accepts schema-valid JSON surrounded by a provider preamble", () => {
    const decision = parseAgentDecision('Decision follows:\n{"action":"final","plan":["Finish"],"rationale":"Evidence is sufficient.","answer":"Done.","claims":[],"challenges":[]}\nEnd.');

    expect(decision).toMatchObject({ action: "final", answer: "Done." });
  });
});
