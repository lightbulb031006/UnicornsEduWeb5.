"use client";

import StudentAttemptQuestion from "@/components/student/StudentAttemptQuestion";
import type { AttemptQuestionDto } from "@/dtos/attempt.dto";
import { QuestionTypeDto, countBlanks } from "@/dtos/question.dto";
import { openAudio } from "@/lib/attempt-audio";
import { resizeBlankKey } from "@/lib/fill-blank";
import { assertNever } from "@/lib/assert-never";
import type { QuestionFormValue } from "@/components/admin/question/QuestionFormFields";
import SharedMaterialPanel from "@/components/student/SharedMaterialPanel";

const NOOP = () => {};

/** HTML editor rỗng (`<p></p>`) nhưng vẫn giữ node công thức (phần tử rỗng có `data-latex`). */
function isBlankHtml(html: string): boolean {
  if (/data-latex=/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

function optionalHtml(html: string): string | null {
  return isBlankHtml(html) ? null : html;
}

type AnswerFields = Pick<
  AttemptQuestionDto,
  | "options"
  | "tfAnswerKey"
  | "tfLabelStyle"
  | "blankCount"
  | "blankAnswerKey"
  | "orderingKey"
  | "correctIndex"
>;

const NO_ANSWER_FIELDS: AnswerFields = {
  options: null,
  tfAnswerKey: undefined,
  tfLabelStyle: null,
  blankCount: null,
  blankAnswerKey: null,
  orderingKey: null,
  correctIndex: null,
};

/** Lựa chọn + đáp án của câu theo loại, như học sinh nhận khi xem lại. */
function previewAnswerFields(value: QuestionFormValue): Partial<AnswerFields> {
  switch (value.type) {
    case QuestionTypeDto.single_choice:
      return { options: value.options, correctIndex: value.correctIndex };
    case QuestionTypeDto.true_false_group:
      return { options: value.statements, tfAnswerKey: value.tfAnswerKey };
    case QuestionTypeDto.true_false:
      return {
        tfAnswerKey: value.tfAnswerKey.slice(0, 1),
        tfLabelStyle: value.tfLabelStyle,
      };
    case QuestionTypeDto.fill_blank: {
      const blankCount = countBlanks(value.content);
      return {
        blankCount,
        blankAnswerKey: resizeBlankKey(value.blankAnswerKey, blankCount).map(
          (answers) => answers.map((a) => a.trim()).filter(Boolean),
        ),
      };
    }
    case QuestionTypeDto.ordering:
      return { options: value.options, orderingKey: value.options };
    case QuestionTypeDto.essay:
      return {};
    default:
      return assertNever(value.type, "question type");
  }
}

/**
 * Xem trước câu hỏi đúng như học sinh thấy sau khi nộp bài (đáp án đúng + giải thích),
 * dùng chính `StudentAttemptQuestion` để render LaTeX/HTML giống hệt phía học sinh.
 */
export default function QuestionPreview({
  value,
  sharedMaterialContent,
  sharedMaterialAudioUrl,
  questionId,
}: {
  value: QuestionFormValue;
  /** Tư liệu dùng chung đang gắn (HTML) — hiện trên câu như học sinh thấy. */
  sharedMaterialContent?: string;
  sharedMaterialAudioUrl?: string | null;
  /** Id câu đang sửa — vị trí trống nối tới câu này hiện số 1 trong xem trước. */
  questionId?: string;
}) {
  if (isBlankHtml(value.content)) {
    return (
      <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-center text-sm text-text-muted">
        Nhập nội dung câu hỏi để xem trước.
      </p>
    );
  }

  const question: AttemptQuestionDto = {
    questionId: "preview",
    order: 0,
    pointsPossible: 0,
    type: value.type,
    slot: "required",
    content: value.content,
    ...NO_ANSWER_FIELDS,
    ...previewAnswerFields(value),
    choiceIndex: null,
    essayAnswer: null,
    tfChoices: null,
    blankAnswers: null,
    orderAnswer: null,
    markedForReview: false,
    audio: openAudio(value.audio?.url),
    isCorrect: null,
    explanation: optionalHtml(value.explanation),
    answerGuide: optionalHtml(value.answerGuide),
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        Hiển thị như học sinh thấy khi xem lại bài (kèm đáp án đúng và giải thích).
      </p>
      {sharedMaterialContent ? (
        <SharedMaterialPanel
          header={{
            content: sharedMaterialContent,
            audio: openAudio(sharedMaterialAudioUrl),
            firstNumber: 1,
            lastNumber: 1,
          }}
          gapNumbers={new Map(questionId ? [[questionId, 1]] : [])}
        />
      ) : null}
      <StudentAttemptQuestion
        question={question}
        index={0}
        disabled
        reveal
        hidePoints
        onChange={NOOP}
      />
    </div>
  );
}
