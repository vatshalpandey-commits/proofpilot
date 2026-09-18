import { z } from "zod";

import type { AgentTool } from "../agent/tool";

const inputSchema = z.object({
  expression: z
    .string()
    .min(1)
    .max(200)
    .describe("Arithmetic expression using numbers, parentheses, +, -, *, /, %, or ^"),
});

export const calculatorTool: AgentTool = {
  name: "calculator",
  description:
    "Evaluates an arithmetic expression exactly. Use it for numerical comparisons instead of estimating mentally.",
  parameters: {
    type: "object",
    properties: {
      expression: {
        type: "string",
        description: "Example: (1250 * 12) / 5",
      },
    },
    required: ["expression"],
    additionalProperties: false,
  },
  inputSchema,
  async execute(input: z.infer<typeof inputSchema>) {
    const value = calculateExpression(input.expression);
    return { expression: input.expression, value };
  },
};

export function calculateExpression(expression: string) {
  const parser = new ArithmeticParser(expression);
  const value = parser.parse();
  if (!Number.isFinite(value)) throw new Error("Calculation produced a non-finite result");
  return value;
}

class ArithmeticParser {
  private position = 0;

  constructor(private readonly source: string) {}

  parse() {
    const value = this.parseAdditive();
    this.skipWhitespace();
    if (this.position !== this.source.length) {
      throw new Error(`Unexpected character at position ${this.position + 1}`);
    }
    return value;
  }

  private parseAdditive(): number {
    let value = this.parseMultiplicative();
    while (true) {
      if (this.consume("+")) value += this.parseMultiplicative();
      else if (this.consume("-")) value -= this.parseMultiplicative();
      else return value;
    }
  }

  private parseMultiplicative(): number {
    let value = this.parsePower();
    while (true) {
      if (this.consume("*")) value *= this.parsePower();
      else if (this.consume("/")) {
        const divisor = this.parsePower();
        if (divisor === 0) throw new Error("Division by zero is not allowed");
        value /= divisor;
      } else if (this.consume("%")) {
        const divisor = this.parsePower();
        if (divisor === 0) throw new Error("Division by zero is not allowed");
        value %= divisor;
      } else return value;
    }
  }

  private parsePower(): number {
    const base = this.parseUnary();
    return this.consume("^") ? base ** this.parsePower() : base;
  }

  private parseUnary(): number {
    if (this.consume("+")) return this.parseUnary();
    if (this.consume("-")) return -this.parseUnary();
    return this.parsePrimary();
  }

  private parsePrimary(): number {
    if (this.consume("(")) {
      const value = this.parseAdditive();
      if (!this.consume(")")) throw new Error("Missing closing parenthesis");
      return value;
    }

    this.skipWhitespace();
    const start = this.position;
    while (/[0-9.]/.test(this.source[this.position] ?? "")) this.position += 1;
    const token = this.source.slice(start, this.position);
    if (!token || !/^(?:\d+\.?\d*|\.\d+)$/.test(token)) {
      throw new Error(`Expected a number at position ${start + 1}`);
    }
    return Number(token);
  }

  private consume(character: string) {
    this.skipWhitespace();
    if (this.source[this.position] !== character) return false;
    this.position += 1;
    return true;
  }

  private skipWhitespace() {
    while (/\s/.test(this.source[this.position] ?? "")) this.position += 1;
  }
}
