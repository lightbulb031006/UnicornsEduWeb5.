"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import MathContent from "@/components/ui/MathContent";
import type { TrueFalseChoices } from "@/dtos/attempt.dto";
import { TRUE_FALSE_STATEMENT_LABELS } from "@/dtos/question.dto";

/**
 * 4 nhận định a–d của câu Đúng/Sai. Bấm lại lựa chọn đang chọn để bỏ chọn
 * (cần cho luật nhóm tự chọn: học sinh lỡ chạm nhóm kia phải xoá được).
 */
export default function TrueFalseStatements({
  name,
  statements,
  choices,
  answerKey,
  disabled,
  reveal,
  neutralWhenBlank = false,
  onChange,
}: {
  name: string;
  statements: string[];
  choices: TrueFalseChoices | null;
  /** Đáp án đúng, chỉ có khi xem lại. */
  answerKey?: boolean[];
  disabled: boolean;
  reveal: boolean;
  /**
   * Nhóm tự chọn: nhận định bỏ trống khi xem lại hiện trung tính (không xanh/đỏ),
   * vì học sinh chỉ làm một trong hai nhóm.
   */
  neutralWhenBlank?: boolean;
  onChange: (next: TrueFalseChoices) => void;
}) {
  const current: TrueFalseChoices = [0, 1, 2, 3].map((i) => {
    const c = choices?.[i];
    return typeof c === "boolean" ? c : null;
  });

  const pick = (index: number, value: boolean) => {
    const next = [...current];
    next[index] = current[index] === value ? null : value;
    onChange(next);
  };

  return (
    <ol className="space-y-2" aria-label="Các nhận định">
      {TRUE_FALSE_STATEMENT_LABELS.map((label, i) => {
        const chosen = current[i];
        const key = answerKey?.[i];
        const showKey = reveal && typeof key === "boolean";
        const neutral = showKey && neutralWhenBlank && chosen === null;
        const right = showKey && chosen === key;
        return (
          <li
            key={label}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              (!showKey || neutral) && "border-border-default",
              showKey && !neutral && right && "border-success/40 bg-success/5",
              showKey && !neutral && !right && "border-error/40 bg-error/5",
            )}
          >
            <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1 text-sm text-text-primary">
                <span className="mr-1 font-semibold text-text-muted">
                  {label})
                </span>
                <MathContent
                  content={statements[i] ?? ""}
                  className="inline text-sm [&>p:first-child]:inline"
                />
              </div>
              <div
                role="radiogroup"
                aria-label={`Nhận định ${label}`}
                className="flex shrink-0 gap-2"
              >
                {([true, false] as const).map((value) => (
                  <button
                    key={String(value)}
                    type="button"
                    role="radio"
                    name={`${name}-${label}`}
                    aria-checked={chosen === value}
                    disabled={disabled}
                    onClick={() => pick(i, value)}
                    className={cn(
                      "inline-flex min-h-10 min-w-16 items-center justify-center rounded-lg border px-3 text-sm font-medium transition-colors",
                      chosen === value
                        ? "border-primary bg-primary text-text-inverse"
                        : "border-border-default text-text-secondary",
                      !disabled &&
                        chosen !== value &&
                        "hover:border-primary/50",
                      disabled && "cursor-default",
                    )}
                  >
                    {value ? "Đúng" : "Sai"}
                  </button>
                ))}
              </div>
            </div>
            {neutral ? (
              <p className="mt-1.5 text-xs text-text-muted">
                Đáp án: {key ? "Đúng" : "Sai"}
              </p>
            ) : showKey ? (
              <p
                className={cn(
                  "mt-1.5 inline-flex items-center gap-1 text-xs font-medium",
                  right ? "text-success" : "text-error",
                )}
              >
                {right ? (
                  <Check className="size-3.5" />
                ) : (
                  <X className="size-3.5" />
                )}
                Đáp án: {key ? "Đúng" : "Sai"}
                {chosen === null ? " · bạn bỏ trống" : ""}
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
