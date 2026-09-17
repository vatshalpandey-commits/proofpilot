import { z } from "zod";

import { GeminiModel, runAgent } from "@/agent";
import { createResearchToolRegistry } from "@/tools/registry";

export const maxDuration = 60;

const requestSchema = z.object({
  question: z.string().trim().min(10).max(3_000),
  chaosMode: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const tavilyApiKey = process.env.TAVILY_API_KEY;

    if (!geminiApiKey || !tavilyApiKey) {
      return Response.json(
        {
          error: "SERVER_NOT_CONFIGURED",
          message: "Gemini and Tavily API keys must be configured on the server.",
        },
        { status: 503 },
      );
    }

    const result = await runAgent(
      input.question,
      new GeminiModel(geminiApiKey),
      createResearchToolRegistry({
        tavilyApiKey,
        chaosMode: input.chaosMode,
      }),
      { maxSteps: 8, toolTimeoutMs: 15_000, maxModelFailures: 2 },
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
