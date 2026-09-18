export type ToolResult =
  | { ok: true; data: unknown; durationMs: number }
  | {
      ok: false;
      error: string;
      code: string;
      retryable: boolean;
      durationMs: number;
    };

export type Observation = {
  step: number;
  tool: string;
  input: Record<string, unknown>;
  result: ToolResult;
};

export type EvidenceRecord = {
  id: string;
  title: string;
  url: string | null;
  supportingText: string;
  tool: string;
  step: number;
  eventId: string;
};

export type ReportClaim = {
  id: string;
  text: string;
  evidenceIds: string[];
  contradictingEvidenceIds?: string[];
};

export type EvidenceStrength = "limited" | "moderate" | "strong";

export type ClaimSupportStatus = "supported" | "conflicting" | "insufficient_evidence";

export type ClaimEvidenceAssessment = {
  claimId: string;
  status: ClaimSupportStatus;
  strength: EvidenceStrength;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  explanation: {
    supportingRecords: number;
    independentSources: number;
    directRecords: number;
    conflictingRecords: number;
    reasons: string[];
    limitations: string[];
  };
};

export type EvidenceReport = {
  answer: string;
  claims: ReportClaim[];
  assessments: ClaimEvidenceAssessment[];
};

export type ChallengeVerdict = "upheld" | "weakened" | "revised" | "unresolved";

export type ChallengeTarget = Pick<ReportClaim, "id" | "text">;

export type AgentMission =
  | { kind: "research" }
  | { kind: "challenge"; originalQuestion: string; targets: ChallengeTarget[] };

export type ChallengeOutcome = {
  targetClaimId: string;
  verdict: ChallengeVerdict;
  explanation: string;
  evidenceIds: string[];
};

export type ChallengeReport = {
  outcomes: ChallengeOutcome[];
};

export type TraceEvent = {
  id: string;
  step: number;
  type: "decision" | "tool_started" | "observation" | "recovery" | "final";
  title: string;
  detail: string;
  payload?: Record<string, unknown>;
  timestamp: string;
};

export type AgentState = {
  goal: string;
  mission: AgentMission;
  maxSteps: number;
  plan: string[];
  step: number;
  observations: Observation[];
  evidence: EvidenceRecord[];
  trace: TraceEvent[];
  seenToolCalls: string[];
};

export type AgentRunResult = {
  answer: string;
  report: EvidenceReport;
  challenge?: ChallengeReport;
  state: AgentState;
  status: "completed" | "max_steps";
};
