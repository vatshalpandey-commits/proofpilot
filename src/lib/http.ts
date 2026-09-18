export class ResponseFormatError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly preview: string,
  ) {
    super(message);
    this.name = "ResponseFormatError";
  }
}

export async function readJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  if (!text.trim()) {
    throw new ResponseFormatError(
      `The server returned an empty response (${response.status}).`,
      response.status,
      "",
    );
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    const preview = text.replace(/\s+/g, " ").trim().slice(0, 160);
    throw new ResponseFormatError(
      response.status >= 500
        ? `The server could not finish the request (${response.status}). Please try again shortly or use a narrower question.`
        : `A service returned an unexpected non-JSON response (${response.status}).`,
      response.status,
      preview,
    );
  }
}
