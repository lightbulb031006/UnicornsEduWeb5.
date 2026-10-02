import { describe, expect, it } from "vitest";
import type { AttemptQuestionDto } from "@/dtos/attempt.dto";
import {
  answersSignature,
  formatSavedAt,
  getAttemptQuestionVisualStatus,
  isAttemptQuestionUnanswered,
  unansweredQuestionNumbers,
} from "./attempt-autosave.helpers";

function q(
  partial: Partial<AttemptQuestionDto> & Pick<AttemptQuestionDto, "type">,
): AttemptQuestionDto {
  return {
    questionId: partial.questionId ?? "q1",
    order: partial.order ?? 1,
    pointsPossible: partial.pointsPossible ?? 1,
    type: partial.type,
    content: partial.content ?? "?",
    options: partial.options ?? null,
    choiceIndex: partial.choiceIndex ?? null,
    essayAnswer: partial.essayAnswer ?? null,
    markedForReview: partial.markedForReview ?? false,
  };
}

describe("isAttemptQuestionUnanswered", () => {
  it("treats choiceIndex 0 as answered", () => {
    expect(
      isAttemptQuestionUnanswered(q({ type: "single_choice", choiceIndex: 0 })),
    ).toBe(false);
  });

  it("treats null choice as unanswered", () => {
    expect(
      isAttemptQuestionUnanswered(q({ type: "single_choice", choiceIndex: null })),
    ).toBe(true);
  });

  it("treats whitespace-only essay as unanswered", () => {
    expect(
      isAttemptQuestionUnanswered(q({ type: "essay", essayAnswer: "   " })),
    ).toBe(true);
  });

  it("treats non-empty essay as answered", () => {
    expect(
      isAttemptQuestionUnanswered(q({ type: "essay", essayAnswer: "ok" })),
    ).toBe(false);
  });
});

describe("unansweredQuestionNumbers", () => {
  it("returns 1-based numbers for unanswered items", () => {
    const questions = [
      q({ questionId: "a", type: "single_choice", choiceIndex: 1 }),
      q({ questionId: "b", type: "essay", essayAnswer: "" }),
      q({ questionId: "c", type: "single_choice", choiceIndex: 0 }),
    ];
    expect(unansweredQuestionNumbers(questions)).toEqual([2]);
  });
});

describe("answersSignature", () => {
  it("changes when a choice is selected", () => {
    const before = [q({ type: "single_choice", choiceIndex: null })];
    const after = [q({ type: "single_choice", choiceIndex: 0 })];
    expect(answersSignature(before)).not.toBe(answersSignature(after));
  });

  it("changes when markedForReview toggles", () => {
    const before = [q({ type: "single_choice", choiceIndex: 0, markedForReview: false })];
    const after = [q({ type: "single_choice", choiceIndex: 0, markedForReview: true })];
    expect(answersSignature(before)).not.toBe(answersSignature(after));
  });
});

describe("getAttemptQuestionVisualStatus", () => {
  it("prioritizes marked_for_review over answered", () => {
    expect(
      getAttemptQuestionVisualStatus(
        q({ type: "single_choice", choiceIndex: 0, markedForReview: true }),
      ),
    ).toBe("marked_for_review");
  });
});

describe("formatSavedAt", () => {
  it("pads hours and minutes", () => {
    expect(formatSavedAt(new Date(2026, 8, 7, 9, 5))).toBe("09:05");
  });
});
