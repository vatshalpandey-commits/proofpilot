import { z } from "zod";

import { GeminiModel, runAgent } from "@/agent";
import { runLangChainBaseline } from "@/comparison/langchain";
import { createResearchToolRegistry } from "@/tools/registry";

export const maxDuration = 60;

const schema = z.object({ question: z.string().trim().min(10).max(3_000) });

export async function POST(request: Request) {
  try {
    const { question } = schema.parse(await request.json());
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!geminiApiKey || !tavilyApiKey) return Response.json({ message: "Server API keys are not configured." }, { status: 503 });

    const proofStarted = Date.now();
    const proofpilot = await runAgent(question, new GeminiModel(geminiApiKey), createResearchToolRegistry({ tavilyApiKey }), { maxSteps: 2, toolTimeoutMs: 15_000, maxModelFailures: 0 });
    const proofDurationMs = Date.now() - proofStarted;
    const baseline = await runLangChainBaseline(question, geminiApiKey, createResearchToolRegistry({ tavilyApiKey }));

    return Response.json({
      configuration: { model: "gemini-3.6-flash", tools: ["web_search", "read_webpage", "calculator"], stepCap: 2, prompt: question },
      proofpilot: { durationMs: proofDurationMs, toolCalls: proofpilot.state.observations.length, events: proofpilot.state.trace.length, recoveries: proofpilot.state.observations.filter((item) => !item.result.ok).length, answer: proofpilot.answer },
      baseline,
    });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ message: "Enter a valid research question." }, { status: 400 });
    return Response.json({ message: error instanceof Error ? error.message : "Comparison failed." }, { status: 500 });
  }
}
