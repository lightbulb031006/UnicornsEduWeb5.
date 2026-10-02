"use client";

import type { AdminDashboardActionAlert } from "@/dtos/dashboard.dto";
import {
  formatDashboardAlertCurrency,
  getAlertGroupToneClasses,
  type AlertGroupTone,
} from "./alert-group-styles";

type AlertGroupCardProps = {
  title: string;
  alerts: AdminDashboardActionAlert[];
  totalCount: number;
  tone: AlertGroupTone;
  onOpenAlert: (alert: AdminDashboardActionAlert) => void;
  onViewAll?: () => void;
};

export default function AlertGroupCard({
  title,
  alerts,
  totalCount,
  tone,
  onOpenAlert,
  onViewAll,
}: AlertGroupCardProps) {
  const { toneClass, headerClass, toneDotClass, itemToneClass } =
    getAlertGroupToneClasses(tone);
  const visibleCount = Math.min(alerts.length, totalCount);
  const hasHiddenItems = totalCount > visibleCount;

  return (
    <article className={`rounded-xl border bg-bg-surface p-2.5 ${toneClass}`}>
      <div className={`mb-2 rounded-md border px-2.5 py-2 ${headerClass}`}>
        <div className="flex items-start gap-2">
          <span className={`mt-1 inline-flex size-2 rounded-full ${toneDotClass}`} aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold leading-5">{title}</p>
            <p className="mt-0.5 text-xs opacity-80">{totalCount} mục</p>
            {hasHiddenItems ? (
              <p className="mt-0.5 text-[11px] opacity-70">
                Hiển thị {visibleCount}
              </p>
            ) : null}
          </div>
        </div>
      </div>

      <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
        {alerts.length > 0 ? (
          alerts.map((item) => (
            <button
              key={`${title}-${item.targetId}-${item.due ?? item.subject}`}
              type="button"
              onClick={() => onOpenAlert(item)}
              className={`w-full rounded-md border px-2 py-1.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${itemToneClass}`}
              title="Mở chi tiết"
            >
              <p className="line-clamp-2 text-xs font-semibold text-text-primary">{item.subject}</p>
              <p className="mt-0.5 text-[11px] text-text-secondary">{item.owner ?? item.due}</p>
              <p className="mt-0.5 text-[11px] font-medium text-text-primary">
                {item.detail ?? formatDashboardAlertCurrency(item.amount)}
              </p>
            </button>
          ))
        ) : (
          <div className="rounded-md bg-bg-secondary/45 px-2 py-2 text-xs text-text-muted">
            Không có mục cần xử lý.
          </div>
        )}
      </div>

      {hasHiddenItems && onViewAll ? (
        <button
          type="button"
          onClick={onViewAll}
          className="mt-2 w-full rounded-md border border-border-default bg-bg-surface px-2.5 py-2 text-xs font-medium text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          aria-label={`Xem tất cả cảnh báo ${title}`}
        >
          Xem tất cả ({totalCount})
        </button>
      ) : null}
    </article>
  );
}
