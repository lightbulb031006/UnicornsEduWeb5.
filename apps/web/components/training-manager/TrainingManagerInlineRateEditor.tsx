"use client";

import { useRef, useState, type KeyboardEvent } from "react";
import {
  ArrowPathIcon,
  CheckIcon,
  PencilIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import {
  formatTrainingManagerRatePercent,
  parseTrainingManagerRatePercent,
  toTrainingManagerRateDraft,
} from "@/lib/training-manager-rate";
import { cn } from "@/lib/utils";

type Props = {
  value: number;
  /** Tên dùng cho aria-label, vd «lớp 104. Hà Sơn Tùng». */
  label: string;
  canEdit: boolean;
  /** Resolve khi lưu xong (đã refetch); reject thì giữ ô đang sửa để thử lại. */
  onSave: (ratePercent: number) => Promise<unknown>;
  className?: string;
};

const ICON_BUTTON_CLASS =
  "inline-flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed";

const INVALID_HINT = "Nhập số lớn hơn 0 và không quá 100";

const CHIP_BASE_CLASS =
  "inline-flex min-h-8 items-center gap-1.5 rounded-lg border px-2.5 font-medium tabular-nums text-text-primary";

type ChipProps = {
  value: number;
  /** Có thì là nút bấm sửa; không có thì hiển thị tĩnh. */
  onClick?: () => void;
  ariaLabel?: string;
  /** Bản tĩnh giữ chỗ icon bút để số thẳng cột với chip bấm được cạnh bên. */
  reserveIconSpace?: boolean;
  className?: string;
};

/** Chip % QLL dùng chung cho hàng lớp và hàng buổi. */
export function TrainingManagerRateChip({
  value,
  onClick,
  ariaLabel,
  reserveIconSpace = false,
  className,
}: ChipProps) {
  const formatted = formatTrainingManagerRatePercent(value);

  if (!onClick) {
    return (
      <span className={cn(CHIP_BASE_CLASS, "border-transparent", className)}>
        {formatted}
        {reserveIconSpace ? <span className="size-3.5" aria-hidden /> : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        CHIP_BASE_CLASS,
        "group/rate border-border-default bg-bg-surface shadow-sm transition-colors hover:border-primary/40 hover:bg-primary/5 hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus",
        className,
      )}
      aria-label={ariaLabel ?? `Sửa % QLL, hiện ${formatted}`}
      title="Bấm để sửa % QLL"
    >
      {formatted}
      <PencilIcon
        className="size-3.5 text-text-muted transition-colors group-hover/rate:text-primary"
        aria-hidden
      />
    </button>
  );
}

/**
 * Ô % QLL sửa tại chỗ: bấm chip để sửa, ✓ / ✕ chỉ hiện khi giá trị khác ban đầu
 * (chỗ của chúng luôn được giữ sẵn để input không nhảy khi gõ).
 * Enter lưu, Escape huỷ; rời ô khi chưa đổi gì thì tự thoát chế độ sửa.
 */
export default function TrainingManagerInlineRateEditor({
  value,
  label,
  canEdit,
  onSave,
  className,
}: Props) {
  const [draft, setDraft] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const formatted = formatTrainingManagerRatePercent(value);

  if (!canEdit) {
    return <TrainingManagerRateChip value={value} className={className} />;
  }

  if (draft === null) {
    return (
      <TrainingManagerRateChip
        value={value}
        onClick={() => setDraft(toTrainingManagerRateDraft(value))}
        ariaLabel={`Sửa % QLL ${label}, hiện ${formatted}`}
        className={cn("self-start sm:self-auto", className)}
      />
    );
  }

  const parsed = parseTrainingManagerRatePercent(draft);
  const isInvalid = parsed === null;
  const isChanged = parsed !== value;
  const canSubmit = isChanged && !isInvalid && !isSaving;

  const cancel = () => {
    if (isSaving) return;
    setDraft(null);
  };

  const save = async () => {
    if (!canSubmit || parsed === null) return;
    setIsSaving(true);
    try {
      await onSave(parsed);
      setDraft(null);
    } catch {
      // Lỗi đã toast ở mutation; giữ nguyên ô để người dùng sửa lại.
    } finally {
      setIsSaving(false);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void save();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancel();
    }
  };

  return (
    <div
      ref={containerRef}
      className={cn(
        // Desktop: input sát mép phải (thẳng cột với chip), nút mọc sang trái.
        "inline-flex items-center gap-1 self-start sm:self-auto sm:flex-row-reverse",
        className,
      )}
      onBlur={(event) => {
        // Chưa đổi gì mà rời khỏi cả cụm (input + nút) → thoát sửa.
        if (
          !isChanged &&
          !containerRef.current?.contains(event.relatedTarget as Node | null)
        ) {
          setDraft(null);
        }
      }}
    >
      <div className="relative">
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={(event) => event.currentTarget.select()}
          autoFocus
          inputMode="decimal"
          autoComplete="off"
          disabled={isSaving}
          aria-label={`% QLL ${label}`}
          aria-invalid={isInvalid}
          title={isInvalid ? INVALID_HINT : undefined}
          className={cn(
            "min-h-8 w-16 rounded-lg border bg-bg-surface py-1 pl-2 pr-6 text-right text-base font-medium tabular-nums text-text-primary shadow-sm focus:outline-none focus-visible:ring-2 disabled:opacity-60 sm:text-sm",
            isInvalid
              ? "border-error focus-visible:ring-error/40"
              : "border-primary/50 focus-visible:ring-border-focus",
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-xs text-text-muted">
          %
        </span>
      </div>
      <div
        className={cn(
          "flex items-center gap-1 sm:flex-row-reverse",
          // Giữ chỗ khi chưa đổi để input không xê dịch; `invisible` cũng loại nút khỏi Tab.
          !isChanged && "invisible",
        )}
      >
        <button
          type="button"
          onClick={() => void save()}
          disabled={!canSubmit}
          className={cn(
            ICON_BUTTON_CLASS,
            "bg-primary text-text-inverse hover:bg-primary-hover disabled:bg-bg-tertiary disabled:text-text-muted",
          )}
          aria-label={`Lưu % QLL ${label}`}
          title={isInvalid ? INVALID_HINT : "Lưu (Enter)"}
        >
          {isSaving ? (
            <ArrowPathIcon className="size-4 animate-spin" aria-hidden />
          ) : (
            <CheckIcon className="size-4" strokeWidth={2.5} aria-hidden />
          )}
        </button>
        <button
          type="button"
          onClick={cancel}
          disabled={isSaving}
          className={cn(
            ICON_BUTTON_CLASS,
            "border border-border-default bg-bg-surface text-text-muted hover:bg-bg-tertiary hover:text-text-primary disabled:opacity-50",
          )}
          aria-label={`Huỷ sửa % QLL ${label}`}
          title="Huỷ (Esc)"
        >
          <XMarkIcon className="size-4" strokeWidth={2.5} aria-hidden />
        </button>
      </div>
    </div>
  );
}
