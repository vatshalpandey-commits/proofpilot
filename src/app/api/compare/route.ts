import { z } from "zod";

import { GeminiModel, GroqModel, RateLimitRetryModel, runAgent } from "@/agent";
import { runLangChainBaseline } from "@/comparison/langchain";
import { createResearchToolRegistry } from "@/tools/registry";

export const maxDuration = 300;

const schema = z.object({ question: z.string().trim().min(10).max(3_000) });

export async function POST(request: Request) {
  try {
    const { question } = schema.parse(await request.json());
    const geminiApiKey = process.env.GEMINI_API_KEY;
    const groqApiKey = process.env.GROQ_API_KEY;
    const tavilyApiKey = process.env.TAVILY_API_KEY;
    if (!geminiApiKey || !tavilyApiKey) return Response.json({ message: "Server API keys are not configured." }, { status: 503 });

    const modelName = groqApiKey ? "qwen/qwen3.8-27b" : "gemini-3.6-flash";
    const proofModel = groqApiKey
      ? new RateLimitRetryModel(new GroqModel(groqApiKey, modelName))
      : new GeminiModel(geminiApiKey);
    const baselineProvider = groqApiKey
      ? { type: "groq" as const, apiKey: groqApiKey, model: modelName }
      : { type: "gemini" as const, apiKey: geminiApiKey };

    const proofRun = (async () => {
      const started = Date.now();
      const result = await runAgent(question, proofModel, createResearchToolRegistry({ tavilyApiKey }), { maxSteps: 5, toolTimeoutMs: 10_000, modelTimeoutMs: 50_000, maxRunMs: 290_000, maxModelFailures: 0 });
      return { result, durationMs: Date.now() - started };
    })();
    const baselineRun = runLangChainBaseline(question, baselineProvider, createResearchToolRegistry({ tavilyApiKey }));
    const [{ result: proofpilot, durationMs: proofDurationMs }, baseline] = await Promise.all([proofRun, baselineRun]);

    return Response.json({
      configuration: { model: modelName, tools: ["web_search", "read_webpage", "calculator"], stepCap: 5, prompt: question },
      proofpilot: { durationMs: proofDurationMs, toolCalls: proofpilot.state.observations.length, events: proofpilot.state.trace.length, recoveries: proofpilot.state.observations.filter((item) => !item.result.ok).length, answer: proofpilot.answer, trace: proofpilot.state.trace },
      baseline,
      takeaways: [
        { label: "Inspectable execution", finding: `ProofPilot exposed ${proofpilot.state.trace.length} decision, tool, observation, and recovery events; the baseline exposed ${baseline.events.length} framework-level events.`, evidence: "Counted from the paired traces shown below." },
        { label: "Tool behavior", finding: `ProofPilot made ${proofpilot.state.observations.length} tool calls; LangChain made ${baseline.toolCalls}.`, evidence: "Both lanes received the same question, model family, tools, and bounded run instructions." },
        { label: "Run time", finding: `ProofPilot completed in ${(proofDurationMs / 1000).toFixed(1)}s; LangChain completed in ${(baseline.durationMs / 1000).toFixed(1)}s.`, evidence: "One paired run is descriptive evidence, not a universal framework ranking." },
      ],
    });
  } catch (error) {
    if (error instanceof z.ZodError) return Response.json({ message: "Enter a valid research question." }, { status: 400 });
    return Response.json({ message: error instanceof Error ? error.message : "Comparison failed." }, { status: 500 });
  }
}
