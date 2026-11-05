"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { BlankAnswers } from "@/dtos/attempt.dto";
import { BLANK_ANSWER_MAX_LENGTH } from "@/dtos/question.dto";
import { isBlankAnswerAccepted } from "@/lib/fill-blank";

/**
 * Ô nhập của câu điền vào ô trống: mỗi ô một dòng, nhãn 【n】 khớp với nhãn
 * trong đề. Xem lại: hiện chữ học sinh gõ và mọi đáp án hợp lệ của ô.
 */
export default function FillBlankInputs({
  name,
  count,
  answers,
  answerKey,
  disabled,
  reveal,
  onChange,
}: {
  name: string;
  count: number;
  answers: BlankAnswers | null | undefined;
  /** Đáp án hợp lệ từng ô — chỉ có khi xem lại. */
  answerKey?: string[][] | null;
  disabled: boolean;
  reveal: boolean;
  onChange: (next: BlankAnswers) => void;
}) {
  const values = Array.from({ length: count }, (_, i) => answers?.[i] ?? "");

  return (
    <ol className="space-y-2">
      {values.map((value, i) => {
        const accepted = reveal ? answerKey?.[i] : undefined;
        const right =
          accepted != null && isBlankAnswerAccepted(value, accepted);
        return (
          <li key={i} className="space-y-1">
            <label className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-sm font-semibold text-text-muted">
                【{i + 1}】
              </span>
              <input
                name={`${name}-${i}`}
                value={value}
                disabled={disabled}
                maxLength={BLANK_ANSWER_MAX_LENGTH}
                autoComplete="off"
                onChange={(e) =>
                  onChange(
                    values.map((v, j) =>
                      j === i ? e.target.value : v === "" ? null : v,
                    ),
                  )
                }
                aria-label={`Ô ${i + 1}`}
                placeholder="Nhập đáp án..."
                className={cn(
                  "min-h-11 min-w-0 flex-1 rounded-xl border bg-bg-surface px-3 py-2 text-base text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:text-sm",
                  accepted == null && "border-border-default",
                  accepted != null && (right ? "border-success" : "border-error"),
                )}
              />
            </label>
            {accepted != null ? (
              <p
                className={cn(
                  "ml-12 inline-flex items-start gap-1 text-xs font-medium",
                  right ? "text-success" : "text-error",
                )}
              >
                {right ? (
                  <Check className="mt-px size-3.5 shrink-0" />
                ) : (
                  <X className="mt-px size-3.5 shrink-0" />
                )}
                <span>
                  Đáp án: {accepted.join(" / ")}
                  {value.trim() === "" ? " · bạn bỏ trống" : ""}
                </span>
              </p>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
