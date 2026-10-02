import { Skeleton } from "@/components/ui/skeleton";

const KPI_CARD_COUNT = 6;
const FINANCIAL_ROW_COUNT = 9;
const ALERT_GROUP_COUNT = 4;
const QUICK_VIEW_CARD_COUNT = 4;

function SkeletonLine({ className = "" }: { className?: string }) {
  return <Skeleton className={`bg-bg-tertiary ${className}`} />;
}

function DashboardToolbarSkeleton() {
  return (
    <section className="flex flex-col gap-3 border-b border-border-default pb-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2">
          <SkeletonLine className="h-3 w-36" />
          <SkeletonLine className="h-9 w-52 rounded-md" />
          <SkeletonLine className="h-9 w-56 rounded-md" />
        </div>
        <div className="flex items-center gap-2">
          <SkeletonLine className="h-10 w-24 rounded-md" />
          <SkeletonLine className="h-10 w-28 rounded-md" />
        </div>
      </div>
    </section>
  );
}

function KpiCardSkeleton() {
  return (
    <div className="relative overflow-hidden rounded-xl border border-border-default bg-bg-surface px-3 py-3 shadow-sm">
      <SkeletonLine className="absolute bottom-0 left-0 top-0 w-1 rounded-full" />
      <div className="space-y-2 pl-2">
        <SkeletonLine className="h-3 w-24" />
        <SkeletonLine className="h-8 w-28" />
        <SkeletonLine className="h-3 w-full max-w-[12rem]" />
      </div>
    </div>
  );
}

function KpiCardsSkeleton() {
  return (
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: KPI_CARD_COUNT }).map((_, index) => (
        <KpiCardSkeleton key={`admin-dashboard-kpi-${index}`} />
      ))}
    </section>
  );
}

function FinancialReportMobileSkeleton() {
  return (
    <div className="space-y-3 border-t border-border-default p-4 md:hidden">
      {Array.from({ length: FINANCIAL_ROW_COUNT }).map((_, index) => (
        <article
          key={`admin-dashboard-financial-mobile-${index}`}
          className="rounded-xl border border-border-default bg-bg-surface px-4 py-3 shadow-sm"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonLine className="h-3 w-16" />
              <SkeletonLine className="h-4 w-40 max-w-full" />
            </div>
            <div className="space-y-2 text-right">
              <SkeletonLine className="ml-auto h-3 w-12" />
              <SkeletonLine className="ml-auto h-5 w-24" />
            </div>
          </div>
          <div className="mt-3 space-y-2 border-t border-border-default/70 pt-3">
            <SkeletonLine className="h-3 w-14" />
            <SkeletonLine className="h-4 w-full" />
            <SkeletonLine className="h-4 w-5/6" />
          </div>
        </article>
      ))}
    </div>
  );
}

