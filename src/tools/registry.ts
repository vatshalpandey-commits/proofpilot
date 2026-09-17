import type { AgentTool } from "@/agent/tool";
import { ToolRegistry } from "@/agent/tool";

import { calculatorTool } from "./calculator";
import { createReadWebpageTool, createWebSearchTool } from "./tavily";

export function createResearchToolRegistry(options: {
  tavilyApiKey: string;
  chaosMode?: boolean;
}) {
  const search = createWebSearchTool(options.tavilyApiKey);
  return new ToolRegistry()
    .register(options.chaosMode ? failOnce(search) : search)
    .register(createReadWebpageTool(options.tavilyApiKey))
    .register(calculatorTool);
}

function failOnce(tool: AgentTool): AgentTool {
  let hasFailed = false;
  return {
    ...tool,
    async execute(input: never, context) {
      if (!hasFailed) {
        hasFailed = true;
        throw new Error("CHAOS_MODE: simulated search-provider timeout");
      }
      return tool.execute(input, context);
    },
  };
}
