import { ModelRequestError, type AgentModel } from "./model";
import { buildWorkingState } from "./context";
import { captureEvidence, resolveClaims } from "./evidence";
import { assessClaims } from "./intelligence";
import type { AgentMission, AgentRunResult, AgentState, ChallengeOutcome, TraceEvent } from "./types";
import type { ToolRegistry } from "./tool";

export type AgentLoopOptions = {
  maxSteps?: number;
  toolTimeoutMs?: number;
  maxModelFailures?: number;
  mission?: AgentMission;
  modelTimeoutMs?: number;
  maxRunMs?: number;
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
  const modelTimeoutMs = options.modelTimeoutMs ?? 12_000;
  const maxRunMs = options.maxRunMs ?? 50_000;
  const responseBufferMs = 2_000;
  const startedAt = Date.now();
  let modelFailures = 0;

  const state: AgentState = {
    goal,
    mission: options.mission ?? { kind: "research" },
    maxSteps,
    plan: ["Understand the research goal"],
    step: 0,
    observations: [],
    evidence: [],
    trace: [],
    seenToolCalls: [],
  };

  while (state.step < maxSteps) {
    const remainingRunMs = maxRunMs - (Date.now() - startedAt);
    if (remainingRunMs <= responseBufferMs) {
      addTrace(state, "recovery", "Runtime budget reached", "The run stopped before the hosting deadline so it could return a valid recorded result.");
      return stoppedResult(state, "ProofPilot stopped safely when the runtime budget was reached. Try a narrower question or run it again shortly.");
    }
    state.step += 1;

    let decision;
    const modelCallTimeoutMs = Math.min(modelTimeoutMs, remainingRunMs - responseBufferMs);
    const deadlineLimited = modelCallTimeoutMs < modelTimeoutMs;
    try {
      decision = await withTimeout(
        model.decide({ state: buildWorkingState(state), tools: tools.definitions() }),
        modelCallTimeoutMs,
        deadlineLimited
          ? "The model did not answer before the remaining runtime budget expired"
          : `The model did not answer within ${modelTimeoutMs}ms`,
      );
      flushModelNotices(state, model);
      modelFailures = 0;
    } catch (error) {
      flushModelNotices(state, model);
      if (deadlineLimited && error instanceof AgentStepTimeoutError) {
        addTrace(state, "recovery", "Runtime budget reached", "The active decision was stopped so the recorded investigation could return before the hosting deadline.");
        return stoppedResult(state, "ProofPilot stopped safely when the runtime budget was reached. The recorded evidence and events remain available.");
      }
      if (error instanceof ModelRequestError && !error.retryable) {
        throw error;
      }
      modelFailures += 1;
      addTrace(state, "recovery", "Invalid model response", errorMessage(error));
      if (modelFailures > maxModelFailures) throw error;
      continue;
    }

    state.plan = decision.plan;
    addTrace(state, "decision", "Agent decision", decision.rationale, {
      action: decision.action,
      rationale: decision.rationale,
      plan: decision.plan,
      availableTools: tools.definitions().map((tool) => tool.name),
      ...(decision.action === "tool" ? { selectedTool: decision.tool, arguments: decision.arguments } : {}),
    });

    if (decision.action === "final") {
      addTrace(state, "final", "Research complete", "The agent produced its final report.");
      const claims = resolveClaims(decision.claims, state.evidence);
      const challenges = resolveChallenges(decision.challenges, state);
      return {
        answer: decision.answer,
        report: { answer: decision.answer, claims, assessments: assessClaims(claims, state.evidence) },
        ...(state.mission.kind === "challenge" ? { challenge: { outcomes: challenges } } : {}),
        state,
        status: "completed",
      };
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
    addTrace(state, "tool_started", `Calling ${decision.tool}`, JSON.stringify(decision.arguments), {
      tool: decision.tool,
      arguments: decision.arguments,
    });

    const remainingToolMs = maxRunMs - (Date.now() - startedAt) - responseBufferMs;
    if (remainingToolMs <= 0) {
      addTrace(state, "recovery", "Runtime budget reached", "The selected tool was not started because the run was too close to the hosting deadline.");
      return stoppedResult(state, "ProofPilot stopped safely when the runtime budget was reached. Try a narrower question or run it again shortly.");
    }

    const result = await tools.execute(
      decision.tool,
      decision.arguments,
      Math.min(toolTimeoutMs, remainingToolMs),
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

  return stoppedResult(state, "ProofPilot stopped safely before producing a final answer.");
}

function stoppedResult(state: AgentState, answer: string): AgentRunResult {
  return { answer, report: { answer, claims: [], assessments: [] }, state, status: "max_steps" };
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number, message: string) {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => reject(new AgentStepTimeoutError(message)), milliseconds);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

class AgentStepTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgentStepTimeoutError";
  }
}

function resolveChallenges(outcomes: ChallengeOutcome[], state: AgentState) {
  if (state.mission.kind !== "challenge") return [];
  const targets = new Set(state.mission.targets.map((target) => target.id));
  const evidence = new Set(state.evidence.map((record) => record.id));
  return outcomes
    .filter((outcome) => targets.has(outcome.targetClaimId))
    .map((outcome) => ({
      ...outcome,
      evidenceIds: [...new Set(outcome.evidenceIds)].filter((id) => evidence.has(id)),
    }));
}

function addTrace(
  state: AgentState,
  type: TraceEvent["type"],
  title: string,
  detail: string,
  payload?: Record<string, unknown>,
) {
  const event = {
    id: crypto.randomUUID(),
    step: state.step,
    type,
    title,
    detail,
    ...(payload ? { payload } : {}),
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
