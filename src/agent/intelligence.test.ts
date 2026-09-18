import { describe, expect, it } from "vitest";

import { assessClaims } from "./intelligence";
import type { EvidenceRecord, ReportClaim } from "./types";

function evidence(id: string, url: string | null, tool = "web_search"): EvidenceRecord {
  return { id, url, tool, title: id, supportingText: `Stored material for ${id}`, step: 1, eventId: `event-${id}` };
}

function claim(overrides: Partial<ReportClaim> = {}): ReportClaim {
  return { id: "CL-001", text: "A testable claim", evidenceIds: ["EV-001"], contradictingEvidenceIds: [], ...overrides };
}

describe("claim evidence intelligence", () => {
  it("marks independently corroborated direct evidence as strong and explains why", () => {
    const [assessment] = assessClaims(
      [claim({ evidenceIds: ["EV-001", "EV-002"] })],
      [evidence("EV-001", "https://alpha.example/report", "read_webpage"), evidence("EV-002", "https://beta.example/study")],
    );

    expect(assessment).toMatchObject({ status: "supported", strength: "strong" });
    expect(assessment.explanation).toMatchObject({ independentSources: 2, directRecords: 1, conflictingRecords: 0 });
    expect(assessment.explanation.reasons.join(" ")).toContain("directly read webpage");
  });

  it("surfaces real contradicting records and reduces strength", () => {
    const [assessment] = assessClaims(
      [claim({ evidenceIds: ["EV-001", "EV-002"], contradictingEvidenceIds: ["EV-003"] })],
      [evidence("EV-001", "https://alpha.example/a", "read_webpage"), evidence("EV-002", "https://beta.example/b"), evidence("EV-003", "https://gamma.example/c")],
    );

    expect(assessment).toMatchObject({ status: "conflicting", strength: "limited", contradictingEvidenceIds: ["EV-003"] });
    expect(assessment.explanation.limitations).toContain("Conflicting evidence remains unresolved.");
  });

  it("does not count duplicate pages as independent corroboration", () => {
    const [assessment] = assessClaims(
      [claim({ evidenceIds: ["EV-001", "EV-002"] })],
      [evidence("EV-001", "https://same.example/a"), evidence("EV-002", "https://same.example/b")],
    );

    expect(assessment.strength).toBe("moderate");
    expect(assessment.explanation.independentSources).toBe(1);
  });
});
