import type { ZodType } from "zod";

import type { ToolResult } from "./types";

export type ToolContext = {
  signal: AbortSignal;
};

export type AgentTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  inputSchema: ZodType;
  execute: (input: never, context: ToolContext) => Promise<unknown>;
};

export class ToolRegistry {
  private readonly tools = new Map<string, AgentTool>();

  register(tool: AgentTool) {
    if (this.tools.has(tool.name)) {
      throw new Error(`Tool already registered: ${tool.name}`);
    }
    this.tools.set(tool.name, tool);
    return this;
  }

  definitions() {
    return [...this.tools.values()].map(({ name, description, parameters }) => ({
      name,
      description,
      parameters,
    }));
  }

  all() {
    return [...this.tools.values()];
  }

  async execute(
    name: string,
    input: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<ToolResult> {
    const startedAt = Date.now();
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        ok: false,
        error: `Unknown tool: ${name}`,
        code: "UNKNOWN_TOOL",
        retryable: false,
        durationMs: Date.now() - startedAt,
      };
    }

    const parsed = tool.inputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues.map((issue) => issue.message).join("; "),
        code: "INVALID_ARGUMENTS",
        retryable: true,
        durationMs: Date.now() - startedAt,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const data = await tool.execute(parsed.data as never, {
        signal: controller.signal,
      });
      return { ok: true, data, durationMs: Date.now() - startedAt };
    } catch (error) {
      const timedOut = controller.signal.aborted;
      return {
        ok: false,
        error: timedOut
          ? `Tool exceeded the ${timeoutMs}ms timeout`
          : error instanceof Error
            ? error.message
            : "Tool returned an unexpected error",
        code: timedOut ? "TIMEOUT" : "TOOL_ERROR",
        retryable: true,
        durationMs: Date.now() - startedAt,
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
