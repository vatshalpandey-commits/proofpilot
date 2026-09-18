import { z } from "zod";

import { GeminiModel, GroqModel, QuotaFallbackModel, RateLimitRetryModel, runAgent } from "@/agent";
import { createResearchToolRegistry } from "@/tools/registry";

export const maxDuration = 300;

const requestSchema = z.object({
  question: z.string().trim().min(10).max(3_000),
  claims: z.array(z.object({
    id: z.string().min(1).max(80),
    text: z.string().min(1).max(2_000),
  })).min(1).max(12),
  chaosMode: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  try {
    const input = requestSchema.parse(await request.json());
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;

    if (!geminiApiKey || !tavilyApiKey) {
      return Response.json(
        { error: "SERVER_NOT_CONFIGURED", message: "Gemini and Tavily API keys must be configured on the server." },
        { status: 503 },
      );
    }

    const primary = new GeminiModel(geminiApiKey);
    const model = groqApiKey
      ? new QuotaFallbackModel(primary, new RateLimitRetryModel(new GroqModel(groqApiKey)))
      : primary;
    const targetSummary = input.claims.map((claim) => `${claim.id}: ${claim.text}`).join("\n");
    const result = await runAgent(
      `Challenge the original answer to: ${input.question}\n\nTest these claims fairly and seek credible counter-evidence:\n${targetSummary}`,
      model,
      createResearchToolRegistry({ tavilyApiKey, chaosMode: input.chaosMode }),
      {
        maxSteps: 5,
        toolTimeoutMs: 10_000,
        modelTimeoutMs: 50_000,
        maxRunMs: 290_000,
        maxModelFailures: 1,
        mission: { kind: "challenge", originalQuestion: input.question, targets: input.claims },
      },
    );

    return Response.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: "INVALID_REQUEST", issues: error.issues }, { status: 400 });
    }
    console.error("Challenge run failed", error);
    return Response.json(
      { error: "CHALLENGE_RUN_FAILED", message: error instanceof Error ? error.message : "Unexpected challenge error" },
      { status: 500 },
    );
  }
}
