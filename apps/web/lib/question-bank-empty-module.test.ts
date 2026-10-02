import { describe, expect, it } from "vitest";
import { resolveQuestionBankEmptyModuleCopy } from "@/lib/question-bank-empty-module";

describe("resolveQuestionBankEmptyModuleCopy", () => {
  it("points managers at the content tab", () => {
    const copy = resolveQuestionBankEmptyModuleCopy(true);
    expect(copy.actionLabel).toBe("Mở tab Nội dung");
    expect(copy.body).toMatch(/tab Nội dung/);
  });

  it("asks lesson-plan members to contact an assistant", () => {
    const copy = resolveQuestionBankEmptyModuleCopy(false);
    expect(copy.actionLabel).toBeNull();
    expect(copy.body).toMatch(/trợ lí/i);
  });
});
