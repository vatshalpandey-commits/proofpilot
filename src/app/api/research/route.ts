import { z } from "zod";

import { GeminiModel, GroqModel, QuotaFallbackModel, RateLimitRetryModel, runAgent } from "@/agent";
import { createResearchToolRegistry } from "@/tools/registry";

export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(10).max(3_000),
  chaosMode: z.boolean().optional().default(false),
  depth: z.enum(["quick", "standard", "deep"]).optional().default("standard"),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!geminiApiKey || !tavilyApiKey) {
      return Response.json(
        {
          error: "SERVER_NOT_CONFIGURED",
          message: "Gemini and Tavily API keys must be configured on the server.",
        },
        { status: 503 },
      );
    }

    const primaryModel = new GeminiModel(geminiApiKey);
    const model = groqApiKey
      ? new QuotaFallbackModel(primaryModel, new RateLimitRetryModel(new GroqModel(groqApiKey)))
      : primaryModel;

    const maxSteps = { quick: 3, standard: 5, deep: 7 }[input.depth];
    const result = await runAgent(
      input.question,
      model,
      createResearchToolRegistry({
        tavilyApiKey,
        chaosMode: input.chaosMode,
      }),
      { maxSteps, toolTimeoutMs: 10_000, modelTimeoutMs: 25_000, maxRunMs: 52_000, maxModelFailures: 1 },
    );

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "INVALID_REQUEST", issues: error.issues },
        { status: 400 },
      );
    }

    console.error("Research run failed", error);
    return Response.json(
      {
        error: "AGENT_RUN_FAILED",
        message: error instanceof Error ? error.message : "Unexpected agent error",
      },
      { status: 500 },
    );
  }
}
