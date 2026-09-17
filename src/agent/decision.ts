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

  return agentDecisionSchema.parse(JSON.parse(withoutFence));
}
