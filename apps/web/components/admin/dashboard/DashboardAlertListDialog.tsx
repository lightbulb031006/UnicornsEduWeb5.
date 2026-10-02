"use client";

import { useEffect, useId, useRef } from "react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ResponsiveDialog,
  ResponsiveDialogBody,
} from "@/components/ui/ResponsiveDialog";
import type {
  AdminDashboardActionAlert,
  AdminDashboardActionAlertGroup,
} from "@/dtos/dashboard.dto";
import { getAdminDashboardActionAlerts } from "@/lib/apis/dashboard.api";
import {
  formatDashboardAlertCurrency,
  getAlertGroupToneClasses,
  type AlertGroupTone,
} from "./alert-group-styles";

const PAGE_SIZE = 20;

type DashboardAlertListDialogProps = {
  open: boolean;
  title: string;
  group: AdminDashboardActionAlertGroup;
  tone: AlertGroupTone;
  month: string;
  year: string;
  onClose: () => void;
  onOpenAlert: (alert: AdminDashboardActionAlert) => void;
};

export default function DashboardAlertListDialog({
  open,
  title,
  group,
  tone,
  month,
  year,
  onClose,
  onOpenAlert,
}: DashboardAlertListDialogProps) {
  const titleId = useId();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const { itemToneClass } = getAlertGroupToneClasses(tone);

  const alertsQuery = useInfiniteQuery({
    queryKey: ["dashboard", "admin", "action-alerts", group, month, year],
    queryFn: ({ pageParam }) =>
      getAdminDashboardActionAlerts({
        group,
        month,
        year,
        page: pageParam,
        limit: PAGE_SIZE,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const loaded = lastPage.meta.page * lastPage.meta.limit;
      return loaded < lastPage.meta.total ? lastPage.meta.page + 1 : undefined;
    },
    enabled: open,
    staleTime: 20_000,
  });

  const alerts = alertsQuery.data?.pages.flatMap((page) => page.data) ?? [];
  const totalCount = alertsQuery.data?.pages[0]?.meta.total ?? 0;
  const isInitialLoading = alertsQuery.isLoading;
  const isFetchingNextPage = alertsQuery.isFetchingNextPage;
  const hasNextPage = alertsQuery.hasNextPage;

  useEffect(() => {
    if (!open || !hasNextPage || isInitialLoading || isFetchingNextPage) {
      return;
    }

    const target = loadMoreRef.current;
    if (!target) {
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          void alertsQuery.fetchNextPage();
        }
      },
      { rootMargin: "240px 0px" },
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [alertsQuery, hasNextPage, isFetchingNextPage, isInitialLoading, open]);

  if (!open) {
    return null;
  }

  return (
    <ResponsiveDialog
      labelledBy={titleId}
      onBackdropClick={onClose}
      contentClassName="sm:max-w-2xl"
    >
      <div className="flex items-start justify-between gap-4 border-b border-border-default px-4 py-4 sm:px-5">
        <div className="min-w-0">
          <h2 id={titleId} className="text-lg font-semibold text-text-primary">
            {title}
          </h2>
          <p className="mt-1 text-sm text-text-secondary">
            {isInitialLoading ? "Đang tải…" : `${totalCount} mục cần xử lý`}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label={`Đóng danh sách ${title}`}
        >
          <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18 18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      <ResponsiveDialogBody className="space-y-2">
        {isInitialLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-16 rounded-md" />
            ))}
          </div>
        ) : alerts.length > 0 ? (
          <>
            {alerts.map((item) => (
              <button
                key={`${group}-${item.targetId}-${item.due ?? item.subject}`}
                type="button"
                onClick={() => onOpenAlert(item)}
                className={`w-full rounded-md border px-3 py-2.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${itemToneClass}`}
              >
                <p className="text-sm font-semibold text-text-primary">{item.subject}</p>
                <p className="mt-0.5 text-xs text-text-secondary">{item.owner ?? item.due}</p>
                <p className="mt-1 text-xs font-medium text-text-primary">
                  {item.detail ?? formatDashboardAlertCurrency(item.amount)}
                </p>
                {!item.detail && item.due ? (
                  <p className="mt-1 text-[11px] text-text-muted">{item.due}</p>
                ) : null}
              </button>
            ))}
            <div ref={loadMoreRef} className="h-1" aria-hidden />
            {isFetchingNextPage ? (
              <p className="py-2 text-center text-xs text-text-muted">Đang tải thêm…</p>
            ) : null}
          </>
        ) : (
          <div className="rounded-md bg-bg-secondary/45 px-3 py-4 text-sm text-text-muted">
            Không có mục cần xử lý.
          </div>
        )}
      </ResponsiveDialogBody>
    </ResponsiveDialog>
  );
}
