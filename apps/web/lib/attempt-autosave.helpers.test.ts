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
    slot: partial.slot ?? "required",
    tfChoices: partial.tfChoices ?? null,
    blankCount: partial.blankCount ?? null,
    blankAnswers: partial.blankAnswers ?? null,
    orderAnswer: partial.orderAnswer ?? null,
  };
}

describe("câu Đúng/Sai + nhóm tự chọn", () => {
  it("chỉ tính đã làm khi đủ 4 nhận định", () => {
    expect(
      isAttemptQuestionUnanswered(
        q({ type: "true_false_group", tfChoices: [true, false, null, true] }),
      ),
    ).toBe(true);
    expect(
      isAttemptQuestionUnanswered(
        q({ type: "true_false_group", tfChoices: [true, false, false, true] }),
      ),
    ).toBe(false);
  });

  it("đã chọn Tự chọn 1 thì câu Tự chọn 2 không bị nhắc chưa làm", () => {
    const qs = [
      q({ questionId: "a", type: "true_false_group", slot: "elective_1", tfChoices: [true, true, true, true] }),
      q({ questionId: "b", type: "true_false_group", slot: "elective_1", tfChoices: [true, null, null, null] }),
      q({ questionId: "c", type: "true_false_group", slot: "elective_2" }),
    ];
    expect(unansweredQuestionNumbers(qs)).toEqual([2]);
  });
});

describe("Câu Đúng/Sai (một nhận định)", () => {
  it("chọn một lựa chọn là tính đã làm, kể cả chọn Sai", () => {
    expect(isAttemptQuestionUnanswered(q({ type: "true_false", tfChoices: [false] }))).toBe(false);
    expect(isAttemptQuestionUnanswered(q({ type: "true_false", tfChoices: [true, null, null, null] }))).toBe(false);
  });

  it("chưa chọn là chưa làm", () => {
    expect(isAttemptQuestionUnanswered(q({ type: "true_false", tfChoices: null }))).toBe(true);
    expect(isAttemptQuestionUnanswered(q({ type: "true_false", tfChoices: [null] }))).toBe(true);
  });
});

describe("Câu điền vào ô trống", () => {
  it("chỉ tính đã làm khi mọi ô đều có chữ", () => {
    const fb = (blankAnswers: (string | null)[] | null) =>
      q({ type: "fill_blank", blankCount: 2, blankAnswers });
    expect(isAttemptQuestionUnanswered(fb(["たべ", "のみ"]))).toBe(false);
    expect(isAttemptQuestionUnanswered(fb(["たべ", null]))).toBe(true);
    expect(isAttemptQuestionUnanswered(fb(["たべ", "　 "]))).toBe(true);
    expect(isAttemptQuestionUnanswered(fb(["たべ"]))).toBe(true);
    expect(isAttemptQuestionUnanswered(fb(null))).toBe(true);
  });

  it("chữ gõ vào ô làm đổi chữ ký tự lưu", () => {
    const a = q({ type: "fill_blank", blankCount: 1, blankAnswers: ["a"] });
    const b = q({ type: "fill_blank", blankCount: 1, blankAnswers: ["b"] });
    expect(answersSignature([a])).not.toBe(answersSignature([b]));
  });
});

describe("Câu sắp xếp", () => {
  const cards = ["本", "の", "机", "の"];
  const ord = (orderAnswer: string[] | null) =>
    q({ type: "ordering", options: cards, orderAnswer });

  it("chỉ tính đã làm khi đã dùng hết thẻ", () => {
    expect(isAttemptQuestionUnanswered(ord(["の", "本", "の", "机"]))).toBe(false);
    expect(isAttemptQuestionUnanswered(ord(["の", "本"]))).toBe(true);
    expect(isAttemptQuestionUnanswered(ord([]))).toBe(true);
    expect(isAttemptQuestionUnanswered(ord(null))).toBe(true);
  });

  it("đổi thứ tự thẻ làm đổi chữ ký tự lưu", () => {
    expect(answersSignature([ord(["の", "本", "の", "机"])])).not.toBe(
      answersSignature([ord(["本", "の", "の", "机"])]),
    );
  });
});

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
