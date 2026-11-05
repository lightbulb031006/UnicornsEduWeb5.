"use client";

import { Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrueFalseChoices } from "@/dtos/attempt.dto";
import {
  type TrueFalseLabelStyleDto,
  trueFalseChoiceLabels,
} from "@/dtos/question.dto";

/**
 * Hai lựa chọn của Câu Đúng/Sai (JP, một nhận định). Nhãn theo kiểu nhãn của câu
 * (○/×, Đúng/Sai, True/False); không xáo. Bấm lại lựa chọn đang chọn để bỏ chọn.
 */
export default function TrueFalseChoice({
  choices,
  labelStyle,
  answerKey,
  disabled,
  reveal,
  onChange,
}: {
  choices: TrueFalseChoices | null | undefined;
  labelStyle: TrueFalseLabelStyleDto | null | undefined;
  /** Đáp án đúng, chỉ có khi xem lại. */
  answerKey?: boolean[];
  disabled: boolean;
  reveal: boolean;
  onChange: (next: TrueFalseChoices) => void;
}) {
  const labels = trueFalseChoiceLabels(labelStyle);
  const chosen = typeof choices?.[0] === "boolean" ? choices[0] : null;
  const key = answerKey?.[0];
  const showKey = reveal && typeof key === "boolean";
  const right = showKey && chosen === key;

  return (
    <div className="space-y-2">
      <div
        role="radiogroup"
        aria-label="Chọn Đúng hoặc Sai"
        className="grid grid-cols-2 gap-2 sm:flex"
      >
        {([true, false] as const).map((value, i) => (
          <button
            key={String(value)}
            type="button"
            role="radio"
            aria-checked={chosen === value}
            aria-label={value ? "Đúng" : "Sai"}
            disabled={disabled}
            onClick={() => onChange([chosen === value ? null : value])}
            className={cn(
              "inline-flex min-h-12 items-center justify-center rounded-xl border px-4 text-base font-semibold transition-colors sm:min-w-28",
              chosen === value
                ? "border-primary bg-primary text-text-inverse"
                : "border-border-default text-text-secondary",
              !disabled && chosen !== value && "hover:border-primary/50",
              disabled && "cursor-default",
              showKey && key === value && chosen !== value && "border-success",
            )}
          >
            {labels[i]}
          </button>
        ))}
      </div>
      {showKey ? (
        <p
          className={cn(
            "inline-flex items-center gap-1 text-xs font-medium",
            right ? "text-success" : "text-error",
          )}
        >
          {right ? <Check className="size-3.5" /> : <X className="size-3.5" />}
          Đáp án: {labels[key ? 0 : 1]}
          {chosen === null ? " · bạn bỏ trống" : ""}
        </p>
      ) : null}
    </div>
  );
}
