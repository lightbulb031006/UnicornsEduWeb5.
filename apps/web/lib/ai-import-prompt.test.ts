import { describe, expect, it } from "vitest";
import { QuestionTypeDto } from "@/dtos/question.dto";
import { buildAiImportPrompt } from "./ai-import-prompt";
import { validateAiJson } from "./ai-import-review.helpers";

const base = {
  courseName: "JP N5",
  topic: "Thời gian",
  questionCount: 10,
  difficultyNames: ["Dễ", "Khó"],
};
const JP_TYPES = [
  QuestionTypeDto.single_choice,
  QuestionTypeDto.essay,
  QuestionTypeDto.true_false,
  QuestionTypeDto.fill_blank,
  QuestionTypeDto.ordering,
];

/** Lấy khối ví dụ "ĐÚNG" trong prompt ra JSON. */
function exampleJson(prompt: string): string {
  const start = prompt.indexOf("[\n", prompt.indexOf("ĐÚNG — "));
  return prompt.slice(start, prompt.indexOf("\n]", start) + 2);
}

describe("buildAiImportPrompt", () => {
  it("describes every JP type and its extra fields", () => {
    const prompt = buildAiImportPrompt({
      ...base,
      allowedTypes: JP_TYPES,
      essayInputSizes: true,
    });
    for (const field of ["[[___]]", "blankAnswerKey", "tfLabelStyle", "essayInputSize", "ordering"]) {
      expect(prompt).toContain(field);
    }
    expect(prompt).not.toContain("true_false_group");
  });

  it("gives examples that pass the import validator", () => {
    const prompt = buildAiImportPrompt({
      ...base,
      allowedTypes: JP_TYPES,
      essayInputSizes: true,
    });
    const { items, parseError } = validateAiJson(
      exampleJson(prompt),
      base.difficultyNames,
      JP_TYPES,
    );
    expect(parseError).toBeNull();
    expect(items.map((i) => i.type)).toEqual(JP_TYPES);
    expect(items.flatMap((i) => i._errors)).toEqual([]);
  });

  it("leaves JP-only fields out for a profile without them", () => {
    const prompt = buildAiImportPrompt({
      ...base,
      allowedTypes: [QuestionTypeDto.single_choice, QuestionTypeDto.true_false_group],
    });
    expect(prompt).toContain("true_false_group");
    expect(prompt).not.toContain("blankAnswerKey");
    expect(prompt).not.toContain("essayInputSize");
  });
});
