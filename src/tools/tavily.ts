import { z } from "zod";

import type { AgentTool } from "../agent/tool";

const searchInputSchema = z.object({
  query: z.string().min(2).max(300),
  maxResults: z.number().int().min(1).max(5).optional().default(5),
});

const readInputSchema = z.object({
  url: z.string().url().max(2_000),
  query: z.string().min(2).max(300).optional(),
});

type TavilySearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    content?: string;
    score?: number;
    published_date?: string;
  }>;
  detail?: unknown;
};

type TavilyExtractResponse = {
  results?: Array<{ url?: string; raw_content?: string }>;
  failed_results?: Array<{ url?: string; error?: string }>;
  detail?: unknown;
};

export function createWebSearchTool(apiKey: string): AgentTool {
  return {
    name: "web_search",
    description:
      "Searches the live web and returns ranked sources with URLs and evidence snippets. Use for current facts or discovering sources.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Focused search query" },
        maxResults: { type: "number", minimum: 1, maximum: 5 },
      },
      required: ["query"],
      additionalProperties: false,
    },
    inputSchema: searchInputSchema,
    async execute(input: z.infer<typeof searchInputSchema>, { signal }) {
      const response = await tavilyRequest<TavilySearchResponse>(
        "/search",
        apiKey,
        {
          query: input.query,
          search_depth: "basic",
          max_results: input.maxResults,
          include_answer: false,
          include_raw_content: false,
        },
        signal,
      );

      return {
        query: input.query,
        results: (response.results ?? []).map((result) => ({
          title: result.title ?? "Untitled source",
          url: result.url ?? "",
          snippet: trimText(result.content ?? "", 1_200),
          score: result.score,
          publishedDate: result.published_date,
        })),
      };
    },
  };
}

export function createReadWebpageTool(apiKey: string): AgentTool {
  return {
    name: "read_webpage",
    description:
      "Reads one specific public webpage as clean text. Use after web_search when a source needs closer inspection.",
    parameters: {
      type: "object",
      properties: {
        url: { type: "string", format: "uri", description: "Public HTTP or HTTPS URL" },
        query: { type: "string", description: "Optional focus for extraction" },
      },
      required: ["url"],
      additionalProperties: false,
    },
    inputSchema: readInputSchema,
    async execute(input: z.infer<typeof readInputSchema>, { signal }) {
      assertPublicUrl(input.url);
      const response = await tavilyRequest<TavilyExtractResponse>(
        "/extract",
        apiKey,
        {
          urls: [input.url],
          extract_depth: "basic",
          format: "markdown",
          ...(input.query ? { query: input.query } : {}),
        },
        signal,
      );
      const result = response.results?.[0];
      if (!result?.raw_content) {
        const failure = response.failed_results?.[0]?.error;
        throw new Error(failure ?? "The page returned no readable content");
      }
      return {
        url: result.url ?? input.url,
        content: trimText(result.raw_content, 12_000),
        truncated: result.raw_content.length > 12_000,
      };
    },
  };
}

async function tavilyRequest<T>(
  path: string,
  apiKey: string,
  body: Record<string, unknown>,
  signal: AbortSignal,
) {
  const response = await fetch(`https://api.tavily.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await response.json()) as T & { detail?: unknown };
  if (!response.ok) {
    throw new Error(`Tavily request failed (${response.status}): ${formatDetail(data.detail)}`);
  }
  return data;
}

function assertPublicUrl(value: string) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error("Only HTTP(S) URLs are allowed");
  const host = url.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host.endsWith(".local") ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  ) {
    throw new Error("Private or local URLs are not allowed");
  }
}

function trimText(value: string, limit: number) {
  return value.length > limit ? `${value.slice(0, limit - 3)}...` : value;
}

function formatDetail(detail: unknown) {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "Unknown provider error";
}
