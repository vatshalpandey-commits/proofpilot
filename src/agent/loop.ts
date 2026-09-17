import { ModelRequestError, type AgentModel } from "./model";
import { buildWorkingState } from "./context";
import { captureEvidence, resolveClaims } from "./evidence";
import type { AgentRunResult, AgentState, TraceEvent } from "./types";
import type { ToolRegistry } from "./tool";

export type AgentLoopOptions = {
  maxSteps?: number;
  toolTimeoutMs?: number;
  maxModelFailures?: number;
};

export async function runAgent(
  goal: string,
  model: AgentModel,
  tools: ToolRegistry,
  options: AgentLoopOptions = {},
): Promise<AgentRunResult> {
  const maxSteps = options.maxSteps ?? 8;
  const toolTimeoutMs = options.toolTimeoutMs ?? 12_000;
  const maxModelFailures = options.maxModelFailures ?? 2;
  let modelFailures = 0;

  const state: AgentState = {
    goal,
    plan: ["Understand the research goal"],
    step: 0,
    observations: [],
    evidence: [],
    trace: [],
    seenToolCalls: [],
  };

  while (state.step < maxSteps) {
    state.step += 1;

    let decision;
    try {
      decision = await model.decide({ state: buildWorkingState(state), tools: tools.definitions() });
      flushModelNotices(state, model);
      modelFailures = 0;
    } catch (error) {
      flushModelNotices(state, model);
      if (error instanceof ModelRequestError && !error.retryable) {
        throw error;
      }
      modelFailures += 1;
      addTrace(state, "recovery", "Invalid model response", errorMessage(error));
      if (modelFailures > maxModelFailures) throw error;
      continue;
    }

    state.plan = decision.plan;
    addTrace(state, "decision", "Agent decision", decision.rationale);

    if (decision.action === "final") {
      addTrace(state, "final", "Research complete", "The agent produced its final report.");
      const claims = resolveClaims(decision.claims, state.evidence);
      return { answer: decision.answer, report: { answer: decision.answer, claims }, state, status: "completed" };
    }

    const signature = stableSignature(decision.tool, decision.arguments);
    if (state.seenToolCalls.includes(signature)) {
      const result = {
        ok: false as const,
        error: "The exact same tool call was already attempted. Choose a different action.",
        code: "DUPLICATE_CALL",
        retryable: true,
        durationMs: 0,
      };
      state.observations.push({
        step: state.step,
        tool: decision.tool,
        input: decision.arguments,
        result,
      });
      addTrace(state, "recovery", "Duplicate call blocked", result.error);
      continue;
    }

    state.seenToolCalls.push(signature);
    addTrace(state, "tool_started", `Calling ${decision.tool}`, JSON.stringify(decision.arguments));

    const result = await tools.execute(
      decision.tool,
      decision.arguments,
      toolTimeoutMs,
    );
    state.observations.push({
      step: state.step,
      tool: decision.tool,
      input: decision.arguments,
      result,
    });
    const observationEvent = addTrace(
      state,
      result.ok ? "observation" : "recovery",
      result.ok ? `${decision.tool} returned data` : `${decision.tool} failed`,
      result.ok ? summarize(result.data) : `${result.code}: ${result.error}`,
    );
    state.evidence.push(...captureEvidence(state.observations.at(-1)!, observationEvent.id, state.evidence.length));
  }

  addTrace(
    state,
    "recovery",
    "Safety limit reached",
    `The run stopped after ${maxSteps} steps to prevent an infinite loop.`,
  );

  return {
    answer: "ProofPilot stopped safely before producing a final answer.",
    report: { answer: "ProofPilot stopped safely before producing a final answer.", claims: [] },
    state,
    status: "max_steps",
  };
}

function addTrace(
  state: AgentState,
  type: TraceEvent["type"],
  title: string,
  detail: string,
) {
  const event = {
    id: crypto.randomUUID(),
    step: state.step,
    type,
    title,
    detail,
    timestamp: new Date().toISOString(),
  };
  state.trace.push(event);
  return event;
}

function flushModelNotices(state: AgentState, model: AgentModel) {
  for (const notice of model.drainNotices?.() ?? []) {
    addTrace(state, "recovery", notice.title, notice.detail);
  }
}

function stableSignature(tool: string, input: Record<string, unknown>) {
  return `${tool}:${JSON.stringify(
    Object.fromEntries(Object.entries(input).sort(([a], [b]) => a.localeCompare(b))),
  )}`;
}

function summarize(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 500 ? `${text.slice(0, 497)}...` : text;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected model error";
}
