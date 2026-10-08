"use client";

import { useId, useMemo, useState, type KeyboardEvent } from "react";
import { renderLatexPreview } from "@/lib/math-render";
import { cn } from "@/lib/utils";

export type MathLatexMode = "inline" | "block";

export type MathLatexInputPanelProps = {
  mode: MathLatexMode;
  initialLatex?: string;
  /** Đang sửa công thức có sẵn: đổi nhãn nút + hiện nút Xoá. */
  editing?: boolean;
  onSubmit: (latex: string) => void;
  onCancel: () => void;
  onDelete?: () => void;
};

const MODE_LABEL: Record<MathLatexMode, string> = {
  inline: "Công thức cùng dòng",
  block: "Công thức khối",
};

const MODE_PLACEHOLDER: Record<MathLatexMode, string> = {
  inline: "x^2 + y^2 = r^2",
  block: "\\int_0^1 f(x)\\,dx = \\frac{a}{b}",
};

const BUTTON_BASE =
  "inline-flex min-h-9 items-center justify-center rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50";

/**
 * Ô nhập LaTeX kèm xem trước KaTeX trực tiếp, nằm ngay trong editor (không mở dialog
 * lồng trong dialog). Enter chèn với công thức cùng dòng; Ctrl/⌘+Enter chèn với mọi chế độ;
 * Esc huỷ mà không đóng dialog bao ngoài.
 */
export default function MathLatexInputPanel({
  mode,
  initialLatex = "",
  editing = false,
  onSubmit,
  onCancel,
  onDelete,
}: MathLatexInputPanelProps) {
  const inputId = useId();
  const previewId = useId();
  const [latex, setLatex] = useState(initialLatex);
  const preview = useMemo(
    () => renderLatexPreview(latex, mode === "block"),
    [latex, mode],
  );
  const canSubmit = preview?.ok === true;

  const submit = () => {
    if (!canSubmit) return;
    onSubmit(latex.trim());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Escape") {
      // Chặn listener Escape ở document của ResponsiveDialog bao ngoài.
      event.preventDefault();
      event.stopPropagation();
      onCancel();
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    if (mode === "inline" || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div
      className="shrink-0 space-y-2 border-b border-border-default bg-bg-secondary/50 p-2.5"
      role="group"
      aria-label={MODE_LABEL[mode]}
    >
      <label
        htmlFor={inputId}
        className="flex flex-wrap items-baseline justify-between gap-x-2 text-xs font-semibold text-text-primary"
      >
        {MODE_LABEL[mode]} (LaTeX)
        <span className="text-[11px] font-normal text-text-muted">
          {mode === "inline" ? "Enter để chèn" : "Ctrl/⌘ + Enter để chèn"} · Esc để huỷ
        </span>
      </label>
      <textarea
        id={inputId}
        value={latex}
        onChange={(event) => setLatex(event.target.value)}
        onKeyDown={handleKeyDown}
        rows={mode === "inline" ? 1 : 3}
        autoFocus
        spellCheck={false}
        autoCapitalize="off"
        autoCorrect="off"
        placeholder={MODE_PLACEHOLDER[mode]}
        aria-describedby={previewId}
        className="block w-full resize-y rounded-md border border-border-default bg-bg-surface px-2.5 py-2 font-mono text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus:ring-2 focus:ring-border-focus"
      />

      <div
        id={previewId}
        aria-live="polite"
        className={cn(
          "min-h-11 rounded-md border px-3 py-2",
          preview?.ok === false
            ? "border-error/40 bg-error/5"
            : "border-border-subtle bg-bg-surface",
        )}
      >
        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
          Xem trước
        </p>
        {preview === null ? (
          <p className="text-xs text-text-muted">Nhập công thức để xem trước.</p>
        ) : preview.ok ? (
          <div
            className="overflow-x-auto text-text-primary [&_.katex-display]:my-1 [&_.katex]:text-text-primary"
            dangerouslySetInnerHTML={{ __html: preview.html }}
          />
        ) : (
          <p className="break-words font-mono text-xs text-error" role="alert">
            {preview.message}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-2">
        {editing && onDelete ? (
          <button
            type="button"
            onClick={onDelete}
            className={cn(BUTTON_BASE, "mr-auto text-error hover:bg-error/10")}
          >
            Xoá công thức
          </button>
        ) : null}
        <button
          type="button"
          onClick={onCancel}
          className={cn(
            BUTTON_BASE,
            "border border-border-default bg-bg-surface text-text-primary hover:bg-bg-secondary",
          )}
        >
          Huỷ
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!canSubmit}
          className={cn(BUTTON_BASE, "bg-primary text-text-inverse hover:bg-primary-hover")}
        >
          {editing ? "Cập nhật" : "Chèn"}
        </button>
      </div>
    </div>
  );
}
