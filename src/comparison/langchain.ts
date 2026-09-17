import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatOpenAI } from "@langchain/openai";
import { tool } from "@langchain/core/tools";
import { createAgent } from "langchain";

import type { ToolRegistry } from "@/agent/tool";

export type BaselineEvent = {
  sequence: number;
  type: "model" | "tool" | "final";
  title: string;
  detail: string;
};

export type BaselineResult = {
  answer: string;
  durationMs: number;
  modelCalls: number;
  toolCalls: number;
  events: BaselineEvent[];
};

export async function runLangChainBaseline(
  goal: string,
  provider: { type: "gemini"; apiKey: string } | { type: "groq"; apiKey: string; model: string },
  registry: ToolRegistry,
): Promise<BaselineResult> {
  const startedAt = Date.now();
  const tools = registry.all().map((registered) =>
    tool(
      async (input) => JSON.stringify(await registry.execute(registered.name, input as Record<string, unknown>, 15_000)),
      { name: registered.name, description: registered.description, schema: registered.inputSchema },
    ),
  );
  const model = provider.type === "groq"
    ? new ChatOpenAI({
        model: provider.model,
        apiKey: provider.apiKey,
        temperature: 0,
        configuration: { baseURL: "https://api.groq.com/openai/v1" },
      })
    : new ChatGoogleGenerativeAI({
        model: "gemini-3.6-flash",
        apiKey: provider.apiKey,
        temperature: 0,
      });
  const agent = createAgent({
    model,
    tools,
    systemPrompt: "You are the baseline research agent in a fair comparison. Use at most two tool calls, cite URLs returned by tools, expose uncertainty, then answer concisely.",
  });
  const output = await agent.invoke(
    { messages: [{ role: "user", content: goal }] },
    { recursionLimit: 7 },
  );
  const messages = output.messages as Array<{ _getType?: () => string; content?: unknown; tool_calls?: Array<{ name?: string; args?: unknown }> }>;
  const events: BaselineEvent[] = [];
  let modelCalls = 0;
  let toolCalls = 0;

  for (const message of messages) {
    const type = message._getType?.() ?? "message";
    if (type === "ai") {
      modelCalls += 1;
      for (const call of message.tool_calls ?? []) {
        toolCalls += 1;
        events.push({ sequence: events.length + 1, type: "tool", title: `Calling ${call.name ?? "tool"}`, detail: compact(call.args) });
      }
    } else if (type === "tool") {
      events.push({ sequence: events.length + 1, type: "model", title: "Tool observation returned", detail: compact(message.content) });
    }
  }
  const finalMessage = [...messages].reverse().find((message) => message._getType?.() === "ai");
  const answer = textContent(finalMessage?.content);
  events.push({ sequence: events.length + 1, type: "final", title: "Baseline complete", detail: answer.slice(0, 240) });
  return { answer, durationMs: Date.now() - startedAt, modelCalls, toolCalls, events };
}

function textContent(value: unknown) {
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map((part) => typeof part === "string" ? part : part && typeof part === "object" && "text" in part ? String(part.text) : "").join("\n");
  return value == null ? "" : JSON.stringify(value);
}

function compact(value: unknown) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 240 ? `${text.slice(0, 237)}...` : text;
}
