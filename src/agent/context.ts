import type { AgentState, ToolResult } from "./types";

export type WorkingState = ReturnType<typeof buildWorkingState>;

export function buildWorkingState(state: AgentState) {
  const recent = state.observations.slice(-2);
  const latest = recent.at(-1);
  return {
    goal: state.goal,
    mission: state.mission,
    maxSteps: state.maxSteps,
    step: state.step,
    plan: state.plan,
    recentObservations: recent.map((observation) => ({
      step: observation.step,
      tool: observation.tool,
      input: compactInput(observation.input),
      outcome: summarizeResult(observation.result, 450),
    })),
    relevantEvidence: state.evidence.slice(-8).map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      supportingText: clip(item.supportingText, 400),
      tool: item.tool,
      step: item.step,
    })),
    latestToolResult: latest ? {
      step: latest.step,
      tool: latest.tool,
      result: summarizeResult(latest.result, 600),
    } : null,
  };
}

function compactInput(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).map(([key, value]) => [key, typeof value === "string" ? clip(value, 300) : value]));
}

function summarizeResult(result: ToolResult, limit: number) {
  if (!result.ok) return { ok: false, code: result.code, error: clip(result.error, limit) };
  return { ok: true, summary: clip(typeof result.data === "string" ? result.data : JSON.stringify(result.data), limit) };
}

function clip(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}
