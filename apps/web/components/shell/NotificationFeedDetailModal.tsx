"use client";

import { AnimatePresence, m, useReducedMotion } from "framer-motion";
import { useMemo } from "react";
import type { NotificationFeedItem } from "@/dtos/notification.dto";
import {
  formatSidebarNotificationTime,
} from "@/lib/format-sidebar-notification-time";
import { sanitizeRichTextContent } from "@/lib/sanitize";

export function NotificationFeedDetailModal({
  open,
  item,
  onClose,
}: {
  open: boolean;
  item: NotificationFeedItem | null;
  onClose: () => void;
}) {
  const reduceMotion = useReducedMotion();
  const contentTextLength = useMemo(() => {
    const raw = item?.message ?? "";
    return raw.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().length;
  }, [item?.message]);

  const dialogMaxWidth =
    contentTextLength > 1100
      ? "max-w-4xl"
      : contentTextLength > 520
        ? "max-w-3xl"
        : "max-w-2xl";

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const };

  return (
    <AnimatePresence>
      {open && item ? (
        <>
          <m.button
            type="button"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.2 }}
        className="fixed inset-0 z-[120] bg-bg-primary/75"
            aria-label="Đóng chi tiết thông báo"
            onClick={onClose}
          />
          <div className="fixed inset-0 z-[121] flex items-center justify-center p-3 sm:p-4 pointer-events-none">
            <m.div
              role="dialog"
              aria-modal="true"
              aria-labelledby="notif-detail-title"
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, scale: 0.94, y: 16 }
              }
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={
                reduceMotion
                  ? undefined
                  : { opacity: 0, scale: 0.96, y: 10 }
              }
              transition={transition}
              className={`pointer-events-auto flex w-full ${dialogMaxWidth} max-h-[92dvh] flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl`}
            >
              <header className="flex shrink-0 items-start justify-between gap-3 border-b border-border-default px-4 py-3">
                <h2
                  id="notif-detail-title"
                  className="text-xl font-bold leading-snug tracking-tight text-text-primary sm:text-2xl"
                >
                  {item.title}
                </h2>
                <button
                  type="button"
                  onClick={onClose}
                  className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  aria-label="Đóng"
                >
                  <span aria-hidden className="text-xl leading-none">
                    ×
                  </span>
                </button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-medium text-primary">
                    {item.version > 1 ? `Điều chỉnh v${item.version}` : "Thông báo mới"}
                  </span>
                  <p className="text-xs text-text-muted">
                    {formatSidebarNotificationTime(item.lastPushedAt)}
                  </p>
                </div>
                <div
                  className="mt-3 text-sm leading-relaxed text-text-secondary [&_a]:text-primary [&_a]:underline [&_li]:ml-5 [&_ol]:list-decimal [&_ol]:pl-1 [&_p]:mb-2 [&_ul]:list-disc [&_ul]:pl-1"
                  dangerouslySetInnerHTML={{
                    __html: sanitizeRichTextContent(item.message),
                  }}
                />
              </div>
              <footer className="shrink-0 border-t border-border-default p-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-xl border border-border-default bg-bg-surface px-4 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:w-auto"
                >
                  Quay lại danh sách
                </button>
              </footer>
            </m.div>
          </div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
