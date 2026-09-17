import { describe, expect, it } from "vitest";

import { calculateExpression } from "./calculator";

describe("calculator tool", () => {
  it("respects precedence and parentheses", () => {
    expect(calculateExpression("(1250 * 12) / 5 + 2^3")).toBe(3008);
  });

  it("supports unary negative numbers", () => {
    expect(calculateExpression("-4 * (3 + 2)")).toBe(-20);
  });

  it("rejects code and division by zero", () => {
    expect(() => calculateExpression("process.exit()"))
      .toThrow("Expected a number");
    expect(() => calculateExpression("5 / 0")).toThrow("Division by zero");
  });
});
