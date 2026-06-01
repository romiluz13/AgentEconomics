import { describe, expect, test } from "bun:test";
import { parseJudgeDecision } from "../src/judge/judge";

describe("judge parsing", () => {
  test("parses strict JSON decisions", () => {
    expect(parseJudgeDecision('{"correct": true, "reason": "same answer"}')).toBe(true);
    expect(parseJudgeDecision('{"correct": false, "reason": "wrong entity"}')).toBe(false);
  });

  test("falls back to text decisions", () => {
    expect(parseJudgeDecision("The candidate is correct.")).toBe(true);
    expect(parseJudgeDecision("The candidate is incorrect.")).toBe(false);
  });
});
