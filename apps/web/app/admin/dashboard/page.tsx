"use client";

import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
import { useGiftedLessonPlanEnabled } from "@/lib/gifted-lesson-plan";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import MonthNav from "@/components/admin/MonthNav";
import { usePathname, useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { DateInput } from "@/components/ui/DateInput";
import {
  downloadAdminDashboardFinancialExportExcel,
  downloadAdminDashboardFinancialExportPdf,
  getAdminDashboard,
  getAdminDashboardFinancialDetail,
} from "@/lib/apis/dashboard.api";
import { getFullProfile } from "@/lib/apis/auth.api";
import { formatMonthPartsLabel } from "@/lib/month-format";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import {
  AdminDashboardBodySkeleton,
  AdminDashboardRefreshStrip,
  AdminDashboardSkeleton,
  CustomerSourceSectionSkeleton,
  KpiRowSkeleton,
  PeriodMoneyRowSkeleton,
} from "@/components/admin/dashboard/AdminDashboardSkeleton";
import { DashboardIcon } from "@/components/admin/dashboard/DashboardIcon";
import { CustomerSourceSection } from "@/components/admin/dashboard/CustomerSourceSection";
import { StudentDemographicsSection } from "@/components/admin/dashboard/StudentDemographicsSection";
import { ActiveClassBreakdownDialog } from "@/components/admin/dashboard/ActiveClassBreakdownDialog";
import {
  FinancialDetailModal,
  type FinancialDetailTabConfig,
} from "@/components/admin/dashboard/FinancialDetailModal";
import { StudentChurnDetailModal } from "@/components/admin/dashboard/StudentChurnDetailModal";
import { BalanceSnapshotCard } from "@/components/admin/dashboard/overview/BalanceSnapshotCard";
import { AmountRowButton, DashboardPanel } from "@/components/admin/dashboard/overview/DashboardPanel";
import {
  KpiDeltaHint,
  KpiStatCard,
  computeCountDelta,
  computeDelta,
} from "@/components/admin/dashboard/overview/KpiStatCard";
import {
  getSameDayComparison,
  type ComparisonRange,
} from "@/components/admin/dashboard/overview/comparison";
import {
  PERSONNEL_SOURCE_KEYS,
  PersonnelCostBreakdown,
  getPersonnelBreakdownItems,
} from "@/components/admin/dashboard/overview/PersonnelCostBreakdown";
import {
  DASHBOARD_CONTAINER,
  DASHBOARD_HEADER_GRID,
  DASHBOARD_KPI_GRID,
  DASHBOARD_PERIOD_GRID,
  DASHBOARD_STATUS_GRID,
} from "@/components/admin/dashboard/overview/layout";
import { StudentClassSection } from "@/components/admin/dashboard/overview/StudentClassSection";
import {
  YearQuarterSection,
  type QuarterMetric,
  type YearRange,
} from "@/components/admin/dashboard/overview/YearQuarterSection";
import {
  formatCurrency,
  formatShare,
  getErrorMessage,
} from "@/components/admin/dashboard/overview/format";
import type {
  AdminDashboardCustomerSourceRow,
  AdminDashboardDto,
  AdminDashboardSummary,
  AdminDashboardFinancialDetailRowKey,
  AdminDashboardStudentChurnType,
} from "@/dtos/dashboard.dto";
import { toast } from "sonner";
import { formatVnInteger } from "@/lib/formatters";
import { ChartColumn, FileChartColumn, FileDown, FileSpreadsheet, Users } from "lucide-react";

const toolbarButtonBaseClass =
  "inline-flex min-h-10 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto";
const toolbarSecondaryClass = `${toolbarButtonBaseClass} border border-border-default bg-bg-surface text-text-primary hover:bg-bg-secondary`;
const toolbarPrimaryClass = `${toolbarButtonBaseClass} bg-primary text-text-inverse hover:bg-primary-hover`;

/** Dashboard theo khoảng ngày — cùng query key với chế độ Khoảng ngày nên dùng chung cache. */
function useRangeDashboardQuery(range: ComparisonRange | null, enabled: boolean) {
  return useQuery<AdminDashboardDto>({
    queryKey: ["dashboard", "admin", "range", range?.dateFrom, range?.dateTo],
    queryFn: () =>
      getAdminDashboard({
        dateFrom: range!.dateFrom,
        dateTo: range!.dateTo,
        alertLimit: 1,
        topClassLimit: 1,
      }),
    enabled: enabled && range != null,
    staleTime: 60_000,
  });
}

function getBreakdownAmount(dashboard: AdminDashboardDto, key: string) {
  return dashboard.breakdown.find((item) => item.key === key)?.amount ?? 0;
}

const SNAPSHOT_FINANCIAL_ROW_KEYS = new Set<AdminDashboardFinancialDetailRowKey>([
  "prepaid",
  "uncollected",
  "pending-payroll",
]);

const FINANCIAL_ROW_LABELS: Record<Exclude<AdminDashboardFinancialDetailRowKey, "customer-source">, string> = {
  topup: "Tổng nạp (Dòng tiền vào)",
  revenue: "Học phí đã học (Doanh thu)",
  prepaid: "Học phí chưa dạy (Ví dương)",
  uncollected: "Học phí chưa thu (Ví âm)",
  "pending-payroll": "Trợ cấp chờ thanh toán",
  "personnel-cost": "Chi phí Nhân sự",
  "other-cost": "Chi phí Khác",
  profit: "Lợi nhuận thực tế (Kế toán)",
  "total-in": "Dòng tiền thuần (Thực thu ròng)",
};

const EXPENSE_TABS: FinancialDetailTabConfig[] = [
  { key: "personnel", label: "Chi phí nhân sự", rowKey: "personnel-cost" },
  { key: "other", label: "Chi phí khác", rowKey: "other-cost" },
];

/** Chi tiết đóng góp đang mở: 1 dòng tài chính (kèm lọc nguồn) hoặc 1 nguồn khách. */
type FinancialSelection =
  | { kind: "row"; rowKey: Exclude<AdminDashboardFinancialDetailRowKey, "customer-source">; label?: string; sourceKeys?: string[] }
  | { kind: "customer-source"; sourceKey: AdminDashboardCustomerSourceRow["key"] };

/** Drill-down theo quý / năm: tự fetch theo dateFrom–dateTo (tabbed mode). */
type RangeSelection = { metric: QuarterMetric; range: YearRange };

function getPersonnelCostFromBreakdown(dashboard: AdminDashboardDto) {
  return getPersonnelBreakdownItems(dashboard.breakdown).reduce((sum, item) => sum + item.amount, 0);
}

function AssistantDashboardRedirect({
  staffId,
}: {
  staffId?: string;
}) {
  const { replace } = useRouter();
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);

  useEffect(() => {
    if (staffId) {
      replace(
        buildAdminLikePath(routeBase, `staffs/${encodeURIComponent(staffId)}`),
      );
      return;
    }

    replace("/user-profile");
  }, [routeBase, replace, staffId]);

  return (
    <div className="min-h-full bg-bg-primary p-4 sm:p-6">
      <div className="mx-auto w-full max-w-[1020px]">
        <section className="overflow-hidden rounded-[1.75rem] border border-primary/20 bg-bg-surface shadow-sm">
          <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1.1fr)_minmax(280px,0.9fr)] lg:items-end">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-primary/80">
                Trưởng phòng Sale & CSKH
              </p>
              <h1 className="mt-3 max-w-2xl text-2xl font-semibold tracking-[-0.03em] text-text-primary sm:text-3xl">
                Đang mở hồ sơ nhân sự thay cho dashboard tổng hợp.
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
                Dashboard tổng hợp chỉ dành cho Admin, nên route dashboard sẽ tự chuyển sang
                trang chi tiết nhân sự của chính bạn để tránh hiển thị dashboard tổng hợp của admin.
              </p>
            </div>

            <div className="grid gap-3 rounded-[1.25rem] border border-primary/15 bg-bg-surface/80 p-4 backdrop-blur">
              <div className="rounded-xl border border-border-default bg-bg-secondary/35 p-3">
                <p className="text-xs uppercase tracking-[0.22em] text-text-muted">
                  Điều hướng
                </p>
                <div className="mt-2 h-2 w-28 animate-pulse rounded-full bg-primary/20" />
              </div>
              <div className="rounded-xl border border-border-default bg-bg-secondary/35 p-3">
                <p className="text-xs uppercase tracking-[0.22em] text-text-muted">
                  Đang chuyển
                </p>
                <div className="mt-2 h-2 w-36 animate-pulse rounded-full bg-primary/20" />
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div className="min-h-full bg-bg-primary p-4 sm:p-6">
      <div className="mx-auto w-full max-w-[960px]">
        <Alert variant="destructive">
          <DashboardIcon path="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          <AlertTitle>{title}</AlertTitle>
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      </div>
    </div>
  );
}

