import { parseAgentDecision, type AgentDecision } from "./decision";
import type { AgentState } from "./types";
import type { ToolRegistry } from "./tool";

export type ModelInput = {
  state: AgentState;
  tools: ReturnType<ToolRegistry["definitions"]>;
};

export interface AgentModel {
  decide(input: ModelInput): Promise<AgentDecision>;
  drainNotices?(): ModelNotice[];
}

export type ModelNotice = { title: string; detail: string };

export class ModelRequestError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly status?: number,
    readonly provider?: "gemini" | "groq",
  ) {
    super(message);
    this.name = "ModelRequestError";
  }
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
      throw new ModelRequestError(
        body.error?.message ?? `Gemini request failed (${response.status})`,
        response.status === 429 || response.status >= 500,
        response.status,
        "gemini",
      );
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

type GroqResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  error?: { message?: string };
};

export class GroqModel implements AgentModel {
  constructor(
    private readonly apiKey: string,
    private readonly model = process.env.GROQ_MODEL ?? "openai/gpt-oss-20b",
  ) {}

  async decide({ state, tools }: ModelInput): Promise<AgentDecision> {
    const prompt = createPrompt(state, tools);
    let result = await this.request(this.model, prompt);

    // Recover from a stale GROQ_MODEL environment override as well as provider
    // quota failures. Groq periodically moves models between access tiers.
    if (
      result.response.status === 400 &&
      this.model !== "openai/gpt-oss-20b" &&
      /model.*(does not exist|access)/i.test(result.body.error?.message ?? "")
    ) {
      result = await this.request("openai/gpt-oss-20b", prompt);
    }

    if (!result.response.ok) {
      throw new ModelRequestError(
        result.body.error?.message ?? `Groq request failed (${result.response.status})`,
        result.response.status === 429 || result.response.status >= 500,
        result.response.status,
        "groq",
      );
    }

    const text = result.body.choices?.[0]?.message?.content;
    if (!text) throw new Error("Groq returned no decision");
    return parseAgentDecision(text);
  }

  private async request(model: string, prompt: string) {
    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }],
      }),
    });

    const body = (await response.json()) as GroqResponse;
    return { response, body };
  }
}

export class QuotaFallbackModel implements AgentModel {
  private notices: ModelNotice[] = [];

  constructor(
    private readonly primary: AgentModel,
    private readonly fallback: AgentModel,
  ) {}

  async decide(input: ModelInput): Promise<AgentDecision> {
    try {
      return await this.primary.decide(input);
    } catch (error) {
      if (!(error instanceof ModelRequestError) || error.status !== 429) throw error;
      this.notices.push({
        title: "Provider quota recovered",
        detail: "Gemini reached its free-tier limit. ProofPilot continued this decision with Groq.",
      });
      return this.fallback.decide(input);
    }
  }

  drainNotices() {
    return this.notices.splice(0);
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

You have at most three decisions including the final answer. Gather only the
minimum evidence needed. Prefer the evidence snippets returned by web_search.
Call read_webpage only when a search snippet is not enough. Use a second tool
when it materially improves the answer, and make decision three a final answer.

Return JSON only. Never reveal private chain-of-thought. The rationale must be a
short, user-safe explanation of why the action is useful.

For a tool call:
{"action":"tool","plan":["step"],"rationale":"brief reason","tool":"tool_name","arguments":{}}

When the evidence is sufficient:
{"action":"final","plan":["step"],"rationale":"brief reason","answer":"cited final response"}`;
}
