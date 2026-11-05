import {
  type EssayInputSizeDto,
  QuestionSkillDto,
  QuestionTypeDto,
  type TrueFalseLabelStyleDto,
  DEFAULT_TRUE_FALSE_LABEL_STYLE,
  countBlanks,
  ORDERING_MAX_CARDS,
  ORDERING_MIN_CARDS,
} from "@/dtos/question.dto";
import { resizeBlankKey } from "@/lib/fill-blank";
import { assertNever } from "@/lib/assert-never";
import type { QuestionFormInitial } from "@/dtos/question.dto";
import type { QuestionFormValue } from "@/components/admin/question/QuestionFormFields";

export type QuestionFormPayload = {
  moduleId: string;
  difficultyLevelId: string;
  type: QuestionTypeDto;
  content: string;
  options?: string[];
  correctIndex?: number;
  tfAnswerKey?: boolean[];
  explanation?: string;
  answerGuide?: string;
  skills?: QuestionSkillDto[];
  essayInputSize?: EssayInputSizeDto;
  tfLabelStyle?: TrueFalseLabelStyleDto;
  blankAnswerKey?: string[][];
};

function isBlankHtml(html: string): boolean {
  if (/data-latex=|<img|<table|<pre/i.test(html)) return false;
  return (
    html
      .replace(/<[^>]*>/g, "")
      .replace(/&nbsp;/g, " ")
      .trim() === ""
  );
}

/**
 * Kiểm tra + chuyển giá trị form soạn câu thành payload API. Mỗi loại câu chỉ
 * gửi trường của loại đó (API từ chối trộn: trắc nghiệm có `tfAnswerKey`…).
 */
export function questionFormToPayload(
  form: QuestionFormValue,
  {
    requireSkills = false,
    essayInputSizes = false,
  }: {
    requireSkills?: boolean;
    essayInputSizes?: boolean;
  } = {},
): PayloadResult {
  if (!form.moduleId || !form.difficultyLevelId || isBlankHtml(form.content)) {
    return { error: "Điền chuyên đề, mức khó và nội dung câu hỏi" };
  }
  // Hồ sơ JP: bắt buộc ≥1 kỹ năng (câu cũ chưa có thì bị đòi lúc sửa).
  if (requireSkills && form.skills.length === 0) {
    return { error: "Chọn ít nhất một kỹ năng" };
  }
  const base = {
    moduleId: form.moduleId,
    difficultyLevelId: form.difficultyLevelId,
    type: form.type,
    content: form.content.trim(),
    explanation: isBlankHtml(form.explanation)
      ? undefined
      : form.explanation.trim(),
    ...(requireSkills && { skills: [...form.skills] }),
  };

  switch (form.type) {
    case QuestionTypeDto.single_choice:
      return singleChoicePayload(base, form);
    case QuestionTypeDto.true_false_group:
      return trueFalseGroupPayload(base, form);
    case QuestionTypeDto.true_false:
      // Một nhận định nằm ở `content`; đáp án là phần tử đầu của form.tfAnswerKey.
      return {
        payload: {
          ...base,
          tfAnswerKey: [form.tfAnswerKey[0] ?? true],
          tfLabelStyle: form.tfLabelStyle,
        },
      };
    case QuestionTypeDto.fill_blank:
      return fillBlankPayload(base, form);
    case QuestionTypeDto.ordering:
      return orderingPayload(base, form);
    case QuestionTypeDto.essay:
      return {
        payload: {
          ...base,
          answerGuide: isBlankHtml(form.answerGuide)
            ? undefined
            : form.answerGuide.trim(),
          ...(essayInputSizes && { essayInputSize: form.essayInputSize }),
        },
      };
    default:
      return assertNever(form.type, "question type");
  }
}

type PayloadBase = Pick<
  QuestionFormPayload,
  | "moduleId"
  | "difficultyLevelId"
  | "type"
  | "content"
  | "explanation"
  | "skills"
>;
type PayloadResult = { payload: QuestionFormPayload } | { error: string };

