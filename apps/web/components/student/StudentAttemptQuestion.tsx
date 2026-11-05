"use client";

import { Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import MathContent from "@/components/ui/MathContent";
import type {
  AttemptQuestionDto,
  AttemptScoringDto,
  BlankAnswers,
  TrueFalseChoices,
} from "@/dtos/attempt.dto";
import FillBlankInputs from "@/components/student/FillBlankInputs";
import OrderingCards from "@/components/student/OrderingCards";
import { numberBlanks } from "@/lib/fill-blank";
import { formatScoreValue } from "@/lib/attempt-score";
import TrueFalseStatements from "@/components/student/TrueFalseStatements";
import TrueFalseChoice from "@/components/student/TrueFalseChoice";
import { CONTENT_LIMITS, overLimitMessage } from "@/dtos/content-limits";
import EssayAnswerInput from "@/components/student/EssayAnswerInput";
import { assertNever } from "@/lib/assert-never";
import AttemptAudio from "@/components/student/AttemptAudio";

export default function StudentAttemptQuestion({
  question,
  index,
  number,
  scoring = "equal_100",
  disabled,
  reveal,
  hidePoints = false,
  onChange,
}: {
  question: AttemptQuestionDto;
  index: number;
  /** Số hiển thị "Câu n" (đề IT đánh số lại ở Phần II). Mặc định index + 1. */
  number?: number;
  scoring?: AttemptScoringDto;
  disabled: boolean;
  reveal: boolean;
  /** Xem trước khi soạn: điểm chỉ chốt lúc giao đề (100/N). */
  hidePoints?: boolean;
  onChange: (val: {
    choiceIndex?: number | null;
    essayAnswer?: string | null;
    tfChoices?: TrueFalseChoices | null;
    blankAnswers?: BlankAnswers | null;
    orderAnswer?: string[] | null;
    markedForReview?: boolean;
  }) => void;
}) {
  const isMcq = question.type === "single_choice";
  const isTrueFalse = question.type === "true_false_group";
  const isEssay = question.type === "essay";
  const options = question.options ?? [];
  const canMark = !disabled && !reveal;
  const marked = question.markedForReview ?? false;
  // Câu tự chọn học sinh không chạm vào (thường là nhóm không chọn): xem lại
  // không tô xanh/đỏ.
  const untouchedElective =
    isTrueFalse &&
    question.slot !== "required" &&
    !(question.tfChoices ?? []).some((c) => typeof c === "boolean");
  const graded = reveal && question.isCorrect != null && !untouchedElective;

  return (
    <div
      id={`attempt-q-${question.questionId}`}
      className={cn(
        "scroll-mt-28 rounded-2xl border p-4 sm:p-5",
        graded &&
          question.isCorrect === true &&
          "border-success/30 bg-success/5",
        graded && question.isCorrect === false && "border-error/30 bg-error/5",
        !graded && "border-border-default bg-bg-surface",
      )}
    >
      <div className="mb-3 flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-sm font-medium text-text-primary">
          <span className="mr-1 text-primary">Câu {number ?? index + 1}.</span>
          <MathContent
            content={
              question.type === "fill_blank"
                ? numberBlanks(question.content)
                : question.content
            }
            className="inline [&>p:first-child]:inline"
          />
          {hidePoints ? null : (
            <span className="ml-2 text-[11px] font-normal text-text-muted">
              {reveal && question.pointsAwarded != null
                ? `${formatScoreValue(question.pointsAwarded, scoring)}/`
                : ""}
              {formatScoreValue(question.pointsPossible, scoring)} điểm
              {reveal && isEssay && question.pointsAwarded == null
                ? " · chờ chấm"
                : ""}
            </span>
          )}
        </div>
        {canMark ? (
          <button
            type="button"
            onClick={() => onChange({ markedForReview: !marked })}
            aria-pressed={marked}
            aria-label={marked ? "Bỏ đánh dấu quay lại" : "Đánh dấu quay lại"}
            title={marked ? "Bỏ đánh dấu quay lại" : "Đánh dấu quay lại"}
            className={cn(
              "inline-flex size-10 shrink-0 items-center justify-center rounded-xl border transition-colors",
              marked
                ? "border-warning bg-warning/15 text-warning"
                : "border-border-default text-text-muted hover:border-warning/50 hover:text-warning",
            )}
          >
            <Bookmark className={cn("size-4", marked && "fill-current")} />
          </button>
        ) : marked ? (
          <span
            className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl border border-warning/40 bg-warning/10 text-warning"
            aria-label="Đã đánh dấu quay lại"
            title="Đánh dấu quay lại"
          >
            <Bookmark className="size-4 fill-current" />
          </span>
        ) : null}
      </div>
      {question.audio ? (
        <div className="mb-3">
          <AttemptAudio audio={question.audio} />
        </div>
      ) : null}

      <AnswerArea
        question={question}
        disabled={disabled}
        reveal={reveal}
        onChange={onChange}
      />
      {isEssay &&
        (question.essayAnswer?.length ?? 0) > CONTENT_LIMITS.essayAnswer && (
          <p className="mt-1 text-xs text-error">
            {overLimitMessage("Câu trả lời", CONTENT_LIMITS.essayAnswer)}
          </p>
        )}

      {reveal && isMcq && question.correctIndex != null && (
        <div className="mt-3 text-xs text-text-muted">
          Đáp án đúng:{" "}
          <span className="inline-flex flex-wrap items-baseline gap-1 font-medium text-success">
            <span>{String.fromCharCode(65 + question.correctIndex)}.</span>
            <MathContent
              content={options[question.correctIndex] ?? ""}
              className="inline text-xs text-success [&_.katex]:text-success"
            />
          </span>
        </div>
      )}
      {reveal && question.explanation && (
        <div className="mt-2 rounded-lg bg-bg-secondary/50 p-2.5">
          <span className="text-xs font-semibold text-text-muted">
            Giải thích:{" "}
          </span>
          <MathContent
            content={question.explanation}
            className="text-xs text-text-secondary"
          />
        </div>
      )}
      {reveal && isEssay && question.feedback && (
        <div className="mt-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
          <span className="text-xs font-semibold text-primary">
            Nhận xét của gia sư:{" "}
          </span>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-xs text-text-secondary">
            {question.feedback}
          </p>
        </div>
      )}
      {reveal && question.type === "essay" && question.answerGuide && (
        <div className="mt-2 rounded-lg bg-bg-secondary/50 p-2.5">
          <span className="text-xs font-semibold text-text-muted">
            Hướng dẫn:{" "}
          </span>
          <MathContent
            content={question.answerGuide}
            className="text-xs text-text-secondary"
          />
        </div>
      )}
    </div>
  );
}

type AnswerChange = Parameters<
  React.ComponentProps<typeof StudentAttemptQuestion>["onChange"]
>[0];

/** Vùng trả lời theo loại câu. */
function AnswerArea({
  question,
  disabled,
  reveal,
  onChange,
}: {
  question: AttemptQuestionDto;
  disabled: boolean;
  reveal: boolean;
  onChange: (val: AnswerChange) => void;
}) {
  const options = question.options ?? [];
  switch (question.type) {
    case "single_choice":
      return (
        <div className="space-y-2">
          {options.map((opt, i) => (
            <label
              key={i}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
                disabled ? "cursor-default" : "cursor-pointer",
                question.choiceIndex === i
                  ? "border-primary bg-primary/5 text-text-primary"
                  : "border-border-default text-text-secondary",
              )}
            >
              <input
                type="radio"
                name={`q-${question.questionId}`}
                checked={question.choiceIndex === i}
                disabled={disabled}
                onChange={() => onChange({ choiceIndex: i })}
                className="accent-primary"
              />
              <span className="mr-1 font-medium text-text-muted">
                {String.fromCharCode(65 + i)}.
              </span>
              <MathContent content={opt} className="text-sm" />
            </label>
          ))}
        </div>
      );
    case "true_false_group":
      return (
        <TrueFalseStatements
          name={`q-${question.questionId}`}
          statements={options}
          choices={question.tfChoices}
          answerKey={reveal ? question.tfAnswerKey : undefined}
          disabled={disabled}
          reveal={reveal}
          neutralWhenBlank={question.slot !== "required"}
          onChange={(tfChoices) => onChange({ tfChoices })}
        />
      );
    case "true_false":
      return (
        <TrueFalseChoice
          choices={question.tfChoices}
          labelStyle={question.tfLabelStyle}
          answerKey={reveal ? question.tfAnswerKey : undefined}
          disabled={disabled}
          reveal={reveal}
          onChange={(tfChoices) => onChange({ tfChoices })}
        />
      );
    case "fill_blank":
      return (
        <FillBlankInputs
          name={`q-${question.questionId}`}
          count={question.blankCount ?? 0}
          answers={question.blankAnswers}
          answerKey={reveal ? question.blankAnswerKey : undefined}
          disabled={disabled}
          reveal={reveal}
          onChange={(blankAnswers) => onChange({ blankAnswers })}
        />
      );
    case "ordering":
      return (
        <OrderingCards
          cards={options}
          orderAnswer={question.orderAnswer}
          orderingKey={reveal ? question.orderingKey : undefined}
          disabled={disabled}
          reveal={reveal}
          onChange={(orderAnswer) => onChange({ orderAnswer })}
        />
      );
    case "essay":
      return (
        <EssayAnswerInput
          value={question.essayAnswer}
          size={question.essayInputSize}
          disabled={disabled}
          className="rounded-xl"
          onChange={(essayAnswer) => onChange({ essayAnswer })}
        />
      );
    default:
      return assertNever(question.type, "question type");
  }
}
