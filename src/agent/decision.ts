import { z } from "zod";

const sharedFields = {
  plan: z.array(z.string().min(1)).min(1).max(8),
  rationale: z.string().min(1).max(500),
};

export const agentDecisionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("tool"),
    ...sharedFields,
    tool: z.string().min(1),
    arguments: z.record(z.string(), z.unknown()),
  }),
  z.object({
    action: z.literal("final"),
    ...sharedFields,
    answer: z.string().min(1),
    claims: z.array(z.object({
      id: z.string().min(1).max(80),
      text: z.string().min(1),
      evidenceIds: z.array(z.string().min(1)).min(1),
      contradictingEvidenceIds: z.array(z.string().min(1)).default([]),
    })).default([]),
    challenges: z.array(z.object({
      targetClaimId: z.string().min(1).max(80),
      verdict: z.enum(["upheld", "weakened", "revised", "unresolved"]),
      explanation: z.string().min(1).max(1_000),
      evidenceIds: z.array(z.string().min(1)).default([]),
    })).default([]),
  }),
]);

export type AgentDecision = z.infer<typeof agentDecisionSchema>;

export function parseAgentDecision(value: unknown): AgentDecision {
  if (typeof value !== "string") {
    return agentDecisionSchema.parse(value);
  }

  const withoutFence = value
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "");

  try {
    return agentDecisionSchema.parse(JSON.parse(withoutFence));
  } catch (error) {
    const start = withoutFence.indexOf("{");
    const end = withoutFence.lastIndexOf("}");
    if (start < 0 || end <= start) throw error;
    return agentDecisionSchema.parse(JSON.parse(withoutFence.slice(start, end + 1)));
  }
}
