import { describe, expect, it } from "vitest";
import { QuestionTypeDto, type ValidatedAiQuestion } from "@/dtos/question.dto";
import {
  allQuestionsReviewed,
  formatQuestionErrors,
  importDisabledReason,
  remapReviewedAfterRemove,
  remainingReviewLabel,
  revalidateAiQuestion,
  summarizeInvalidQuestions,
  unreviewedCount,
  validateAiJson,
} from "./ai-import-review.helpers";

const DIFFS = ["Nhận biết", "Thông hiểu"];

function validChoice(overrides: Record<string, unknown> = {}) {
  return {
    type: "single_choice",
    content: "Đạo hàm của x^2?",
    options: ["2x", "x", "1", "0"],
    correctIndex: 0,
    difficulty: "Nhận biết",
    ...overrides,
  };
}

describe("validateAiJson", () => {
  it("rejects malformed JSON", () => {
    const result = validateAiJson("{", DIFFS);
    expect(result.items).toEqual([]);
    expect(result.parseError).toMatch(/JSON không hợp lệ/);
  });

  it("rejects a non-array payload", () => {
    const result = validateAiJson(JSON.stringify(validChoice()), DIFFS);
    expect(result.parseError).toMatch(/JSON array/);
  });

  it("names the field and keeps the item when a question is invalid", () => {
    const result = validateAiJson(
      JSON.stringify([
        validChoice(),
        { type: "essay", content: "Chứng minh", options: ["a", "b"], difficulty: "Nhận biết" },
      ]),
      DIFFS,
    );
    expect(result.parseError).toBeNull();
    expect(result.items[0]?._valid).toBe(true);
    expect(result.items[1]?._valid).toBe(false);
    expect(result.items[1]?._errors).toContain("essay không được có options");
    expect(summarizeInvalidQuestions(result.items)[0]).toMatch(/^Câu 2: essay không được có options/);
  });

  it("rejects unknown fields instead of ignoring them", () => {
    const result = validateAiJson(
      JSON.stringify([validChoice({ extra: true })]),
      DIFFS,
    );
    expect(result.items[0]?._valid).toBe(false);
    expect(result.items[0]?._errors[0]).toMatch(/Trường không cho phép: "extra"/);
  });
});

describe("revalidateAiQuestion", () => {
  it("marks an essay invalid when leftover options appear during review", () => {
    const current: ValidatedAiQuestion = {
      type: QuestionTypeDto.essay,
      content: "Chứng minh bất đẳng thức.",
      options: ["A", "B"],
      difficultyLevelId: "lvl-1",
      difficultyName: "Nhận biết",
      _valid: true,
      _errors: [],
    };
    const next = revalidateAiQuestion(current, DIFFS);
    expect(next._valid).toBe(false);
    expect(next._errors).toContain("essay không được có options");
  });

  it("keeps a clean essay valid", () => {
    const current: ValidatedAiQuestion = {
      type: QuestionTypeDto.essay,
      content: "Chứng minh bất đẳng thức.",
      answerGuide: "Xét đạo hàm.",
      difficultyLevelId: "lvl-1",
      difficultyName: "Nhận biết",
      _valid: false,
      _errors: ["essay không được có options"],
    };
    const next = revalidateAiQuestion(current, DIFFS);
    expect(next._valid).toBe(true);
    expect(next._errors).toEqual([]);
  });

  it("becomes valid after leftover options are cleared in review", () => {
    const leftover: ValidatedAiQuestion = {
      type: QuestionTypeDto.essay,
      content: "Chứng minh bất đẳng thức.",
      options: ["A", "B"],
      difficultyLevelId: "lvl-1",
      difficultyName: "Nhận biết",
      _valid: false,
      _errors: ["essay không được có options"],
    };
    const cleared = revalidateAiQuestion(
      { ...leftover, options: undefined },
      DIFFS,
    );
    expect(cleared._valid).toBe(true);
  });
});

describe("review gate helpers", () => {
  it("remaps reviewed indices after a question is removed", () => {
    const next = remapReviewedAfterRemove(new Set([0, 2, 3]), 1);
    expect([...next].sort()).toEqual([0, 1, 2]);
  });

  it("does not treat the list as fully reviewed until every index is viewed", () => {
    const reviewed = new Set([0, 2]);
    expect(unreviewedCount(3, reviewed)).toBe(1);
    expect(allQuestionsReviewed(3, reviewed)).toBe(false);
    expect(allQuestionsReviewed(3, new Set([0, 1, 2]))).toBe(true);
  });

  it("explains why save stays disabled", () => {
    expect(remainingReviewLabel(3)).toBe("Còn 3 câu chưa review");
    expect(
      importDisabledReason({
        remainingUnreviewed: 2,
        moduleId: "ch-1",
        validCount: 4,
        isPending: false,
      }),
    ).toBe("Còn 2 câu chưa review");
  });
});

describe("formatQuestionErrors", () => {
  it("prefixes the question number", () => {
    expect(formatQuestionErrors(4, ["content là bắt buộc"])).toBe(
      "Câu 5: content là bắt buộc",
    );
  });
});
