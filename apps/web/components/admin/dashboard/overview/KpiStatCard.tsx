"use client";

import { useId, useState, type ReactNode } from "react";

export type KpiDelta = { text: string; tone: "up" | "down" | "flat" };

const DELTA_CLASS: Record<KpiDelta["tone"], string> = {
  up: "bg-success/12 text-success",
  down: "bg-error/12 text-error",
  flat: "bg-bg-secondary text-text-secondary",
};

/** % thay đổi so với kỳ trước; `invert` cho chỉ số "tăng là xấu" (chi phí). */
export function computeDelta(current: number, previous: number | undefined, invert = false): KpiDelta | null {
  if (previous == null || previous === 0) return null;
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const rounded = Math.round(pct * 10) / 10;
  if (rounded === 0) return { text: "0%", tone: "flat" };
  const good = invert ? rounded < 0 : rounded > 0;
  return {
    text: `${rounded > 0 ? "▲" : "▼"} ${Math.abs(rounded).toLocaleString("vi-VN")}%`,
    tone: good ? "up" : "down",
  };
}

/** Chênh lệch số lượng (học sinh): "▲ 12" / "▼ 11". */
export function computeCountDelta(change: number | null | undefined): KpiDelta | null {
  if (change == null) return null;
  if (change === 0) return { text: "= 0", tone: "flat" };
  return {
    text: `${change > 0 ? "▲" : "▼"} ${Math.abs(change).toLocaleString("vi-VN")}`,
    tone: change > 0 ? "up" : "down",
  };
}

/** Nội dung giải thích delta: một câu ý nghĩa + các dòng số liệu "nhãn: giá trị". */
export function KpiDeltaHint({ summary, rows }: { summary: ReactNode; rows: { label: string; value: string }[] }) {
  return (
    <span className="flex flex-col gap-2">
      <span className="text-text-primary">{summary}</span>
      <span className="flex flex-col gap-1 border-t border-border-default pt-2 tabular-nums">
        {rows.map((row) => (
          <span key={row.label} className="flex justify-between gap-3">
            <span>{row.label}</span>
            <span className="font-semibold text-text-primary">{row.value}</span>
          </span>
        ))}
      </span>
    </span>
  );
}

/**
 * Badge delta + giải thích. Nằm ngoài `<button>` của thẻ (không lồng phần tử
 * tương tác): desktop hover/focus là hiện, mobile chạm để bật/tắt — `title`
 * native vừa chậm vừa không có trên cảm ứng.
 */
function KpiDeltaBadge({ delta, hint }: { delta: KpiDelta; hint?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const hintId = useId();
  const badgeClass = `rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ${DELTA_CLASS[delta.tone]}`;

  if (!hint) return <span className={badgeClass}>{delta.text}</span>;

  return (
    <span className="group/delta relative inline-flex" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={hintId}
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className={`${badgeClass} inline-flex cursor-help items-center gap-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus`}
      >
        {delta.text}
        <span aria-hidden className="text-[10px] font-bold opacity-70">
          ⓘ
        </span>
      </button>
      <span
        id={hintId}
        role="tooltip"
        className={`absolute right-0 top-full z-20 mt-2 w-64 max-w-[calc(100vw-2rem)] rounded-xl border border-border-default bg-bg-surface p-3 text-left text-xs font-normal leading-relaxed text-text-secondary shadow-lg transition-opacity group-hover/delta:visible group-hover/delta:opacity-100 group-focus-within/delta:visible group-focus-within/delta:opacity-100 ${
          open ? "visible opacity-100" : "invisible opacity-0"
        }`}
      >
        {hint}
      </span>
    </span>
  );
}

export function KpiStatCard({
  label,
  value,
  delta,
  deltaHint,
  foot,
  onClick,
}: {
  label: string;
  value: string;
  delta?: KpiDelta | null;
  /** Giải thích con số delta (kỳ so sánh, cách tính) — hiện khi hover / chạm badge. */
  deltaHint?: ReactNode;
  foot: string;
  onClick: () => void;
}) {
  return (
    <div className="relative min-w-0">
      <button
        type="button"
        onClick={onClick}
        className="flex h-full w-full min-w-0 flex-col gap-2 rounded-2xl border border-border-default bg-bg-surface p-4 text-left shadow-sm transition-colors hover:border-primary/30 hover:bg-bg-secondary/30 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:p-5"
      >
        {/* pr chừa chỗ cho badge đặt tuyệt đối bên phải. */}
        <span className={`text-sm font-semibold text-text-secondary ${delta ? "pr-20" : ""}`}>{label}</span>
        <span className="truncate text-2xl font-bold tabular-nums tracking-tight text-text-primary sm:text-[1.7rem]">
          {value}
        </span>
        <span className="line-clamp-2 text-xs tabular-nums text-text-secondary">{foot}</span>
      </button>
      {delta ? (
        <span className="absolute right-4 top-4 sm:right-5 sm:top-5">
          <KpiDeltaBadge delta={delta} hint={deltaHint} />
        </span>
      ) : null}
    </div>
  );
}