function FinancialReportTableSkeleton() {
  return (
    <div className="hidden overflow-x-auto border-t border-border-default md:block">
      <div className="min-w-[720px]">
        <div className="grid grid-cols-[minmax(200px,1.1fr)_140px_minmax(260px,1.4fr)] gap-3 border-b border-border-default px-5 py-3.5 sm:px-6">
          <SkeletonLine className="h-3 w-20" />
          <SkeletonLine className="h-3 w-14" />
          <SkeletonLine className="h-3 w-16" />
        </div>
        <div className="divide-y divide-border-default/80">
          {Array.from({ length: FINANCIAL_ROW_COUNT }).map((_, index) => (
            <div
              key={`admin-dashboard-financial-row-${index}`}
              className="grid grid-cols-[minmax(200px,1.1fr)_140px_minmax(260px,1.4fr)] gap-3 px-5 py-4 sm:px-6"
            >
              <SkeletonLine className="h-4 w-44 max-w-full" />
              <SkeletonLine className="h-4 w-24" />
              <div className="space-y-2">
                <SkeletonLine className="h-4 w-full" />
                <SkeletonLine className="h-4 w-4/5" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function CustomerSourceSectionSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-sm" aria-hidden>
      <div className="space-y-2 px-5 py-4 sm:px-6 sm:py-5">
        <SkeletonLine className="h-5 w-36" />
        <SkeletonLine className="h-4 w-72 max-w-full" />
      </div>
      <div className="space-y-3 border-t border-border-default p-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <SkeletonLine key={`customer-source-skeleton-${index}`} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </section>
  );
}

export function AdminDashboardFinancialReportSkeleton() {
  return (
    <section className="overflow-hidden rounded-xl border border-border-default bg-bg-surface shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-4 sm:px-6 sm:py-5">
        <SkeletonLine className="h-5 w-40" />
        <SkeletonLine className="h-7 w-36 rounded-full" />
      </div>
      <FinancialReportMobileSkeleton />
      <FinancialReportTableSkeleton />
    </section>
  );
}

function AlertGroupCardSkeleton() {
  return (
    <article className="rounded-xl border border-border-default bg-bg-surface p-2.5">
      <div className="mb-2 rounded-md border border-border-default bg-bg-secondary/40 px-2.5 py-2">
        <div className="flex items-start gap-2">
          <SkeletonLine className="mt-1 size-2 shrink-0 rounded-full" />
          <div className="min-w-0 flex-1 space-y-2">
            <SkeletonLine className="h-4 w-36" />
            <SkeletonLine className="h-3 w-16" />
          </div>
        </div>
      </div>
      <div className="space-y-1.5">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonLine
            key={`admin-dashboard-alert-item-${index}`}
            className="h-14 w-full rounded-md"
          />
        ))}
      </div>
      <SkeletonLine className="mt-2 h-9 w-full rounded-md" />
    </article>
  );
}

function AlertGroupsSkeleton() {
  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-4">
      <div className="mb-3 flex items-center gap-2">
        <SkeletonLine className="size-4 rounded-full" />
        <SkeletonLine className="h-5 w-44" />
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: ALERT_GROUP_COUNT }).map((_, index) => (
          <AlertGroupCardSkeleton key={`admin-dashboard-alert-group-${index}`} />
        ))}
      </div>
    </section>
  );
}

function QuickViewSkeleton() {
  return (
    <section className="rounded-xl border border-border-default bg-bg-surface p-4">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SkeletonLine className="h-5 w-56 max-w-full" />
        <div className="flex items-center gap-2">
          <SkeletonLine className="h-4 w-10" />
          <SkeletonLine className="h-9 w-[120px] rounded-md" />
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <SkeletonLine key={`admin-dashboard-quick-tab-${index}`} className="h-9 w-24 rounded-md" />
        ))}
      </div>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: QUICK_VIEW_CARD_COUNT }).map((_, index) => (
          <div
            key={`admin-dashboard-quick-card-${index}`}
            className="rounded-lg border border-border-default bg-bg-secondary/25 p-4"
          >
            <SkeletonLine className="h-4 w-28" />
            <SkeletonLine className="mt-3 h-8 w-24" />
            <SkeletonLine className="mt-2 h-3 w-full" />
          </div>
        ))}
      </div>
    </section>
  );
}

type AdminDashboardSkeletonProps = {
  /** Toolbar only — profile gate before dashboard query starts. */
  variant?: "full" | "profile-gate";
};

export function AdminDashboardSkeleton({
  variant = "full",
}: AdminDashboardSkeletonProps) {
  return (
    <div
      className="min-h-full bg-bg-primary p-4 sm:p-6"
      aria-busy="true"
      aria-live="polite"
      role="status"
    >
      <span className="sr-only">Đang tải dashboard…</span>
      <div className="mx-auto w-full max-w-[1320px] space-y-4 rounded-xl border border-border-default bg-bg-surface p-4 sm:p-5">
        <DashboardToolbarSkeleton />
        {variant === "full" ? (
          <>
            <KpiCardsSkeleton />
            <AdminDashboardFinancialReportSkeleton />
            <CustomerSourceSectionSkeleton />
            <AlertGroupsSkeleton />
            <QuickViewSkeleton />
          </>
        ) : null}
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
