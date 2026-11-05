"use client";

import { cn } from "@/lib/utils";
import { CONTENT_LIMITS } from "@/dtos/content-limits";

/**
 * Ô trả lời câu tự luận. `short` = một dòng (vẫn tự xuống dòng khi gõ dài, Enter
 * không tạo dòng mới); `long`/null = nhiều dòng như câu cũ. Chỉ là giao diện —
 * không giới hạn độ dài riêng, không ảnh hưởng chấm.
 */
export default function EssayAnswerInput({
  value,
  size,
  disabled,
  rows = 5,
  className,
  onChange,
}: {
  value: string | null | undefined;
  size: "short" | "long" | null | undefined;
  disabled?: boolean;
  /** Số dòng của ô dài. */
  rows?: number;
  className?: string;
  onChange: (essayAnswer: string) => void;
}) {
  const short = size === "short";
  return (
    <textarea
      value={value ?? ""}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        // Bộ gõ tiếng Nhật dùng Enter để chốt chữ — chỉ chặn khi không đang soạn.
        if (short && e.key === "Enter" && !e.nativeEvent.isComposing) {
          e.preventDefault();
        }
      }}
      aria-label="Nhập câu trả lời"
      placeholder="Nhập câu trả lời..."
      rows={short ? 1 : rows}
      aria-invalid={(value?.length ?? 0) > CONTENT_LIMITS.essayAnswer}
      className={cn(
        "w-full border border-border-default bg-bg-surface px-3 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        short && "field-sizing-content min-h-11 resize-none",
        className,
      )}
    />
  );
}
