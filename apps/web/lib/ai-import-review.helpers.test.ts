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

  it("hồ sơ JP: chưa chọn kỹ năng thì chưa lưu được", () => {
    expect(
      importDisabledReason({
        remainingUnreviewed: 0,
        moduleId: "ch-1",
        validCount: 4,
        isPending: false,
        skillsMissing: true,
      }),
    ).toBe("Chọn kỹ năng trước khi lưu");
  });
});

describe("formatQuestionErrors", () => {
  it("prefixes the question number", () => {
    expect(formatQuestionErrors(4, ["content là bắt buộc"])).toBe(
      "Câu 5: content là bắt buộc",
    );
  });
});

describe("validateAiJson — hồ sơ IT (Đúng/Sai, không tự luận)", () => {
  const IT_TYPES = [
    QuestionTypeDto.single_choice,
    QuestionTypeDto.true_false_group,
  ];
  const tf = (overrides: Record<string, unknown> = {}) => ({
    type: "true_false_group",
    content: "Cho đoạn chương trình Python…",
    options: ["a", "b", "c", "d"],
    tfAnswerKey: [true, false, true, false],
    difficulty: "Thông hiểu",
    ...overrides,
  });

  it("nhận câu Đúng/Sai hợp lệ", () => {
    const { items } = validateAiJson(JSON.stringify([tf()]), DIFFS, IT_TYPES);
    expect(items[0]._valid).toBe(true);
    expect(items[0].type).toBe(QuestionTypeDto.true_false_group);
    expect(items[0].tfAnswerKey).toEqual([true, false, true, false]);
  });

  it("báo lỗi khi thiếu nhận định hoặc đáp án", () => {
    const { items } = validateAiJson(
      JSON.stringify([tf({ options: ["a", "b"], tfAnswerKey: [true] })]),
      DIFFS,
      IT_TYPES,
    );
    expect(items[0]._valid).toBe(false);
    expect(items[0]._errors.join(" ")).toContain("4 nhận định");
    expect(items[0]._errors.join(" ")).toContain("tfAnswerKey");
  });

  it("từ chối tự luận ở hồ sơ IT", () => {
    const essay = { type: "essay", content: "Viết…", difficulty: "Nhận biết" };
    const { items } = validateAiJson(JSON.stringify([essay]), DIFFS, IT_TYPES);
    expect(items[0]._valid).toBe(false);
    expect(items[0]._errors[0]).toContain('"single_choice" hoặc "true_false_group"');
  });

  it("trắc nghiệm không được kèm tfAnswerKey", () => {
    const { items } = validateAiJson(
      JSON.stringify([validChoice({ tfAnswerKey: [true, true, true, true] })]),
      DIFFS,
      IT_TYPES,
    );
    expect(items[0]._valid).toBe(false);
  });
});

describe("validateAiJson — loại câu JP", () => {
  const JP_TYPES = [
    QuestionTypeDto.single_choice,
    QuestionTypeDto.essay,
    QuestionTypeDto.true_false,
    QuestionTypeDto.fill_blank,
    QuestionTypeDto.ordering,
  ];
  const one = (record: Record<string, unknown>) =>
    validateAiJson(JSON.stringify([{ difficulty: "Nhận biết", ...record }]), DIFFS, JP_TYPES)
      .items[0]!;

  it("accepts a true_false statement with one key and a label style", () => {
    const item = one({
      type: "true_false",
      content: "日本の首都は東京です。",
      tfAnswerKey: [true],
      tfLabelStyle: "dung_sai",
    });
    expect(item._errors).toEqual([]);
    expect(item.tfAnswerKey).toEqual([true]);
    expect(item.tfLabelStyle).toBe("dung_sai");
  });

  it("rejects a true_false with options or a 4-item key", () => {
    const item = one({
      type: "true_false",
      content: "東京は大きい。",
      options: ["a", "b"],
      tfAnswerKey: [true, false, true, false],
    });
    expect(item._valid).toBe(false);
    expect(item._errors).toContain("true_false không được có options");
    expect(item._errors).toContain("tfAnswerKey phải là mảng 1 giá trị true/false");
  });

  it("rejects an unknown tfLabelStyle and tfLabelStyle outside true_false", () => {
    expect(
      one({ type: "true_false", content: "x", tfAnswerKey: [false], tfLabelStyle: "yes_no" })
        ._errors,
    ).toContain('tfLabelStyle phải là "maru_batsu", "dung_sai" hoặc "true_false"');
    expect(
      one({ type: "essay", content: "x", tfLabelStyle: "dung_sai" })._errors,
    ).toContain("Chỉ câu true_false mới có tfLabelStyle");
  });

  it("accepts a fill_blank whose blanks match blankAnswerKey", () => {
    const item = one({
      type: "fill_blank",
      content: "[[___]]に起きて、[[___]]に寝ます。",
      blankAnswerKey: [["七時", "7時"], ["十一時"]],
    });
    expect(item._errors).toEqual([]);
    expect(item.blankAnswerKey).toEqual([["七時", "7時"], ["十一時"]]);
  });

  it("rejects a fill_blank whose blank count differs from blankAnswerKey", () => {
    const item = one({
      type: "fill_blank",
      content: "[[___]]に起きます。",
      blankAnswerKey: [["七時"], ["八時"]],
    });
    expect(item._errors).toContain(
      "blankAnswerKey có 2 ô nhưng content có 1 ô [[___]]",
    );
  });

  it("rejects a fill_blank without any blank or with an empty answer", () => {
    expect(
      one({ type: "fill_blank", content: "ありません。", blankAnswerKey: [] })._errors,
    ).toContain("fill_blank cần ít nhất một ô [[___]] trong content");
    expect(
      one({ type: "fill_blank", content: "[[___]]です。", blankAnswerKey: [["", " "]] })
        ._errors,
    ).toContain("blankAnswerKey[0]: cần 1–10 đáp án không rỗng");
  });

  it("accepts ordering cards in the correct order and rejects correctIndex", () => {
    const ok = one({
      type: "ordering",
      content: "正しい順に並べてください。",
      options: ["わたしは", "毎朝", "コーヒーを", "飲みます"],
    });
    expect(ok._errors).toEqual([]);
    const bad = one({
      type: "ordering",
      content: "並べてください。",
      options: ["a"],
      correctIndex: 0,
    });
    expect(bad._errors).toContain("options: cần 2–12 thẻ cho ordering");
    expect(bad._errors).toContain("ordering không được có correctIndex");
  });

  it("accepts essayInputSize only on essay", () => {
    expect(one({ type: "essay", content: "名前は？", essayInputSize: "short" })._errors).toEqual(
      [],
    );
    expect(
      one({ type: "essay", content: "名前は？", essayInputSize: "tiny" })._errors,
    ).toContain('essayInputSize phải là "short" hoặc "long"');
    expect(
      one({ ...validChoice(), essayInputSize: "short" })._errors,
    ).toContain("Chỉ câu essay mới có essayInputSize");
  });

  it("keeps type-specific fields through revalidation", () => {
    const item = one({
      type: "fill_blank",
      content: "[[___]]です。",
      blankAnswerKey: [["猫"]],
    });
    const next = revalidateAiQuestion(
      { ...item, difficultyLevelId: "lvl-1", blankAnswerKey: [["猫", "ねこ"]] },
      DIFFS,
      JP_TYPES,
    );
    expect(next._errors).toEqual([]);
    expect(next.blankAnswerKey).toEqual([["猫", "ねこ"]]);
  });
});
