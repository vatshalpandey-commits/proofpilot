import { ModelRequestError, type AgentModel } from "./model";
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
    trace: [],
    seenToolCalls: [],
  };

  while (state.step < maxSteps) {
    state.step += 1;

    let decision;
    try {
      decision = await model.decide({ state, tools: tools.definitions() });
      for (const notice of model.drainNotices?.() ?? []) {
        addTrace(state, "recovery", notice.title, notice.detail);
      }
      modelFailures = 0;
    } catch (error) {
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
      return { answer: decision.answer, state, status: "completed" };
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
    addTrace(
      state,
      result.ok ? "observation" : "recovery",
      result.ok ? `${decision.tool} returned data` : `${decision.tool} failed`,
      result.ok ? summarize(result.data) : `${result.code}: ${result.error}`,
    );
  }

  addTrace(
    state,
    "recovery",
    "Safety limit reached",
    `The run stopped after ${maxSteps} steps to prevent an infinite loop.`,
  );

  return {
    answer: "ProofPilot stopped safely before producing a final answer.",
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
  state.trace.push({
    id: crypto.randomUUID(),
    step: state.step,
    type,
    title,
    detail,
    timestamp: new Date().toISOString(),
  });
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
