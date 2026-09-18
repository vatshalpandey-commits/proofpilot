import { describe, expect, it } from "vitest";

import { readJsonResponse, ResponseFormatError } from "./http";

describe("safe HTTP response parsing", () => {
  it("parses valid JSON", async () => {
    await expect(readJsonResponse<{ ok: boolean }>(new Response('{"ok":true}'))).resolves.toEqual({ ok: true });
  });

  it("turns a plain-text server failure into a useful error", async () => {
    const error = await readJsonResponse(new Response("An error occurred while processing the request", { status: 500 })).catch(value => value);
    expect(error).toBeInstanceOf(ResponseFormatError);
    if (!(error instanceof ResponseFormatError)) throw new Error("Expected ResponseFormatError");
    expect(error.message).toContain("could not finish");
    expect(error.preview).toContain("An error occurred");
  });
});
