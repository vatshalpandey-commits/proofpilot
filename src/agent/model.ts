import { parseAgentDecision, type AgentDecision } from "./decision";
import type { AgentState } from "./types";
import type { ToolRegistry } from "./tool";

export type ModelInput = {
  state: AgentState;
  tools: ReturnType<ToolRegistry["definitions"]>;
};

export interface AgentModel {
  decide(input: ModelInput): Promise<AgentDecision>;
}

type GeminiResponse = {
  candidates?: Array<{
    content?: { parts?: Array<{ text?: string }> };
  }>;
  error?: { message?: string };
};

export class GeminiModel implements AgentModel {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.GEMINI_MODEL ?? "gemini-3.6-flash",
  ) {}

  async decide({ state, tools }: ModelInput): Promise<AgentDecision> {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": this.apiKey,
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: createPrompt(state, tools) }] }],
          generationConfig: {
            temperature: 0.2,
            responseMimeType: "application/json",
          },
        }),
      },
    );

    const body = (await response.json()) as GeminiResponse;
    if (!response.ok) {
      throw new Error(body.error?.message ?? `Gemini request failed (${response.status})`);
    }

    const text = body.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? "")
      .join("");

    if (!text) {
      throw new Error("Gemini returned no decision");
    }

    return parseAgentDecision(text);
  }
}

function createPrompt(
  state: AgentState,
  tools: ReturnType<ToolRegistry["definitions"]>,
) {
  return `You are the decision engine inside ProofPilot. The application, not you,
owns and executes the agent loop. Choose exactly one next action.

USER GOAL:
${state.goal}

AVAILABLE TOOLS:
${JSON.stringify(tools, null, 2)}

CURRENT STATE:
${JSON.stringify(
  {
    step: state.step,
    plan: state.plan,
    observations: state.observations,
  },
  null,
  2,
)}

Return JSON only. Never reveal private chain-of-thought. The rationale must be a
short, user-safe explanation of why the action is useful.

For a tool call:
{"action":"tool","plan":["step"],"rationale":"brief reason","tool":"tool_name","arguments":{}}

When the evidence is sufficient:
{"action":"final","plan":["step"],"rationale":"brief reason","answer":"cited final response"}`;
}
