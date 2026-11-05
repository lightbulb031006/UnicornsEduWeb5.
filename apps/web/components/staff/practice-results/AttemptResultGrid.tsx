"use client";

import { cn } from "@/lib/utils";
import type { QuestionOutcome } from "@/lib/practice-results";

const OUTCOME_LABEL: Record<QuestionOutcome, string> = {
  correct: "Đúng",
  partial: "Một phần",
  wrong: "Sai",
  pending: "Chờ chấm",
  blank: "Bỏ trống",
  not_chosen: "Không chọn",
};

function cellClass(outcome: QuestionOutcome) {
  switch (outcome) {
    case "correct":
      return "border-success bg-success text-text-inverse";
    case "partial":
      return "border-warning bg-warning/20 text-warning";
    case "wrong":
      return "border-error bg-error/15 text-error";
    case "pending":
      return "border-dashed border-primary bg-primary/10 text-primary";
    case "not_chosen":
      return "border-dashed border-border-default bg-bg-secondary text-text-muted opacity-60";
    default:
      return "border-border-default bg-bg-surface text-text-muted";
  }
}

const LEGEND: QuestionOutcome[] = [
  "correct",
  "partial",
  "wrong",
  "pending",
  "blank",
];

export type AttemptResultGridItem = {
  questionId: string;
  label: string;
  outcome: QuestionOutcome;
};

/** Lưới câu của bài đã nộp, tô theo kết quả; bấm ô để cuộn tới câu. */
export default function AttemptResultGrid({
  items,
  className,
}: {
  items: AttemptResultGridItem[];
  className?: string;
}) {
  const present = new Set(items.map((i) => i.outcome));
  const scrollToQuestion = (questionId: string) => {
    document
      .getElementById(`attempt-q-${questionId}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <section
      aria-label="Kết quả từng câu"
      className={cn(
        "rounded-2xl border border-border-default bg-bg-surface px-3 py-3",
        className,
      )}
    >
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {LEGEND.filter((o) => present.has(o)).map((outcome) => (
          <span
            key={outcome}
            className="inline-flex items-center gap-1.5 text-xs text-text-muted"
          >
            <span
              aria-hidden
              className={cn("inline-block size-4 rounded border", cellClass(outcome))}
            />
            {OUTCOME_LABEL[outcome]}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-1.5">
        {items.map((item) => (
          <button
            key={item.questionId}
            type="button"
            onClick={() => scrollToQuestion(item.questionId)}
            aria-label={`Câu ${item.label}, ${OUTCOME_LABEL[item.outcome].toLowerCase()}`}
            className={cn(
              "inline-flex h-10 w-full min-w-0 items-center justify-center rounded-md border px-0.5 font-semibold tabular-nums",
              item.label.length > 4 ? "text-[10px] tracking-tight" : "text-xs",
              cellClass(item.outcome),
            )}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
