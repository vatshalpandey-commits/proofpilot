import type {
  ClaimEvidenceAssessment,
  EvidenceRecord,
  EvidenceStrength,
  ReportClaim,
} from "./types";

export function assessClaims(
  claims: ReportClaim[],
  evidence: EvidenceRecord[],
): ClaimEvidenceAssessment[] {
  const byId = new Map(evidence.map((record) => [record.id, record]));
  return claims.map((claim) => assessClaim(claim, byId));
}

function assessClaim(
  claim: ReportClaim,
  evidence: Map<string, EvidenceRecord>,
): ClaimEvidenceAssessment {
  const supporting = claim.evidenceIds.flatMap((id) => {
    const record = evidence.get(id);
    return record ? [record] : [];
  });
  const contradicting = (claim.contradictingEvidenceIds ?? []).flatMap((id) => {
    const record = evidence.get(id);
    return record ? [record] : [];
  });
  const sourceKeys = new Set(supporting.map(sourceKey));
  const directRecords = supporting.filter((record) => record.tool === "read_webpage").length;
  const status = supporting.length === 0
    ? "insufficient_evidence"
    : contradicting.length > 0
      ? "conflicting"
      : "supported";
  const strength = strengthFor({
    supportingRecords: supporting.length,
    independentSources: sourceKeys.size,
    directRecords,
    conflictingRecords: contradicting.length,
  });
  const reasons = [
    `${supporting.length} supporting evidence record${supporting.length === 1 ? "" : "s"} resolved to stored observations.`,
    `${sourceKeys.size} independent source origin${sourceKeys.size === 1 ? "" : "s"} represented.`,
  ];
  if (directRecords > 0) reasons.push(`${directRecords} record${directRecords === 1 ? "" : "s"} came from a directly read webpage.`);
  if (contradicting.length > 0) reasons.push(`${contradicting.length} stored record${contradicting.length === 1 ? "" : "s"} challenge this claim.`);

  const limitations: string[] = [];
  if (supporting.length === 0) limitations.push("No supporting evidence ID resolved to a stored observation.");
  if (sourceKeys.size < 2) limitations.push("The claim has not been corroborated across independent source origins.");
  if (directRecords === 0) limitations.push("Support is based on excerpts or derived output rather than a directly read page.");
  if (contradicting.length > 0) limitations.push("Conflicting evidence remains unresolved.");

  return {
    claimId: claim.id,
    status,
    strength,
    supportingEvidenceIds: supporting.map((record) => record.id),
    contradictingEvidenceIds: contradicting.map((record) => record.id),
    explanation: {
      supportingRecords: supporting.length,
      independentSources: sourceKeys.size,
      directRecords,
      conflictingRecords: contradicting.length,
      reasons,
      limitations,
    },
  };
}

function strengthFor(input: {
  supportingRecords: number;
  independentSources: number;
  directRecords: number;
  conflictingRecords: number;
}): EvidenceStrength {
  if (input.supportingRecords === 0 || input.conflictingRecords > 0) return "limited";
  if (input.independentSources >= 2 && (input.directRecords >= 1 || input.supportingRecords >= 3)) return "strong";
  return "moderate";
}

function sourceKey(record: EvidenceRecord) {
  if (!record.url) return `${record.tool}:${record.eventId}`;
  try {
    return new URL(record.url).hostname.replace(/^www\./, "");
  } catch {
    return record.url;
  }
}
