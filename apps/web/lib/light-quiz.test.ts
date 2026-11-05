import { describe, expect, it } from "vitest";
import { isLightQuizAnswerCorrect } from "./light-quiz";

type Answer = Parameters<typeof isLightQuizAnswerCorrect>[0];

const answer = (
  question: Partial<Answer["question"]> & Pick<Answer["question"], "type">,
  given: Partial<Omit<Answer, "question">> = {},
): Answer => ({
  choiceIndex: null,
  tfChoices: null,
  blankAnswers: null,
  orderAnswer: null,
  ...given,
  question: {
    options: null,
    correctIndex: null,
    tfAnswerKey: [],
    blankAnswerKey: null,
    ...question,
  },
});

describe("isLightQuizAnswerCorrect", () => {
  it("trắc nghiệm: đúng khi chọn đúng đáp án", () => {
    const q = { type: "single_choice" as const, correctIndex: 2 };
    expect(isLightQuizAnswerCorrect(answer(q, { choiceIndex: 2 }))).toBe(true);
    expect(isLightQuizAnswerCorrect(answer(q, { choiceIndex: 0 }))).toBe(false);
  });

  it("tự luận: không chấm đúng/sai", () => {
    expect(isLightQuizAnswerCorrect(answer({ type: "essay" }))).toBe(false);
  });

  it("Câu Đúng/Sai: so một lựa chọn", () => {
    const q = { type: "true_false" as const, tfAnswerKey: [false] };
    expect(isLightQuizAnswerCorrect(answer(q, { tfChoices: [false] }))).toBe(
      true,
    );
    expect(isLightQuizAnswerCorrect(answer(q, { tfChoices: [true] }))).toBe(
      false,
    );
  });

  it("nhóm Đúng/Sai: phải đúng mọi nhận định", () => {
    const q = { type: "true_false_group" as const, tfAnswerKey: [true, false] };
    expect(
      isLightQuizAnswerCorrect(answer(q, { tfChoices: [true, false] })),
    ).toBe(true);
    expect(
      isLightQuizAnswerCorrect(answer(q, { tfChoices: [true, true] })),
    ).toBe(false);
  });

  it("điền ô trống: chấp nhận toàn góc như API", () => {
    const q = { type: "fill_blank" as const, blankAnswerKey: [["3"], ["は"]] };
    expect(
      isLightQuizAnswerCorrect(answer(q, { blankAnswers: ["３", "は"] })),
    ).toBe(true);
    expect(
      isLightQuizAnswerCorrect(answer(q, { blankAnswers: ["3", null] })),
    ).toBe(false);
  });

  it("sắp xếp: khớp đúng thứ tự thẻ", () => {
    const q = { type: "ordering" as const, options: ["私", "は", "学生"] };
    expect(
      isLightQuizAnswerCorrect(
        answer(q, { orderAnswer: ["私", "は", "学生"] }),
      ),
    ).toBe(true);
    expect(
      isLightQuizAnswerCorrect(
        answer(q, { orderAnswer: ["は", "私", "学生"] }),
      ),
    ).toBe(false);
  });
});
