"use client";

import { useRef, type KeyboardEvent } from "react";
import { m } from "framer-motion";

/**
 * Thanh tab pill của trang lớp (học sinh và admin/staff), roving tabindex theo
 * WAI-ARIA tabs: mũi tên / Home / End đổi tab và focus.
 */
export default function ClassTabList<T extends string>({
  tabs,
  labels,
  activeTab,
  counts,
  onSelect,
  idPrefix,
  panelId,
  ariaLabel,
}: {
  /** Thứ tự hiển thị. */
  tabs: readonly T[];
  labels: Record<T, string>;
  activeTab: T;
  /** Thiếu số của tab (đang tải) thì ẩn badge. */
  counts?: Partial<Record<T, number>>;
  onSelect: (tab: T) => void;
  /** Tiền tố id nút tab: `${idPrefix}-${tab}`; panel trỏ `aria-labelledby` về đây. */
  idPrefix: string;
  panelId: string;
  ariaLabel: string;
}) {
  const tabRefs = useRef(new Map<T, HTMLButtonElement>());

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = tabs.indexOf(activeTab);
    const last = tabs.length - 1;
    const nextIndex =
      event.key === "ArrowRight"
        ? current === last
          ? 0
          : current + 1
        : event.key === "ArrowLeft"
          ? current === 0
            ? last
            : current - 1
          : event.key === "Home"
            ? 0
            : event.key === "End"
              ? last
              : null;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = tabs[nextIndex];
    onSelect(next);
    tabRefs.current.get(next)?.focus();
  };

  return (
    <div
      role="tablist"
      onKeyDown={onKeyDown}
      aria-label={ariaLabel}
      className="flex w-full items-center gap-1 rounded-2xl border border-border-default bg-bg-secondary/70 p-1.5 shadow-xs sm:w-auto sm:self-start"
    >
      {tabs.map((tab) => {
        const selected = activeTab === tab;
        const count = counts?.[tab];
        return (
          <button
            key={tab}
            ref={(el) => {
              if (el) tabRefs.current.set(tab, el);
              else tabRefs.current.delete(tab);
            }}
            type="button"
            role="tab"
            id={`${idPrefix}-${tab}`}
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            aria-controls={panelId}
            onClick={() => onSelect(tab)}
            className="relative z-10 flex min-h-11 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium transition-colors sm:min-h-10 sm:flex-none sm:px-4"
          >
            {selected ? (
              <m.span
                layoutId={`${idPrefix}-pill`}
                className="absolute inset-0 -z-10 rounded-xl bg-primary shadow-sm"
                transition={{ type: "spring", stiffness: 400, damping: 30 }}
              />
            ) : null}
            <span
              className={selected ? "text-text-inverse" : "text-text-secondary"}
            >
              {labels[tab]}
            </span>
            {count === undefined ? null : (
              <span
                className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                  selected
                    ? "bg-text-inverse/20 text-text-inverse"
                    : "bg-bg-surface text-text-muted"
                }`}
              >
                {count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
