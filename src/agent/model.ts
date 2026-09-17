import { parseAgentDecision, type AgentDecision } from "./decision";
import type { WorkingState } from "./context";
import type { ToolRegistry } from "./tool";

export type ModelInput = {
  state: WorkingState;
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
    readonly retryAfterMs?: number,
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
        retryAfter(response.headers),
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
    private readonly model = process.env.GROQ_MODEL ?? "qwen/qwen3.8-27b",
  ) {}

  async decide({ state, tools }: ModelInput): Promise<AgentDecision> {
    const prompt = createPrompt(state, tools);
    let result = await this.request(this.model, prompt);

    // Recover from stale model overrides and models that try to bypass our
    // custom loop by emitting a provider-native tool call.
    if (
      [400, 404].includes(result.response.status) &&
      this.model !== "qwen/qwen3.8-27b" &&
      /(model.*(does not exist|access)|tool choice is none)/i.test(
        result.body.error?.message ?? "",
      )
    ) {
      result = await this.request("qwen/qwen3.8-27b", prompt);
    }

    if (!result.response.ok) {
      throw new ModelRequestError(
        result.body.error?.message ?? `Groq request failed (${result.response.status})`,
        result.response.status === 429 || result.response.status >= 500,
        result.response.status,
        "groq",
        retryAfter(result.response.headers),
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

export type RateLimitRetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (milliseconds: number) => Promise<void>;
};

export class RateLimitRetryModel implements AgentModel {
  private notices: ModelNotice[] = [];
  private readonly maxRetries: number;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;

  constructor(private readonly model: AgentModel, options: RateLimitRetryOptions = {}) {
    this.maxRetries = options.maxRetries ?? 2;
    this.baseDelayMs = options.baseDelayMs ?? 500;
    this.maxDelayMs = options.maxDelayMs ?? 8_000;
    this.sleep = options.sleep ?? ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  }

  async decide(input: ModelInput): Promise<AgentDecision> {
    for (let attempt = 0; ; attempt += 1) {
      try {
        return await this.model.decide(input);
      } catch (error) {
        if (!(error instanceof ModelRequestError) || error.provider !== "groq" || error.status !== 429) throw error;
        if (attempt >= this.maxRetries) {
          this.notices.push({ title: "Rate-limit recovery exhausted", detail: `Groq remained rate limited after ${this.maxRetries} retries. The run stopped safely.` });
          throw new ModelRequestError(error.message, false, 429, "groq", error.retryAfterMs);
        }
        const fallbackDelay = Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt);
        const delay = error.retryAfterMs ?? fallbackDelay;
        this.notices.push({
          title: "Provider rate limit — retrying",
          detail: `Groq requested a temporary pause. Retrying the same agent step in ${delay}ms (${attempt + 1}/${this.maxRetries}).`,
        });
        await this.sleep(delay);
      }
    }
  }

  drainNotices() {
    return [...(this.model.drainNotices?.() ?? []), ...this.notices.splice(0)];
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
    return [...(this.primary.drainNotices?.() ?? []), ...(this.fallback.drainNotices?.() ?? []), ...this.notices.splice(0)];
  }
}

function createPrompt(
  state: WorkingState,
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
    recentObservations: state.recentObservations,
    relevantEvidence: state.relevantEvidence,
    latestToolResult: state.latestToolResult,
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
{"action":"final","plan":["step"],"rationale":"brief reason","answer":"readable cited report","claims":[{"id":"CL-001","text":"one independently understandable factual finding","evidenceIds":["EV-001"]}]}

Every factual final claim must cite one or more evidence IDs from RELEVANT
EVIDENCE. Never invent an evidence ID. Omit unsupported claims and state gaps in
the answer.`;
}

function retryAfter(headers: Headers) {
  const value = headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, Math.ceil(seconds * 1_000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : undefined;
}
