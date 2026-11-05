import { Skeleton } from "@/components/ui/skeleton";
import {
  DASHBOARD_CONTAINER,
  DASHBOARD_HEADER_GRID,
  DASHBOARD_KPI_GRID,
  DASHBOARD_PERIOD_GRID,
  DASHBOARD_PERIOD_WIDE_SPAN,
  DASHBOARD_STATUS_GRID,
  DASHBOARD_STATUS_TRAILING_SPAN,
} from "./overview/layout";

const KPI_CARD_COUNT = 4;

function SkeletonLine({ className = "" }: { className?: string }) {
  return <Skeleton className={`bg-bg-tertiary ${className}`} />;
}

/** Header: tiêu đề │ MonthNav │ toggle + nút — khớp `DASHBOARD_HEADER_GRID` của page. */
function DashboardHeaderSkeleton() {
  return (
    <div className={DASHBOARD_HEADER_GRID}>
      <div className="flex flex-col gap-2">
        <SkeletonLine className="h-3 w-32" />
        <SkeletonLine className="h-8 w-56 rounded-md" />
        <SkeletonLine className="h-4 w-72 max-w-full" />
      </div>
      <SkeletonLine className="h-10 w-60 justify-self-center rounded-lg" />
      <div className="flex flex-col gap-2 @5xl:items-end">
        <SkeletonLine className="h-10 w-52 rounded-lg" />
        <div className="grid grid-cols-2 gap-2 sm:flex">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonLine key={`admin-dashboard-action-${index}`} className="h-10 w-full rounded-md sm:w-28" />
          ))}
        </div>
      </div>
    </div>
  );
}

/** Khung panel giống `DashboardPanel`: tiêu đề + mô tả + `rows` dòng. */
export function DashboardPanelSkeleton({
  rows = 4,
  className = "",
}: {
  rows?: number;
  className?: string;
}) {
  return (
    <section
      aria-hidden
      className={`flex min-w-0 flex-col gap-4 rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5 ${className}`}
    >
      <div className="flex flex-col gap-2">
        <SkeletonLine className="h-5 w-40" />
        <SkeletonLine className="h-4 w-64 max-w-full" />
      </div>
      <div className="flex flex-col gap-2">
        {Array.from({ length: rows }).map((_, index) => (
          <SkeletonLine key={`dashboard-panel-row-${index}`} className="h-10 w-full rounded-lg" />
        ))}
      </div>
    </section>
  );
}

function KpiCardSkeleton() {
  return (
    <div
      aria-hidden
      className="flex min-w-0 flex-col gap-2 rounded-2xl border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <SkeletonLine className="h-4 w-28" />
        <SkeletonLine className="h-5 w-14 rounded-full" />
      </div>
      <SkeletonLine className="h-8 w-40" />
      <SkeletonLine className="h-3 w-32" />
    </div>
  );
}

/** 4 KPI — cùng lưới với section "Chỉ số chính". */
export function KpiRowSkeleton() {
  return (
    <div className={DASHBOARD_KPI_GRID}>
      {Array.from({ length: KPI_CARD_COUNT }).map((_, index) => (
        <KpiCardSkeleton key={`admin-dashboard-kpi-${index}`} />
      ))}
    </div>
  );
}

/** Hàng tiền theo kỳ: Kết quả kỳ (1/3) + Cơ cấu chi phí nhân sự (2/3). */
export function PeriodMoneyRowSkeleton() {
  return (
    <div className={DASHBOARD_PERIOD_GRID}>
      <DashboardPanelSkeleton rows={8} />
      <DashboardPanelSkeleton rows={7} className={DASHBOARD_PERIOD_WIDE_SPAN} />
    </div>
  );
}

export function CustomerSourceSectionSkeleton({ className }: { className?: string }) {
  return <DashboardPanelSkeleton rows={4} className={className} />;
}

/** Thân dashboard (dưới header) — dùng khi tháng mới chưa có dữ liệu. */
export function AdminDashboardBodySkeleton() {
  return (
    <div className="flex flex-col gap-4 sm:gap-5" aria-busy="true" role="status">
      <span className="sr-only">Đang tải số liệu dashboard…</span>
      <KpiRowSkeleton />
      <PeriodMoneyRowSkeleton />
      <div className={DASHBOARD_STATUS_GRID}>
        <DashboardPanelSkeleton rows={3} />
        <DashboardPanelSkeleton rows={5} />
        <CustomerSourceSectionSkeleton className={DASHBOARD_STATUS_TRAILING_SPAN} />
      </div>
      <DashboardPanelSkeleton rows={5} />
    </div>
  );
}

type AdminDashboardSkeletonProps = {
  /** Header only — profile gate before dashboard query starts. */
  variant?: "full" | "profile-gate";
};

/** Skeleton cả trang (route `loading.tsx`, profile gate) — cùng khung với page. */
export function AdminDashboardSkeleton({
  variant = "full",
}: AdminDashboardSkeletonProps) {
  return (
    <div
      className="min-h-full bg-bg-primary px-4 pb-10 pt-4 sm:p-6"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">Đang tải dashboard…</span>
      <div className={DASHBOARD_CONTAINER}>
        <DashboardHeaderSkeleton />
        {variant === "full" ? <AdminDashboardBodySkeleton /> : null}
      </div>
    </div>
  );
}

export function AdminDashboardFinancialDetailSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-live="polite">
      <div className="rounded-2xl border border-primary/15 bg-primary/8 p-4">
        <SkeletonLine className="h-3 w-20" />
        <SkeletonLine className="mt-3 h-9 w-40" />
        <SkeletonLine className="mt-3 h-4 w-full max-w-xl" />
        <SkeletonLine className="mt-2 h-4 w-4/5 max-w-lg" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`admin-dashboard-detail-source-${index}`}
            className="rounded-xl border border-border-default bg-bg-secondary/35 p-4"
          >
            <SkeletonLine className="h-4 w-28" />
            <SkeletonLine className="mt-3 h-7 w-32" />
            <SkeletonLine className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
      <div className="overflow-hidden rounded-xl border border-border-default">
        <div className="grid grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1fr)] gap-3 border-b border-border-default bg-bg-secondary/50 px-4 py-3">
          <SkeletonLine className="h-3 w-24" />
          <SkeletonLine className="h-3 w-16" />
          <SkeletonLine className="h-3 w-20" />
        </div>
        <div className="divide-y divide-border-default/80">
          {Array.from({ length: 5 }).map((_, index) => (
            <div
              key={`admin-dashboard-detail-row-${index}`}
              className="grid grid-cols-[minmax(0,1.2fr)_120px_minmax(0,1fr)] gap-3 px-4 py-3"
            >
              <div className="space-y-2">
                <SkeletonLine className="h-4 w-40 max-w-full" />
                <SkeletonLine className="h-3 w-28" />
              </div>
              <SkeletonLine className="h-4 w-20" />
              <SkeletonLine className="h-4 w-full" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function AdminDashboardRefreshStrip({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border border-primary/15 bg-primary/8 px-3 py-2 text-xs font-medium text-primary">
      <span
        className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-primary/25 border-t-primary"
        aria-hidden
      />
      <span>{label}</span>
    </div>
  );
}
