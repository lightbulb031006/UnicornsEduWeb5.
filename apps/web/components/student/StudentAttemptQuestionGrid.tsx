"use client";

import { cn } from "@/lib/utils";
import type { AttemptQuestionDto } from "@/dtos/attempt.dto";
import { getAttemptQuestionVisualStatus } from "@/lib/attempt-autosave.helpers";

function cellClass(status: ReturnType<typeof getAttemptQuestionVisualStatus>) {
  switch (status) {
    case "marked_for_review":
      return "border-warning bg-warning/15 text-warning";
    case "answered":
      return "border-primary bg-primary text-text-inverse";
    default:
      return "border-border-default bg-bg-surface text-text-muted";
  }
}

function LegendSwatch({
  status,
  label,
}: {
  status: ReturnType<typeof getAttemptQuestionVisualStatus>;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-text-muted">
      <span
        aria-hidden
        className={cn(
          "inline-flex size-5 items-center justify-center rounded border text-[10px] font-semibold",
          cellClass(status),
        )}
      >
        ·
      </span>
      {label}
    </span>
  );
}

export default function StudentAttemptQuestionGrid({
  questions,
  stickyTopClassName = "top-0",
}: {
  questions: AttemptQuestionDto[];
  stickyTopClassName?: string;
}) {
  const scrollToQuestion = (questionId: string) => {
    document
      .getElementById(`attempt-q-${questionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section
      className={cn(
        "sticky z-10 -mx-1 rounded-2xl border border-border-default bg-bg-surface/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-bg-surface/80",
        stickyTopClassName,
      )}
      aria-label="Danh sách câu hỏi"
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        <LegendSwatch status="unanswered" label="Chưa làm" />
        <LegendSwatch status="answered" label="Đã làm" />
        <LegendSwatch status="marked_for_review" label="Quay lại" />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {questions.map((q, index) => {
          const status = getAttemptQuestionVisualStatus(q);
          return (
            <button
              key={q.questionId}
              type="button"
              onClick={() => scrollToQuestion(q.questionId)}
              aria-label={`Câu ${index + 1}${
                status === "answered"
                  ? ", đã làm"
                  : status === "marked_for_review"
                    ? ", đánh dấu quay lại"
                    : ", chưa làm"
              }`}
              className={cn(
                "inline-flex size-9 min-h-9 items-center justify-center rounded-md border text-xs font-semibold sm:size-10",
                cellClass(status),
              )}
            >
              {index + 1}
            </button>
          );
        })}
      </div>
    </section>
  );
}
