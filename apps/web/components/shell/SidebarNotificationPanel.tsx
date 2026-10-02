"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useCallback, useMemo } from "react";
import type { NotificationFeedItem } from "@/dtos/notification.dto";
import {
  formatSidebarNotificationTime,
  summarizeNotificationContent,
} from "@/lib/format-sidebar-notification-time";

type TabKey = "new" | "all";

export function SidebarNotificationPanel({
  open,
  onClose,
  tab,
  onTabChange,
  items,
  isLoading,
  isError,
  onRetry,
  onSelectItem,
}: {
  open: boolean;
  onClose: () => void;
  tab: TabKey;
  onTabChange: (tab: TabKey) => void;
  items: NotificationFeedItem[];
  isLoading: boolean;
  isError: boolean;
  onRetry?: () => void;
  onSelectItem: (item: NotificationFeedItem) => void;
}) {
  const reduceMotion = useReducedMotion();

  const newCount = useMemo(
    () => items.filter((item) => item.readStatus === "unread").length,
    [items],
  );

  const filtered = useMemo(() => {
    if (tab === "new") {
      return items.filter((item) => item.readStatus === "unread");
    }
    return items;
  }, [items, tab]);

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: "spring" as const, stiffness: 420, damping: 36 };

  const handleSelect = useCallback(
    (item: NotificationFeedItem) => {
      onSelectItem(item);
    },
    [onSelectItem],
  );

  return (
    <AnimatePresence>
      {open ? (
        <>
          <m.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
            className="fixed inset-0 z-[100] bg-bg-primary/75 sm:bg-bg-primary/65"
            aria-label="Đóng thông báo"
            onClick={onClose}
          />

          <m.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby="sidebar-notif-title"
            initial={reduceMotion ? false : { x: "100%" }}
            animate={{ x: 0 }}
            exit={reduceMotion ? undefined : { x: "100%" }}
            transition={transition}
            className="fixed inset-0 z-[101] flex w-full flex-col bg-bg-surface shadow-2xl sm:inset-y-0 sm:left-auto sm:right-0 sm:max-w-md sm:border-l sm:border-border-default"
          >
            <header className="flex shrink-0 items-center justify-between gap-2 border-b border-border-default px-4 py-3">
              <div className="min-w-0">
                <h2
                  id="sidebar-notif-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Thông báo
                </h2>
                <p className="mt-0.5 text-xs text-text-muted">
                  {newCount > 0 ? `${newCount} thông báo mới` : "Không có thông báo mới"}
                </p>
              </div>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label="Đóng"
              >
                <span aria-hidden className="text-lg leading-none">
                  ×
                </span>
              </button>
            </header>

            <div
              className="flex shrink-0 gap-1 border-b border-border-default px-3 pt-2"
              role="tablist"
              aria-label="Lọc thông báo"
            >
              <button
                type="button"
                role="tab"
                aria-selected={tab === "new"}
                onClick={() => onTabChange("new")}
                className={`relative flex items-center gap-2 rounded-t-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${tab === "new" ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
              >
                Mới
                {newCount > 0 ? (
                  <span className="rounded-full bg-danger px-2 py-0.5 text-[11px] font-semibold text-text-inverse">
                    {newCount > 99 ? "99+" : newCount}
                  </span>
                ) : null}
                {tab === "new" ? (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === "all"}
                onClick={() => onTabChange("all")}
                className={`relative rounded-t-lg px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${tab === "all" ? "text-primary" : "text-text-muted hover:text-text-primary"}`}
              >
                Tất cả
                {tab === "all" ? (
                  <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                ) : null}
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {isLoading ? (
                <div className="space-y-3 p-4" aria-busy="true">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div
                      key={`notif-skel-${i}`}
                      className="animate-pulse rounded-xl border border-border-default bg-bg-secondary/40 p-3"
                    >
                      <div className="h-4 max-w-[85%] rounded bg-bg-tertiary" />
                      <div className="mt-2 h-3 w-full rounded bg-bg-tertiary" />
                      <div className="mt-2 h-3 w-1/3 rounded bg-bg-tertiary" />
                    </div>
                  ))}
                </div>
              ) : isError ? (
                <div className="px-4 py-8 text-center text-sm text-text-muted">
                  <p>Không tải được thông báo.</p>
                  {onRetry ? (
                    <button
                      type="button"
                      onClick={onRetry}
                      className="mt-3 inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-text-inverse hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    >
                      Thử lại
                    </button>
                  ) : null}
                </div>
              ) : filtered.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-text-muted">
                  {tab === "new"
                    ? "Không có thông báo mới."
                    : "Chưa có thông báo."}
                </p>
              ) : (
                <ul className="space-y-2 p-2">
                  {filtered.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(item)}
                        className={`flex w-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${item.readStatus === "unread" ? "border-primary/25 bg-primary/5 hover:bg-primary/10" : "border-border-default bg-bg-surface hover:bg-bg-secondary/80"}`}
                      >
                        <span className="flex items-start justify-between gap-2">
                          <span className="line-clamp-2 text-sm font-semibold text-text-primary">
                            {item.title}
                          </span>
                          {item.readStatus === "unread" ? (
                            <span className="mt-0.5 size-2 shrink-0 rounded-full bg-primary" />
                          ) : null}
                        </span>
                        <span className="line-clamp-2 text-xs italic text-text-secondary">
                          {summarizeNotificationContent(item.message)}
                        </span>
                        <span className="text-[11px] text-text-muted">
                          {formatSidebarNotificationTime(item.lastPushedAt)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </m.aside>
        </>
      ) : null}
    </AnimatePresence>
  );
}
