"use client";

import { Suspense, useCallback } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import {
  SegmentedToggle,
  StudentDemographicsContent,
} from "@/components/admin/dashboard/student-demographics/StudentDemographicsContent";
import {
  StudentDemographicsPeriodFilter,
  type StudentDemographicsPeriodValue,
} from "@/components/admin/dashboard/student-demographics/StudentDemographicsPeriodFilter";
import type { StudentDemographicsQueryParams, StudentDemographicsStatus } from "@/dtos/dashboard.dto";
import { buildAdminLikePath, resolveAdminLikeRouteBase } from "@/lib/admin-shell-paths";
import { downloadAdminStudentDemographicsPdf, getAdminStudentDemographics } from "@/lib/apis/dashboard.api";
import { formatVnDateTime } from "@/lib/formatters";

const STATUS_OPTIONS: ReadonlyArray<{ key: StudentDemographicsStatus; label: string }> = [
  { key: "all", label: "Tất cả" },
  { key: "active", label: "Đang học" },
  { key: "inactive", label: "Đã nghỉ" },
];

function getErrorMessage(error: unknown) {
  const message = (error as { response?: { data?: { message?: unknown } } })?.response?.data?.message;
  if (typeof message === "string" && message.trim()) return message;
  if (Array.isArray(message) && typeof message[0] === "string") return message[0];
  if (error instanceof Error && error.message.trim()) return error.message;
  return "Không thể tải số liệu thống kê học sinh.";
}

/** Đọc bộ lọc từ URL: `?status=active&year=2026&month=10` (tháng), `?year=2026` (năm), trống = toàn thời gian. */
function parseFilters(searchParams: URLSearchParams): {
  status: StudentDemographicsStatus;
  period: StudentDemographicsPeriodValue;
} {
  const rawStatus = searchParams.get("status");
  const status: StudentDemographicsStatus =
    rawStatus === "active" || rawStatus === "inactive" ? rawStatus : "all";
  const year = searchParams.get("year");
  const month = searchParams.get("month");
  const validYear = year && /^\d{4}$/.test(year) ? year : undefined;
  const validMonth = month && /^(0[1-9]|1[0-2])$/.test(month) ? month : undefined;
  const period: StudentDemographicsPeriodValue = !validYear
    ? { type: "all" }
    : validMonth
      ? { type: "month", year: validYear, month: validMonth }
      : { type: "year", year: validYear };
  return { status, period };
}

function PageSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 xl:grid-cols-7">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-[84px] rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 2xl:grid-cols-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-56 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-72 rounded-xl" />
    </div>
  );
}

function StudentStatisticsPageInner() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const { status, period } = parseFilters(searchParams);

  const params: StudentDemographicsQueryParams = {
    status,
    ...(period.type !== "all" ? { year: period.year } : {}),
    ...(period.type === "month" ? { month: period.month } : {}),
  };

  const updateFilters = useCallback(
    (next: { status?: StudentDemographicsStatus; period?: StudentDemographicsPeriodValue }) => {
      const nextStatus = next.status ?? status;
      const nextPeriod = next.period ?? period;
      const query = new URLSearchParams();
      if (nextStatus !== "all") query.set("status", nextStatus);
      if (nextPeriod.type !== "all" && nextPeriod.year) query.set("year", nextPeriod.year);
      if (nextPeriod.type === "month" && nextPeriod.month) query.set("month", nextPeriod.month);
      const qs = query.toString();
      router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
    },
    [pathname, period, router, status],
  );

  const demographicsQuery = useQuery({
    queryKey: ["dashboard", "admin", "student-demographics", status, params.year ?? null, params.month ?? null],
    queryFn: () => getAdminStudentDemographics(params),
    staleTime: 30_000,
    placeholderData: (previous) => previous,
  });

  const exportPdfMutation = useMutation({
    mutationFn: (p: StudentDemographicsQueryParams) => downloadAdminStudentDemographicsPdf(p),
    onMutate: () => ({ toastId: toast.loading("Đang tạo file PDF thống kê học sinh…") }),
    onSuccess: ({ blob, filename }, _vars, context) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã tải xong file PDF thống kê học sinh.", { id: context?.toastId });
    },
    onError: (error, _vars, context) => {
      toast.error(getErrorMessage(error), { id: context?.toastId });
    },
  });

  const data = demographicsQuery.data;
  const isRefetching = demographicsQuery.isFetching && !demographicsQuery.isLoading;

  return (
    <div className="min-h-full bg-bg-primary p-4 sm:p-6">
      <div className="mx-auto mb-3 w-full max-w-[1440px]">
        <Link
          href={buildAdminLikePath(routeBase, "dashboard")}
          aria-label="Quay lại Dashboard"
          className="inline-flex min-h-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:px-0 sm:py-0"
        >
          <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          Quay lại Dashboard
        </Link>
      </div>

      <div className="mx-auto w-full max-w-[1440px] space-y-4 rounded-xl border border-border-default bg-bg-surface p-4 sm:p-5">
        <section className="flex flex-col gap-3 border-b border-border-default pb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-lg font-semibold text-text-primary">Thống kê học sinh</h1>
              <p className="mt-1 text-sm text-text-secondary">
                {data?.period.label ?? "…"} · khu vực, độ tuổi, khoá học, doanh thu và lợi nhuận theo khoá.
                {data ? (
                  <span className="text-text-muted"> Số liệu lúc {formatVnDateTime(data.generatedAt)}.</span>
                ) : null}
              </p>
            </div>
            <button
              type="button"
              onClick={() => exportPdfMutation.mutate(params)}
              disabled={exportPdfMutation.isPending || !data}
              className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
            >
              <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              {exportPdfMutation.isPending ? "Đang xuất…" : "Xuất PDF"}
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 lg:grid lg:grid-cols-[1fr_auto_1fr]">
            <StudentDemographicsPeriodFilter
              value={period}
              onChange={(next) => updateFilters({ period: next })}
              disabled={demographicsQuery.isFetching}
            />
            <div className="flex flex-wrap items-center gap-2 lg:justify-self-end">
              {isRefetching ? <span className="text-xs text-text-muted">Đang cập nhật…</span> : null}
              <SegmentedToggle
                ariaLabel="Trạng thái học sinh"
                value={status}
                onChange={(next) => updateFilters({ status: next })}
                options={STATUS_OPTIONS}
              />
            </div>
          </div>
        </section>

        {demographicsQuery.isLoading ? (
          <PageSkeleton />
        ) : demographicsQuery.isError || !data ? (
          <Alert variant="destructive">
            <AlertTitle>Không tải được thống kê học sinh</AlertTitle>
            <AlertDescription>{getErrorMessage(demographicsQuery.error)}</AlertDescription>
          </Alert>
        ) : (
          <div className={isRefetching ? "opacity-60 transition-opacity" : undefined}>
            <StudentDemographicsContent data={data} status={status} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function AdminStudentStatisticsPage() {
  // useSearchParams cần <Suspense>, nếu không Next.js bỏ static render cả route.
  return (
    <Suspense fallback={null}>
      <StudentStatisticsPageInner />
    </Suspense>
  );
}
