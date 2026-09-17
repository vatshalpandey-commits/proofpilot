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

export type TraceEvent = {
  id: string;
  step: number;
  type: "decision" | "tool_started" | "observation" | "recovery" | "final";
  title: string;
  detail: string;
  timestamp: string;
};

export type AgentState = {
  goal: string;
  plan: string[];
  step: number;
  observations: Observation[];
  trace: TraceEvent[];
  seenToolCalls: string[];
};

export type AgentRunResult = {
  answer: string;
  state: AgentState;
  status: "completed" | "max_steps";
};
