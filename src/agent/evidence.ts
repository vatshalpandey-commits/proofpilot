import type { EvidenceRecord, Observation, ReportClaim } from "./types";

type SearchResult = { title?: unknown; url?: unknown; snippet?: unknown };

export function captureEvidence(
  observation: Observation,
  eventId: string,
  existingCount: number,
): EvidenceRecord[] {
  if (!observation.result.ok) return [];
  const data = observation.result.data;
  const records: Omit<EvidenceRecord, "id">[] = [];

  if (observation.tool === "web_search" && isRecord(data) && Array.isArray(data.results)) {
    for (const item of data.results as SearchResult[]) {
      const url = typeof item.url === "string" && item.url ? item.url : null;
      const supportingText = compactText(item.snippet, 1_200);
      if (!supportingText) continue;
      records.push({
        title: typeof item.title === "string" && item.title ? item.title : url ?? "Search result",
        url,
        supportingText,
        tool: observation.tool,
        step: observation.step,
        eventId,
      });
    }
  } else if (observation.tool === "read_webpage" && isRecord(data)) {
    const supportingText = compactText(data.content, 2_000);
    if (supportingText) {
      const url = typeof data.url === "string" && data.url ? data.url : null;
      records.push({ title: url ?? "Read webpage", url, supportingText, tool: observation.tool, step: observation.step, eventId });
    }
  } else if (observation.tool === "calculator") {
    records.push({ title: "Calculator result", url: null, supportingText: compactText(data, 500), tool: observation.tool, step: observation.step, eventId });
  }

  return records.map((record, index) => ({
    id: `EV-${String(existingCount + index + 1).padStart(3, "0")}`,
    ...record,
  }));
}

export function resolveClaims(
  claims: ReportClaim[],
  evidence: EvidenceRecord[],
): ReportClaim[] {
  const known = new Set(evidence.map((item) => item.id));
  return claims
    .map((claim) => ({ ...claim, evidenceIds: [...new Set(claim.evidenceIds)].filter((id) => known.has(id)) }))
    .filter((claim) => claim.evidenceIds.length > 0);
}

export function resolveEvidence(ids: string[], evidence: EvidenceRecord[]) {
  const wanted = new Set(ids);
  return evidence.filter((item) => wanted.has(item.id));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function compactText(value: unknown, limit: number) {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : JSON.stringify(value);
  return text.length > limit ? `${text.slice(0, limit - 3)}...` : text;
}
