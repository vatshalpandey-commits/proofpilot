import { describe, expect, it } from "vitest";

import { captureEvidence, resolveClaims, resolveEvidence } from "./evidence";

describe("evidence provenance", () => {
  const observation = { step: 2, tool: "web_search", input: { query: "clean energy" }, result: { ok: true as const, data: { results: [{ title: "Official report", url: "https://example.com/energy", snippet: "Verified supporting material." }] }, durationMs: 5 } };

  it("resolves evidence IDs to their actual source and originating event", () => {
    const evidence = captureEvidence(observation, "event-42", 0);
    expect(resolveEvidence(["EV-001"], evidence)).toEqual([
      expect.objectContaining({ id: "EV-001", title: "Official report", url: "https://example.com/energy", supportingText: "Verified supporting material.", eventId: "event-42", tool: "web_search" }),
    ]);
  });

  it("drops invented claim mappings instead of fabricating provenance", () => {
    const evidence = captureEvidence(observation, "event-42", 0);
    const claims = resolveClaims([
      { id: "CL-1", text: "Supported", evidenceIds: ["EV-001"] },
      { id: "CL-2", text: "Invented", evidenceIds: ["EV-404"] },
    ], evidence);
    expect(claims).toEqual([{ id: "CL-1", text: "Supported", evidenceIds: ["EV-001"] }]);
  });
});
