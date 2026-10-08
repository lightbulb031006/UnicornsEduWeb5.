"use client";

import StudentAttemptQuestion from "@/components/student/StudentAttemptQuestion";
import type { AttemptQuestionDto } from "@/dtos/attempt.dto";
import { QuestionTypeDto } from "@/dtos/question.dto";
import type { QuestionFormValue } from "@/components/admin/question/QuestionFormFields";

const NOOP = () => {};

/** HTML editor rỗng (`<p></p>`) nhưng vẫn giữ node công thức (phần tử rỗng có `data-latex`). */
function isBlankHtml(html: string): boolean {
  if (/data-latex=/i.test(html)) return false;
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() === "";
}

function optionalHtml(html: string): string | null {
  return isBlankHtml(html) ? null : html;
}

/**
 * Xem trước câu hỏi đúng như học sinh thấy sau khi nộp bài (đáp án đúng + giải thích),
 * dùng chính `StudentAttemptQuestion` để render LaTeX/HTML giống hệt phía học sinh.
 */
export default function QuestionPreview({ value }: { value: QuestionFormValue }) {
  if (isBlankHtml(value.content)) {
    return (
      <p className="rounded-xl border border-dashed border-border-default px-4 py-6 text-center text-sm text-text-muted">
        Nhập nội dung câu hỏi để xem trước.
      </p>
    );
  }

  const isChoice = value.type === QuestionTypeDto.single_choice;
  const question: AttemptQuestionDto = {
    questionId: "preview",
    order: 0,
    pointsPossible: 0,
    type: value.type,
    content: value.content,
    options: isChoice ? value.options : null,
    choiceIndex: null,
    essayAnswer: null,
    markedForReview: false,
    correctIndex: isChoice ? value.correctIndex : null,
    isCorrect: null,
    explanation: optionalHtml(value.explanation),
    answerGuide: optionalHtml(value.answerGuide),
  };

  return (
    <div className="space-y-2">
      <p className="text-xs text-text-muted">
        Hiển thị như học sinh thấy khi xem lại bài (kèm đáp án đúng và giải thích).
      </p>
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
