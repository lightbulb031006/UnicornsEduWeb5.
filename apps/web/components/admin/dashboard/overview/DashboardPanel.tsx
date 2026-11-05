"use client";

import { useId, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export function DashboardPanel({
  title,
  description,
  action,
  dimmed = false,
  className = "",
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  dimmed?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm transition-opacity sm:p-5 ${
        dimmed ? "opacity-70" : ""
      } ${className}`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="min-w-0">
          <h2 id={titleId} className="text-base font-bold text-text-primary">
            {title}
          </h2>
          {description ? <p className="mt-1 text-sm text-text-secondary">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export type AmountTone = "default" | "positive" | "negative" | "muted";

const AMOUNT_TONE_CLASS: Record<AmountTone, string> = {
  default: "text-text-primary",
  positive: "text-success",
  negative: "text-error",
  muted: "text-text-secondary",
};

/** Dòng "nhãn …… số tiền ›" bấm được để mở chi tiết đóng góp. */
export function AmountRowButton({
  label,
  value,
  tone = "default",
  emphasize = false,
  note,
  onClick,
}: {
  label: ReactNode;
  value: string;
  tone?: AmountTone;
  emphasize?: boolean;
  note?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-11 w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
        emphasize ? "border-t border-border-default bg-bg-secondary/40 font-semibold" : ""
      }`}
    >
      <span className="flex w-full items-center justify-between gap-3 text-sm">
        <span className="min-w-0 text-text-primary">{label}</span>
        <span className="flex shrink-0 items-center gap-1">
          <span className={`tabular-nums ${emphasize ? "font-bold" : "font-semibold"} ${AMOUNT_TONE_CLASS[tone]}`}>
            {value}
          </span>
          <ChevronRight
            className="size-4 text-text-muted opacity-40 transition-opacity group-hover:opacity-100"
            aria-hidden
          />
        </span>
      </span>
      {note ? <span className="text-xs text-text-secondary">{note}</span> : null}
    </button>
  );
}