export default function AdminDashboardTabPage() {
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);

  const giftedLessonPlanEnabled = useGiftedLessonPlanEnabled();
  const fullProfileQuery = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const profileData = fullProfileQuery.data;

  const isAssistantStaff =
    profileData?.roleType === "staff" &&
    hasSaleCsHeadAccess(profileData.staffInfo?.roles);
  const assistantStaffId = profileData?.staffInfo?.id ?? "";

  const defaultPeriod = useMemo(() => {
    const now = new Date();
    return {
      month: String(now.getMonth() + 1).padStart(2, "0"),
      year: String(now.getFullYear()),
    };
  }, []);
  const [month, setMonth] = useState(defaultPeriod.month);
  const [year, setYear] = useState(defaultPeriod.year);
  const [financialSelection, setFinancialSelection] = useState<FinancialSelection | null>(null);
  const [rangeSelection, setRangeSelection] = useState<RangeSelection | null>(null);
  const [studentChurnTab, setStudentChurnTab] = useState<AdminDashboardStudentChurnType | null>(null);
  const [classBreakdownOpen, setClassBreakdownOpen] = useState(false);

  // Date-range mode state
  const [viewMode, setViewMode] = useState<"month" | "range">("month");
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const defaultDateRange = useMemo(() => {
    const now = new Date();
    const to = now.toISOString().slice(0, 10);
    const fromDate = new Date(now);
    fromDate.setDate(fromDate.getDate() - 29);
    const from = fromDate.toISOString().slice(0, 10);
    return { from, to };
  }, []);
  const [dateFrom, setDateFrom] = useState(defaultDateRange.from);
  const [dateTo, setDateTo] = useState(defaultDateRange.to);

  const isRangeMode = viewMode === "range";
  const canLoadDashboard = fullProfileQuery.isSuccess && !isAssistantStaff;

  const dashboardQuery = useQuery<AdminDashboardDto>({
    queryKey: ["dashboard", "admin", year, month],
    queryFn: () =>
      getAdminDashboard({
        month,
        year,
        alertLimit: 1,
        topClassLimit: 8,
      }),
    enabled: canLoadDashboard,
    staleTime: 30_000,
  });

  // Range mode: chỉ các khối tiền theo kỳ dùng query này; cảnh báo / học sinh vẫn theo tháng.
  const rangeFinancialQuery = useQuery<AdminDashboardDto>({
    queryKey: ["dashboard", "admin", "range", dateFrom, dateTo],
    queryFn: () =>
      getAdminDashboard({
        dateFrom,
        dateTo,
        alertLimit: 1,
        topClassLimit: 1,
      }),
    enabled: canLoadDashboard && isRangeMode,
    staleTime: 30_000,
  });

  // Delta KPI so với cùng ngày tháng trước: tháng hiện tại 1–hôm nay vs 1–cùng ngày tháng trước;
  // tháng đã qua thì trọn tháng vs trọn tháng trước (kỳ hiện tại lấy luôn dashboardQuery).
  const comparison = useMemo(() => getSameDayComparison(month, year), [month, year]);
  const isCurrentMonthComparison = Boolean(comparison?.isCurrentMonth);
  const compareCurrentQuery = useRangeDashboardQuery(
    comparison?.current ?? null,
    canLoadDashboard && !isRangeMode && isCurrentMonthComparison,
  );
  const comparePreviousQuery = useRangeDashboardQuery(comparison?.previous ?? null, canLoadDashboard && !isRangeMode);
  // Học sinh: số vào − số nghỉ trong cửa sổ (cùng ngày tháng trước, hôm nay].
  const studentWindowQuery = useRangeDashboardQuery(
    comparison?.studentWindow ?? null,
    canLoadDashboard && isCurrentMonthComparison,
  );

  const selectedRowKey: AdminDashboardFinancialDetailRowKey | null =
    financialSelection == null
      ? null
      : financialSelection.kind === "row"
        ? financialSelection.rowKey
        : "customer-source";
  const selectedCustomerSource =
    financialSelection?.kind === "customer-source" ? financialSelection.sourceKey : null;
  const useRangeDetail =
    isRangeMode && selectedRowKey != null && !SNAPSHOT_FINANCIAL_ROW_KEYS.has(selectedRowKey);

  const financialDetailQuery = useQuery({
    queryKey: [
      "dashboard", "admin", "financial-detail", selectedRowKey, selectedCustomerSource,
      useRangeDetail ? dateFrom : year,
      useRangeDetail ? dateTo : month,
    ],
    queryFn: () =>
      getAdminDashboardFinancialDetail({
        rowKey: selectedRowKey!,
        ...(useRangeDetail ? { dateFrom, dateTo } : { month, year }),
        limit: 500,
        ...(selectedCustomerSource ? { customerSource: selectedCustomerSource } : {}),
      }),
    enabled: canLoadDashboard && selectedRowKey != null,
    staleTime: 20_000,
  });

  const triggerBlobDownload = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const exportFinancialPdfMutation = useMutation({
    mutationFn: () =>
      downloadAdminDashboardFinancialExportPdf(
        isRangeMode ? { dateFrom, dateTo } : { month, year },
      ),
    onMutate: () => ({ toastId: toast.loading("Đang chuẩn bị báo cáo PDF…") }),
    onSuccess: ({ blob, filename }, _vars, context) => {
      triggerBlobDownload(blob, filename);
      toast.success("Đã tải báo cáo PDF.", { id: context?.toastId });
    },
    onError: (error, _vars, context) => {
      const message =
        error instanceof Error ? error.message : "Không xuất được báo cáo PDF.";
      toast.error(message, { id: context?.toastId });
    },
  });

  const exportFinancialExcelMutation = useMutation({
    mutationFn: () =>
      downloadAdminDashboardFinancialExportExcel(
        isRangeMode ? { dateFrom, dateTo } : { month, year },
      ),
    onMutate: () => ({ toastId: toast.loading("Đang chuẩn bị báo cáo Excel…") }),
    onSuccess: ({ blob, filename }, _vars, context) => {
      triggerBlobDownload(blob, filename);
      toast.success("Đã tải báo cáo Excel.", { id: context?.toastId });
    },
    onError: (error, _vars, context) => {
      const message =
        error instanceof Error
          ? error.message
          : "Không xuất được báo cáo Excel.";
      toast.error(message, { id: context?.toastId });
    },
  });

  if (fullProfileQuery.isLoading) {
    return <AdminDashboardSkeleton variant="profile-gate" />;
  }

  if (isAssistantStaff) {
    return <AssistantDashboardRedirect staffId={assistantStaffId} />;
  }

  if (fullProfileQuery.isError) {
    return (
      <ErrorState
        title="Không xác nhận được hồ sơ truy cập"
        message="Không tải được hồ sơ người dùng để xác định quyền dashboard."
      />
    );
  }

  const periodLabel = isRangeMode
    ? (rangeFinancialQuery.data?.period.monthLabel ?? `${dateFrom} – ${dateTo}`)
    : formatMonthPartsLabel(month, year);

  // Header luôn giữ nguyên khi đổi tháng — chỉ phần thân hiện skeleton, tránh chớp cả trang.
  const headerNode = (
    <>
      <header className={DASHBOARD_HEADER_GRID}>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.08em] text-text-secondary">
            Quản trị · Tổng quan
          </p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-text-primary sm:text-[1.75rem]">
            Dashboard tổng hợp
          </h1>
          <p className="mt-1 text-sm text-text-secondary">
            Số liệu theo kỳ: <strong className="text-text-primary">{periodLabel}</strong> · bấm vào bất kỳ con số nào để xem các khoản đóng góp
          </p>
        </div>

        {/* Khoảng ngày: ẩn MonthNav, giữ ô trống để cột phải không dồn vào giữa. */}
        {isRangeMode ? (
          <div className="hidden @5xl:block" aria-hidden />
        ) : (
          <MonthNav
            value={`${year}-${month}`}
            onChange={(value) => {
              const [nextYear, nextMonth] = value.split("-");
              setYear(nextYear);
              setMonth(nextMonth);
            }}
            monthPopupOpen={monthPopupOpen}
            setMonthPopupOpen={setMonthPopupOpen}
          />
        )}

        <div className="flex flex-col gap-2 @5xl:items-end">
          <div className="flex flex-wrap items-center gap-2 @5xl:justify-end">
            <div role="group" aria-label="Chế độ xem kỳ" className="inline-flex w-fit rounded-lg bg-bg-tertiary p-0.5">
              {(
                [
                  { key: "month", label: "Theo tháng" },
                  { key: "range", label: "Khoảng ngày" },
                ] as const
              ).map((item) => (
                <button
                  key={item.key}
                  type="button"
                  aria-pressed={viewMode === item.key}
                  onClick={() => setViewMode(item.key)}
                  className={`min-h-9 rounded-md px-3 text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                    viewMode === item.key
                      ? "bg-bg-surface text-text-primary shadow-sm"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
            {isRangeMode ? (
              <div className="flex flex-wrap items-center gap-2 @5xl:justify-end">
                <label htmlFor="dateFrom" className="text-xs text-text-muted whitespace-nowrap">Từ</label>
                <DateInput
                  id="dateFrom"
                  value={dateFrom}
                  max={dateTo}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="h-10 rounded-lg border border-border-default bg-bg-surface px-2.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
                <label htmlFor="dateTo" className="text-xs text-text-muted whitespace-nowrap">Đến</label>
                <DateInput
                  id="dateTo"
                  value={dateTo}
                  min={dateFrom}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="h-10 rounded-lg border border-border-default bg-bg-surface px-2.5 text-sm text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </div>
            ) : null}
          </div>

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap @5xl:justify-end">
            <Link href={buildAdminLikePath(routeBase, "monthly-report")} className={toolbarSecondaryClass}>
              <FileChartColumn className="size-4 shrink-0" aria-hidden />
              Báo cáo tháng
            </Link>
            <Link href={buildAdminLikePath(routeBase, "dashboard/statistics")} className={toolbarSecondaryClass}>
              <ChartColumn className="size-4 shrink-0" aria-hidden />
              Thống kê năm
            </Link>
            <Link
              href={buildAdminLikePath(routeBase, "student-statistics")}
              className={toolbarSecondaryClass}
              title="Thống kê học sinh theo khu vực, độ tuổi, khoá học, doanh thu và lợi nhuận (xuất PDF trong trang)"
            >
              <Users className="size-4 shrink-0" aria-hidden />
              Thống kê theo học sinh
            </Link>
            <button
              type="button"
              onClick={() => {
                if (exportFinancialPdfMutation.isPending) return;
                exportFinancialPdfMutation.mutate();
              }}
              disabled={exportFinancialPdfMutation.isPending}
              aria-busy={exportFinancialPdfMutation.isPending}
              className={toolbarSecondaryClass}
            >
              <FileDown className="size-4 shrink-0" aria-hidden />
              {exportFinancialPdfMutation.isPending ? "Đang xuất…" : "Xuất PDF"}
            </button>
            <button
              type="button"
              onClick={() => {
                if (exportFinancialExcelMutation.isPending) return;
                exportFinancialExcelMutation.mutate();
              }}
              disabled={exportFinancialExcelMutation.isPending}
              aria-busy={exportFinancialExcelMutation.isPending}
              className={toolbarPrimaryClass}
            >
              <FileSpreadsheet className="size-4 shrink-0" aria-hidden />
              {exportFinancialExcelMutation.isPending ? "Đang xuất…" : "Xuất Excel"}
            </button>
          </div>
        </div>
      </header>

      {isRangeMode ? (
        <p className="text-xs text-text-muted">
          Khoảng ngày áp dụng cho các khối tiền theo kỳ. Học sinh &amp; lớp và Năm theo quý vẫn theo {formatMonthPartsLabel(month, year).toLowerCase()} (đổi tháng ở chế độ Theo tháng).
          Bonus tính trọn tháng thưởng: mọi tháng giao với khoảng ngày đã chọn đều được lấy đủ.
        </p>
      ) : null}
    </>
  );

  const renderShell = (body: ReactNode) => (
    <div className="min-h-full bg-bg-primary px-4 pb-10 pt-4 sm:p-6">
      <div className={DASHBOARD_CONTAINER}>
        {headerNode}
        {body}
      </div>
    </div>
  );

  if (dashboardQuery.isPending) return renderShell(<AdminDashboardBodySkeleton />);

  if (dashboardQuery.isError || !dashboardQuery.data) {
    return (
      <ErrorState
        title="Dashboard chưa tải được dữ liệu"
        message={getErrorMessage(dashboardQuery.error, "Không thể tải dashboard từ dữ liệu thật.")}
      />
    );
  }

  const dashboard = dashboardQuery.data;
  const summary = dashboard.summary;

  // Period metrics: range query in range mode; month dashboard otherwise
  const periodDashboard =
    isRangeMode && rangeFinancialQuery.data ? rangeFinancialQuery.data : dashboard;
  const periodSummary = periodDashboard.summary;

  const personnelItems = getPersonnelBreakdownItems(periodDashboard.breakdown);
  const personnelCost = getPersonnelCostFromBreakdown(periodDashboard);
  const otherCost = getBreakdownAmount(periodDashboard, "operatingCost");
  const totalReceiveNet = periodSummary.monthlyTopupTotal - personnelCost - otherCost;
  const revenue = periodSummary.totalLearnedTuition;
  const profit = periodSummary.monthlyProfit;

  const isMonthDashboardRefreshing =
    dashboardQuery.isFetching && Boolean(dashboardQuery.data);
  const isRangeInitialLoading =
    isRangeMode && rangeFinancialQuery.isLoading && !rangeFinancialQuery.data;
  const isRangeRefreshing =
    isRangeMode && rangeFinancialQuery.isFetching && Boolean(rangeFinancialQuery.data);
  const dimPeriodBlocks =
    isRangeInitialLoading || isRangeRefreshing || (!isRangeMode && isMonthDashboardRefreshing);

  // Delta tiền chỉ ở chế độ tháng — khoảng ngày không có kỳ trước tương ứng.
  const comparisonCurrent = isCurrentMonthComparison ? compareCurrentQuery.data?.summary : summary;
  const comparisonPrevious = comparePreviousQuery.data?.summary;
  const moneyDelta = (pick: (value: AdminDashboardSummary) => number) =>
    !isRangeMode && comparisonCurrent && comparisonPrevious
      ? computeDelta(pick(comparisonCurrent), pick(comparisonPrevious))
      : null;
  const studentChurn = isCurrentMonthComparison ? studentWindowQuery.data?.summary : summary;
  const studentNetChange =
    comparison && studentChurn
      ? // Thử nghỉ chưa từng là học sinh thực sự của trung tâm → không trừ vào biến động.
        studentChurn.newStudentsThisMonth - studentChurn.droppedStudentsThisMonth
      : null;
  // Giải thích badge delta: so cùng ngày tháng trước, kèm số hai kỳ để tự đối chiếu.
  const moneyHint = (name: string, pick: (value: AdminDashboardSummary) => number) =>
    comparison && comparisonCurrent && comparisonPrevious ? (
      <KpiDeltaHint
        summary={`% ${name.toLowerCase()} tăng/giảm so với cùng kỳ tháng trước (${comparison.currentLabel} so với ${comparison.previousLabel}).`}
        rows={[
          { label: `Kỳ này (${comparison.currentLabel})`, value: formatCurrency(pick(comparisonCurrent)) },
          { label: `Kỳ trước (${comparison.previousLabel})`, value: formatCurrency(pick(comparisonPrevious)) },
        ]}
      />
    ) : undefined;
  const studentHint =
    comparison && studentChurn ? (
      <KpiDeltaHint
        summary={`Số học sinh đang học tăng/giảm bao nhiêu trong 1 tháng gần nhất (${comparison.studentWindowLabel}) = mới vào − cũ nghỉ (thử nghỉ không tính).`}
        rows={[
          { label: "Mới vào", value: `+${formatVnInteger(studentChurn.newStudentsThisMonth)}` },
          { label: "Cũ nghỉ", value: `−${formatVnInteger(studentChurn.droppedStudentsThisMonth)}` },
          { label: "Thử nghỉ (không tính)", value: formatVnInteger(studentChurn.trialDroppedStudentsThisMonth) },
        ]}
      />
    ) : undefined;

  const openRow = (
    rowKey: Exclude<AdminDashboardFinancialDetailRowKey, "customer-source">,
    options?: { label?: string; sourceKeys?: string[] },
  ) => setFinancialSelection({ kind: "row", rowKey, ...options });

  const openQuarter = (metric: QuarterMetric, range: YearRange) => setRangeSelection({ metric, range });

  const financialModalLabel =
    financialSelection?.kind === "row"
      ? (financialSelection.label ?? FINANCIAL_ROW_LABELS[financialSelection.rowKey])
      : financialSelection?.kind === "customer-source"
        ? (periodDashboard.customerSources?.find((row) => row.key === financialSelection.sourceKey)?.label ??
          "Nguồn khách mới")
        : "";

  const profitMargin = revenue > 0 ? formatShare(profit, revenue) : "—";
  const personnelShare = revenue > 0 ? formatShare(personnelCost, revenue) : "—";

  return renderShell(
    <>
        {isMonthDashboardRefreshing || isRangeRefreshing ? (
          <AdminDashboardRefreshStrip
            label={isRangeMode ? "Đang cập nhật số liệu theo khoảng ngày…" : "Đang cập nhật số liệu theo tháng đang chọn…"}
          />
        ) : null}

        {/* Khoảng ngày mới chưa có số → skeleton thay vì hiện tạm số của tháng. */}
        {isRangeInitialLoading ? (
          <>
            <KpiRowSkeleton />
            <PeriodMoneyRowSkeleton />
          </>
        ) : (
          <>
            <section
              aria-label="Chỉ số chính"
              className={`${DASHBOARD_KPI_GRID} transition-opacity ${
                dimPeriodBlocks ? "opacity-70" : ""
              }`}
            >
              <KpiStatCard
                label="Doanh thu"
                value={formatCurrency(revenue)}
                delta={moneyDelta((value) => value.totalLearnedTuition)}
                deltaHint={moneyHint("Doanh thu", (value) => value.totalLearnedTuition)}
                foot={`Chi phí ${formatCurrency(personnelCost + otherCost)}`}
                onClick={() => openRow("revenue")}
              />
              <KpiStatCard
                label="Lợi nhuận"
                value={formatCurrency(profit)}
                delta={moneyDelta((value) => value.monthlyProfit)}
                deltaHint={moneyHint("Lợi nhuận", (value) => value.monthlyProfit)}
                foot={`Biên lợi nhuận ${profitMargin}`}
                onClick={() => openRow("profit")}
              />
              <KpiStatCard
                label="Tổng nạp"
                value={formatCurrency(periodSummary.monthlyTopupTotal)}
                delta={moneyDelta((value) => value.monthlyTopupTotal)}
                deltaHint={moneyHint("Tổng nạp", (value) => value.monthlyTopupTotal)}
                foot={`Dòng tiền thuần ${formatCurrency(totalReceiveNet)}`}
                onClick={() => openRow("topup")}
              />
              <KpiStatCard
                label="Học sinh đang học"
                value={formatVnInteger(summary.activeStudents)}
                delta={computeCountDelta(studentNetChange)}
                deltaHint={studentHint}
                foot={`+${summary.newStudentsThisMonth} mới · −${summary.droppedStudentsThisMonth} cũ nghỉ · −${summary.trialDroppedStudentsThisMonth} thử nghỉ`}
                onClick={() => setStudentChurnTab("active")}
              />
            </section>

            <div className={DASHBOARD_PERIOD_GRID}>
              <DashboardPanel title="Kết quả kỳ" description="Bấm từng dòng để xem chi tiết nguồn" dimmed={dimPeriodBlocks}>
                <div className="flex flex-col gap-0.5">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                    Kế toán (theo buổi đã học)
                  </p>
                  <AmountRowButton label="Học phí đã học" value={formatCurrency(revenue)} onClick={() => openRow("revenue")} />
                  <AmountRowButton label="− Chi phí nhân sự" value={formatCurrency(personnelCost)} tone="muted" onClick={() => openRow("personnel-cost")} />
                  <AmountRowButton label="− Chi phí khác" value={formatCurrency(otherCost)} tone="muted" onClick={() => openRow("other-cost")} />
                  <AmountRowButton
                    label="Lợi nhuận"
                    value={formatCurrency(profit)}
                    tone={profit < 0 ? "negative" : "positive"}
                    emphasize
                    onClick={() => openRow("profit")}
                  />
                </div>
                <div className="flex flex-col gap-0.5">
                  <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-text-secondary">
                    Dòng tiền (thực thu)
                  </p>
                  <AmountRowButton label="Tổng nạp" value={formatCurrency(periodSummary.monthlyTopupTotal)} onClick={() => openRow("topup")} />
                  <AmountRowButton label="− Chi phí nhân sự" value={formatCurrency(personnelCost)} tone="muted" onClick={() => openRow("personnel-cost")} />
                  <AmountRowButton label="− Chi phí khác" value={formatCurrency(otherCost)} tone="muted" onClick={() => openRow("other-cost")} />
                  <AmountRowButton
                    label="Dòng tiền thuần"
                    value={formatCurrency(totalReceiveNet)}
                    tone={totalReceiveNet < 0 ? "negative" : "positive"}
                    emphasize
                    onClick={() => openRow("total-in")}
                  />
                </div>
                <p className="px-3 text-xs leading-5 text-text-secondary">
                  Biên lợi nhuận <strong className="tabular-nums text-text-primary">{profitMargin}</strong> · Chi phí nhân sự chiếm{" "}
                  <strong className="tabular-nums text-text-primary">{personnelShare}</strong> doanh thu
                </p>
              </DashboardPanel>

              <PersonnelCostBreakdown
                items={personnelItems}
                total={personnelCost}
                dimmed={dimPeriodBlocks}
                onOpenTotal={() => openRow("personnel-cost")}
                onOpenItem={(item) =>
                  openRow("personnel-cost", {
                    label: `Chi phí nhân sự · ${item.label}`,
                    sourceKeys: PERSONNEL_SOURCE_KEYS[item.key],
                  })
                }
              />
            </div>
          </>
        )}

        <div className={DASHBOARD_STATUS_GRID}>
          <BalanceSnapshotCard
            summary={summary}
            giftedLessonPlanEnabled={giftedLessonPlanEnabled !== false}
            onOpenPrepaid={() => openRow("prepaid")}
            onOpenUncollected={() => openRow("uncollected")}
            onOpenPendingPayroll={(sourceKeys) => openRow("pending-payroll", { sourceKeys })}
          />

          <StudentClassSection
            summary={summary}
            dimmed={isMonthDashboardRefreshing}
            onOpenChurn={setStudentChurnTab}
            onOpenClassBreakdown={() => setClassBreakdownOpen(true)}
          />

          <StudentDemographicsSection dimmed={isMonthDashboardRefreshing} />

          {isRangeInitialLoading ? (
            <CustomerSourceSectionSkeleton />
          ) : (
            <CustomerSourceSection
              rows={periodDashboard.customerSources ?? []}
              dimmed={dimPeriodBlocks}
              onOpen={(row) => setFinancialSelection({ kind: "customer-source", sourceKey: row.key })}
            />
          )}
        </div>

        <YearQuarterSection
          year={year}
          yearlySummary={dashboard.yearlySummary}
          statisticsHref={buildAdminLikePath(routeBase, "dashboard/statistics")}
          onOpen={openQuarter}
        />

        {financialSelection ? (
          <FinancialDetailModal
            rowLabel={financialModalLabel}
            detail={financialDetailQuery.data}
            isLoading={financialDetailQuery.isLoading}
            error={financialDetailQuery.error}
            initialSourceKeys={financialSelection.kind === "row" ? financialSelection.sourceKeys : undefined}
            onClose={() => setFinancialSelection(null)}
          />
        ) : null}

        {rangeSelection ? (
          <FinancialDetailModal
            rowLabel={`${
              rangeSelection.metric === "revenue"
                ? "doanh thu"
                : rangeSelection.metric === "expense"
                  ? "chi phí"
                  : "lợi nhuận"
            } ${rangeSelection.range.label}`}
            tabs={
              rangeSelection.metric === "expense"
                ? EXPENSE_TABS
                : [{ key: rangeSelection.metric, label: "", rowKey: rangeSelection.metric }]
            }
            dateFrom={rangeSelection.range.dateFrom}
            dateTo={rangeSelection.range.dateTo}
            onClose={() => setRangeSelection(null)}
          />
        ) : null}

        {classBreakdownOpen ? (
          <ActiveClassBreakdownDialog onClose={() => setClassBreakdownOpen(false)} />
        ) : null}

        {studentChurnTab ? (
          <StudentChurnDetailModal
            periodLabel={dashboard.period.monthLabel}
            newCount={summary.newStudentsThisMonth}
            droppedCount={summary.droppedStudentsThisMonth}
            trialDroppedCount={summary.trialDroppedStudentsThisMonth}
            activeCount={summary.activeStudents}
            activeTab={studentChurnTab}
            onChangeTab={setStudentChurnTab}
            onClose={() => setStudentChurnTab(null)}
            month={month}
            year={year}
          />
        ) : null}
    </>,
  );
}