function singleChoicePayload(
  base: PayloadBase,
  form: QuestionFormValue,
): PayloadResult {
  const options = form.options.map((o) => o.trim());
  if (options.some((o) => !o)) {
    return { error: "Phương án không được để trống" };
  }
  if (options.length < 2 || options.length > 6) {
    return { error: "Trắc nghiệm cần 2–6 phương án" };
  }
  if (form.correctIndex < 0 || form.correctIndex >= options.length) {
    return { error: "Đáp án đúng không hợp lệ" };
  }
  return { payload: { ...base, options, correctIndex: form.correctIndex } };
}

function trueFalseGroupPayload(
  base: PayloadBase,
  form: QuestionFormValue,
): PayloadResult {
  if (form.statements.some(isBlankHtml)) {
    return { error: "Điền đủ 4 nhận định a–d" };
  }
  return {
    payload: {
      ...base,
      options: form.statements.map((s) => s.trim()),
      tfAnswerKey: [...form.tfAnswerKey],
    },
  };
}

function fillBlankPayload(
  base: PayloadBase,
  form: QuestionFormValue,
): PayloadResult {
  const count = countBlanks(form.content);
  if (count === 0) {
    return { error: "Chèn ít nhất một ô trống [[___]] vào đề" };
  }
  // Bỏ ô đáp án để trống; ô nào không còn đáp án thì báo.
  const blankAnswerKey = resizeBlankKey(form.blankAnswerKey, count).map(
    (answers) => answers.map((a) => a.trim()).filter(Boolean),
  );
  const missing = blankAnswerKey.findIndex((answers) => answers.length === 0);
  if (missing >= 0) {
    return { error: `Ô ${missing + 1} cần ít nhất một đáp án` };
  }
  return { payload: { ...base, blankAnswerKey } };
}

function orderingPayload(
  base: PayloadBase,
  form: QuestionFormValue,
): PayloadResult {
  // Giữ khoảng trắng trong thẻ (vd 「の 」) — chỉ chặn thẻ rỗng.
  const blank = form.options.findIndex((c) => !c.trim());
  if (blank >= 0) return { error: `Thẻ ${blank + 1} không được để trống` };
  if (
    form.options.length < ORDERING_MIN_CARDS ||
    form.options.length > ORDERING_MAX_CARDS
  ) {
    return {
      error: `Câu sắp xếp cần ${ORDERING_MIN_CARDS}–${ORDERING_MAX_CARDS} thẻ`,
    };
  }
  return { payload: { ...base, options: [...form.options] } };
}

/** Phần form phụ thuộc loại câu, dựng từ câu có sẵn (sửa) hoặc mặc định (tạo). */
export function questionToFormParts(
  question: Pick<
    QuestionFormInitial,
    | "type"
    | "options"
    | "correctIndex"
    | "tfAnswerKey"
    | "tfLabelStyle"
    | "blankAnswerKey"
  > | null,
): Pick<
  QuestionFormValue,
  | "options"
  | "correctIndex"
  | "statements"
  | "tfAnswerKey"
  | "tfLabelStyle"
  | "blankAnswerKey"
> {
  const isTf = question?.type === QuestionTypeDto.true_false_group;
  const isSingleTf = question?.type === QuestionTypeDto.true_false;
  const opts = question?.options ?? [];
  return {
    options: !isTf && opts.length ? opts : ["", "", "", ""],
    correctIndex: question?.correctIndex ?? 0,
    statements: isTf
      ? [0, 1, 2, 3].map((i) => opts[i] ?? "")
      : ["", "", "", ""],
    tfAnswerKey:
      isTf && question?.tfAnswerKey?.length === 4
        ? [...question.tfAnswerKey]
        : isSingleTf && typeof question?.tfAnswerKey?.[0] === "boolean"
          ? [question.tfAnswerKey[0], true, true, true]
          : [true, true, true, true],
    tfLabelStyle: question?.tfLabelStyle ?? DEFAULT_TRUE_FALSE_LABEL_STYLE,
    blankAnswerKey: question?.blankAnswerKey?.map((a) => [...a]) ?? [],
  };
}
