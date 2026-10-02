"use client";

import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SelectionCheckbox from "@/components/ui/SelectionCheckbox";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import {
  DEFAULT_BULK_LESSON_PAYMENT_STATUS,
  LESSON_PAYMENT_STATUS_LABELS,
  LESSON_PAYMENT_STATUS_OPTIONS,
  lessonPaymentStatusChipClass,
} from "@/components/admin/lesson-plans/lessonTaskUi";
import type {
  LessonOutputStaffStatsResponse,
  LessonPaymentStatus,
  LessonWorkOutputItem,
} from "@/dtos/lesson.dto";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import * as lessonApi from "@/lib/apis/lesson.api";
import { getStaffById, getStaffRevenueShare } from "@/lib/apis/staff.api";
import type { StaffDetail, StaffRevenueShare } from "@/dtos/staff.dto";
import { MonthInput } from "@/components/ui/MonthInput";
import { getDefaultMonthKey, parseMonthKey } from "@/lib/month-format";
import { toast } from "sonner";
import { formatVnNumber } from "@/lib/formatters";

const RECENT_DAYS = 30;
const EMPTY_OUTPUTS: LessonWorkOutputItem[] = [];

type LessonPlanDetailTab = "revenue" | "outputs";

function getErrorMessage(error: unknown, fallback: string) {
  const message = (error as { response?: { data?: { message?: string | string[] } } })
    ?.response?.data?.message;

  if (Array.isArray(message)) {
    return message.filter(Boolean).join(", ") || fallback;
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return (error as Error)?.message ?? fallback;
}

function formatCurrency(value: number) {
  return formatVnNumber(value);
}

function resolvePrimaryLink(output: LessonWorkOutputItem) {
  return output.link?.trim() || output.originalLink?.trim() || "";
}

function PaymentPill({
  paymentStatus,
  cost,
}: {
  paymentStatus: LessonWorkOutputItem["paymentStatus"];
  cost: number;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${lessonPaymentStatusChipClass(
        paymentStatus,
      )}`}
    >
      {paymentStatus === "pending"
        ? `${LESSON_PAYMENT_STATUS_LABELS[paymentStatus]} · ${formatCurrency(cost)}đ`
        : LESSON_PAYMENT_STATUS_LABELS[paymentStatus]}
    </span>
  );
}

function LevelPill({ level }: { level: string | null }) {
  if (!level?.trim()) {
    return <span className="text-sm text-text-muted">-</span>;
  }

  const text = /level/i.test(level) ? level.trim() : `Level ${level.trim()}`;
  return (
    <span className="inline-flex max-w-[8rem] truncate rounded-full bg-primary/12 px-2.5 py-1 text-xs font-semibold text-primary ring-1 ring-primary/20">
      {text}
    </span>
  );
}

function SummaryCard({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "success" | "warning";
}) {
  const toneClass =
    tone === "success"
      ? "border-success/30 bg-success/10"
      : tone === "warning"
        ? "border-warning/30 bg-warning/10"
        : "border-border-default bg-bg-secondary/60";

  return (
    <article className={`rounded-xl border p-4 ${toneClass}`}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold text-text-primary">{value}</p>
    </article>
  );
}

export default function AdminLessonPlanDetailPage() {
  const params = useParams();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const staffId = typeof params?.staffId === "string" ? params.staffId : "";
  const routeBase = resolveAdminLikeRouteBase(pathname);

  const [selectedOutputIds, setSelectedOutputIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkEditPopupOpen, setBulkEditPopupOpen] = useState(false);
  const [bulkPaymentStatusDraft, setBulkPaymentStatusDraft] =
    useState<LessonPaymentStatus>(DEFAULT_BULK_LESSON_PAYMENT_STATUS);
  const [activeTab, setActiveTab] = useState<LessonPlanDetailTab>("revenue");

  const staffQuery = useQuery<StaffDetail>({
    queryKey: ["staff", "detail", staffId],
    queryFn: () => getStaffById(staffId),
    enabled: !!staffId,
    staleTime: 60_000,
  });
  const isLessonPlanHead =
    staffQuery.data?.roles?.includes("lesson_plan_head") ?? false;
  const rolesResolved = staffQuery.isSuccess || staffQuery.isError;
  const showRevenueTab =
    rolesResolved && isLessonPlanHead && activeTab === "revenue";
  const showOutputsTab =
    rolesResolved && (!isLessonPlanHead || activeTab === "outputs");

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<LessonOutputStaffStatsResponse>({
    queryKey: ["lesson", "output-stats", "staff", staffId, RECENT_DAYS],
    queryFn: () =>
      lessonApi.getLessonOutputStatsByStaff(staffId, {
        days: RECENT_DAYS,
      }),
    enabled: !!staffId && showOutputsTab,
  });

  const [revenueShareMonthKey, setRevenueShareMonthKey] = useState(getDefaultMonthKey);
  const revenueShareParsed = parseMonthKey(revenueShareMonthKey);
  const revenueShareMonth = String(revenueShareParsed?.month ?? new Date().getMonth() + 1).padStart(2, "0");
  const revenueShareYear = String(revenueShareParsed?.year ?? new Date().getFullYear());

  const {
    data: revenueShare,
    isLoading: isRevenueShareLoading,
    isError: isRevenueShareError,
  } = useQuery<StaffRevenueShare>({
    queryKey: ["staff", "revenue-share", staffId, revenueShareMonth, revenueShareYear],
    queryFn: () =>
      getStaffRevenueShare(staffId, { month: revenueShareMonth, year: revenueShareYear }),
    enabled: !!staffId && isLessonPlanHead,
  });

  const selectTab = (tab: LessonPlanDetailTab) => {
    setActiveTab(tab);
    if (tab !== "outputs") {
      setBulkEditPopupOpen(false);
      setSelectedOutputIds(new Set());
    }
  };
  const outputs = data?.outputs ?? EMPTY_OUTPUTS;
  const summary = data?.summary;
  const backHref = buildAdminLikePath(
    routeBase,
    `staffs/${encodeURIComponent(staffId)}`,
  );
  const outputIds = useMemo(() => outputs.map((output) => output.id), [outputs]);
  const selectedVisibleOutputIds = useMemo(
    () => outputIds.filter((outputId) => selectedOutputIds.has(outputId)),
    [outputIds, selectedOutputIds],
  );
  const totalOutputs = outputs.length;
  const paidCount = useMemo(
    () => outputs.filter((item) => item.paymentStatus === "paid").length,
    [outputs],
  );
  const pendingCount = useMemo(
    () => outputs.filter((item) => item.paymentStatus === "pending").length,
    [outputs],
  );
  const selectedCount = selectedVisibleOutputIds.length;
  const allOutputsSelected =
    outputIds.length > 0 && selectedCount === outputIds.length;
  const hasPartialSelection = selectedCount > 0 && !allOutputsSelected;

  const bulkStatusMutation = useMutation({
    mutationFn: (paymentStatus: LessonPaymentStatus) =>
      lessonApi.bulkUpdateLessonOutputPaymentStatus({
        outputIds: selectedVisibleOutputIds,
        paymentStatus,
      }),
    onSuccess: async (result, paymentStatus) => {
      const statusLabel = LESSON_PAYMENT_STATUS_LABELS[paymentStatus].toLowerCase();

      if (result.updatedCount > 0) {
        toast.success(`Đã chuyển ${result.updatedCount} bài sang trạng thái ${statusLabel}.`);
      } else {
        toast.success(`Các bài đã ở trạng thái ${statusLabel}.`);
      }

      setBulkEditPopupOpen(false);
      setSelectedOutputIds(new Set());
      await queryClient.invalidateQueries({
        queryKey: ["lesson", "output-stats", "staff", staffId],
      });
    },
    onError: (mutationError: unknown) => {
      toast.error(
        getErrorMessage(
          mutationError,
          "Không thể cập nhật trạng thái thanh toán lesson output.",
        ),
      );
    },
  });

  const copyText = async (text: string, label: string) => {
    if (!text.trim()) {
      toast.error("Không có nội dung để sao chép.");
      return;
    }

    try {
      await navigator.clipboard.writeText(text);
      toast.success(`Đã sao chép ${label}.`);
    } catch {
      toast.error("Không sao chép được.");
    }
  };

  const openExternal = (url: string) => {
    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      toast.error("Chưa có liên kết.");
      return;
    }

    try {
      const href = trimmedUrl.startsWith("http")
        ? trimmedUrl
        : `https://${trimmedUrl}`;
      window.open(href, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("Không mở được liên kết.");
    }
  };

  const toggleOutputSelection = (outputId: string) => {
    if (bulkStatusMutation.isPending) return;
    if (
      bulkEditPopupOpen &&
      selectedCount === 1 &&
      selectedOutputIds.has(outputId)
    ) {
      setBulkEditPopupOpen(false);
    }

    setSelectedOutputIds((current) => {
      const next = new Set(current);
      if (next.has(outputId)) {
        next.delete(outputId);
      } else {
        next.add(outputId);
      }
      return next;
    });
  };

  const toggleAllOutputs = () => {
    if (bulkStatusMutation.isPending) return;
    if (allOutputsSelected) {
      setBulkEditPopupOpen(false);
    }
    setSelectedOutputIds(allOutputsSelected ? new Set() : new Set(outputIds));
  };

  const clearSelection = () => {
    if (selectedCount === 0 || bulkStatusMutation.isPending) return;
    setBulkEditPopupOpen(false);
    setSelectedOutputIds(new Set());
  };

  const openBulkEditPopup = () => {
    if (selectedCount === 0 || bulkStatusMutation.isPending) return;
    setBulkPaymentStatusDraft(DEFAULT_BULK_LESSON_PAYMENT_STATUS);
    setBulkEditPopupOpen(true);
  };

  const closeBulkEditPopup = () => {
    if (bulkStatusMutation.isPending) return;
    setBulkEditPopupOpen(false);
  };

  const confirmBulkStatusUpdate = () => {
    if (selectedCount === 0 || bulkStatusMutation.isPending) return;
    bulkStatusMutation.mutate(bulkPaymentStatusDraft);
  };

  if (!staffId) {
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
        <section className="rounded-[2rem] border border-warning/30 bg-warning/10 p-5 shadow-sm lg:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-warning">
            Lesson Plan Locked
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-text-primary">
            Không tìm thấy nhân sự để xem lesson output.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            Route này cần `staffId` hợp lệ để tải dữ liệu thống kê lesson output.
          </p>
        </section>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <Link
        href={backHref}
        className="inline-flex min-h-11 w-fit items-center gap-2 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary shadow-sm transition-colors hover:bg-bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
      >
        <svg
          className="size-4 shrink-0"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M15 19l-7-7 7-7"
          />
        </svg>
        Quay lại nhân sự
      </Link>

      {staffQuery.isLoading ? (
        <div className="h-12 w-full max-w-md animate-pulse rounded-[1.35rem] border border-border-default bg-bg-secondary/70" />
      ) : isLessonPlanHead ? (
        <div
          className="inline-flex w-full rounded-[1.35rem] border border-border-default bg-gradient-to-b from-bg-surface to-bg-secondary/90 p-1 shadow-sm sm:w-fit"
          role="tablist"
          aria-label="Hoa hồng doanh thu hoặc Bài giáo án"
        >
          <div className="grid w-full min-w-0 grid-cols-2 sm:min-w-[320px]">
            <button
              id="lesson-plan-tab-revenue"
              type="button"
              role="tab"
              aria-selected={activeTab === "revenue"}
              aria-controls="lesson-plan-panel-revenue"
              onClick={() => selectTab("revenue")}
              className={`min-h-11 touch-manipulation rounded-[1rem] px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface ${
                activeTab === "revenue"
                  ? "bg-primary text-text-inverse shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Hoa hồng doanh thu
            </button>
            <button
              id="lesson-plan-tab-outputs"
              type="button"
              role="tab"
              aria-selected={activeTab === "outputs"}
              aria-controls="lesson-plan-panel-outputs"
              onClick={() => selectTab("outputs")}
              className={`min-h-11 touch-manipulation rounded-[1rem] px-4 py-2.5 text-sm font-semibold transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface ${
                activeTab === "outputs"
                  ? "bg-primary text-text-inverse shadow-sm"
                  : "text-text-muted hover:text-text-primary"
              }`}
            >
              Bài giáo án
            </button>
          </div>
        </div>
      ) : null}

      {showRevenueTab ? (
      <section
        id="lesson-plan-panel-revenue"
        role="tabpanel"
        aria-labelledby="lesson-plan-tab-revenue"
        className="rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-text-primary sm:text-lg">
              Hoa hồng doanh thu tháng {revenueShareMonth}/{revenueShareYear}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Doanh thu là tổng học phí buổi chargeable trong tháng. Tỷ lệ % là mức đang
              cấu hình (áp dụng cho buổi mới). Số tiền thực nhận là tổng hoa hồng đã
              snapshot trong tháng — không tính live từ % × doanh thu, không khấu trừ thuế.
            </p>
          </div>
          <MonthInput
            value={revenueShareMonthKey}
            onChange={(event) => setRevenueShareMonthKey(event.target.value)}
            aria-label="Chọn tháng xem hoa hồng doanh thu"
          />
        </div>
        {isRevenueShareLoading ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div
                key={`revenue-share-skeleton-${index}`}
                className="h-24 animate-pulse rounded-xl border border-border-default bg-bg-secondary/70"
              />
            ))}
          </div>
        ) : isRevenueShareError ? (
          <p className="mt-4 text-sm text-error">
            Không tải được dữ liệu hoa hồng doanh thu.
          </p>
        ) : (
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <SummaryCard
              label="Tỷ lệ % hoa hồng"
              value={
                revenueShare?.revenueSharePercent == null
                  ? "Chưa thiết lập"
                  : `${revenueShare.revenueSharePercent}%`
              }
            />
            <SummaryCard
              label="Tổng doanh thu hệ thống"
              value={`${formatCurrency(revenueShare?.revenue ?? 0)}đ`}
            />
            <SummaryCard
              label="Số tiền thực nhận"
              value={`${formatCurrency(revenueShare?.amount ?? 0)}đ`}
              tone="success"
            />
          </div>
        )}
      </section>
      ) : null}

      {showOutputsTab ? (
      <div
        id="lesson-plan-panel-outputs"
        role="tabpanel"
        aria-labelledby={isLessonPlanHead ? "lesson-plan-tab-outputs" : undefined}
        className="flex min-h-0 flex-1 flex-col gap-4"
      >
      {isLoading ? (
        <>
          <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
            <div className="h-3 w-40 animate-pulse rounded-full bg-bg-tertiary" />
            <div className="mt-4 h-10 w-full max-w-md animate-pulse rounded-2xl bg-bg-tertiary" />
            <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-bg-tertiary" />
            <div className="mt-2 h-4 w-5/6 max-w-xl animate-pulse rounded bg-bg-tertiary" />
            <div className="mt-6 grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={index}
                  className="h-24 animate-pulse rounded-[1.5rem] border border-border-default bg-bg-secondary/70"
                />
              ))}
            </div>
          </section>
          <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, index) => (
                <div
                  key={`lesson-plan-detail-meta-skeleton-${index}`}
                  className="h-28 animate-pulse rounded-[1.5rem] border border-border-default bg-bg-secondary/70"
                />
              ))}
            </div>
            <div className="mt-5 h-72 animate-pulse rounded-[1.5rem] bg-bg-secondary/70" />
          </section>
        </>
      ) : isError ? (
        <section className="rounded-[2rem] border border-error/30 bg-error/8 p-5 shadow-sm lg:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-error">
            Lesson Output Unavailable
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-text-primary">
            Không tải được thống kê lesson output.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            {getErrorMessage(
              error,
              "Dữ liệu lesson output cho nhân sự này hiện chưa lấy được.",
            )}
          </p>
          <button
            type="button"
            onClick={() => refetch()}
            className="mt-5 inline-flex min-h-11 items-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            Tải lại
          </button>
        </section>
      ) : (
        <>
          <section className="rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
            <div className="grid gap-3 sm:grid-cols-3">
              <SummaryCard label="Tổng số bài" value={String(totalOutputs)} />
              <SummaryCard
                label="Số bài đã thanh toán"
                value={String(paidCount)}
                tone="success"
              />
              <SummaryCard
                label="Số bài chưa thanh toán"
                value={String(pendingCount)}
                tone="warning"
              />
            </div>

            <div className="mt-5 flex items-center justify-between border-b border-border-default pb-3">
              <div>
                <h2 className="text-base font-semibold text-text-primary sm:text-lg">
                  Bài giáo án đã làm
                </h2>
                <p className="mt-1 text-sm text-text-muted">
                  Theo dõi trong {summary?.days ?? RECENT_DAYS} ngày gần nhất.
                </p>
              </div>
              <span className="inline-flex rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                {totalOutputs}
              </span>
            </div>

            {selectedCount > 0 ? (
              <section className="relative mt-5 overflow-hidden rounded-[1.35rem] border border-border-default bg-bg-surface p-3 shadow-sm">
                <div
                  className="pointer-events-none absolute -right-10 top-0 size-28 rounded-full bg-success/10 blur-3xl"
                  aria-hidden
                />
                <div
                  className="pointer-events-none absolute bottom-0 left-8 size-24 rounded-full bg-primary/10 blur-3xl"
                  aria-hidden
                />

                <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      Thanh toán hàng loạt
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                      <span className="inline-flex items-center rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 font-medium text-primary">
                        Đã chọn {selectedCount} bài
                      </span>
                      <span className="text-text-muted">
                        Chọn nhiều lesson output để đổi trạng thái trong một lần.
                      </span>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto">
                    <button
                      type="button"
                      onClick={toggleAllOutputs}
                      disabled={outputIds.length === 0 || bulkStatusMutation.isPending}
                      className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {allOutputsSelected
                        ? `Bỏ chọn ${selectedCount} bài`
                        : `Chọn cả ${outputIds.length} bài`}
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      disabled={bulkStatusMutation.isPending}
                      className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Bỏ chọn toàn bộ
                    </button>
                    <button
                      type="button"
                      onClick={openBulkEditPopup}
                      disabled={bulkStatusMutation.isPending}
                      className="touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-[0_14px_30px_-18px_color-mix(in_srgb,var(--ue-primary)_45%,transparent)] transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Sửa trạng thái thanh toán cho ${selectedCount} lesson output đã chọn`}
                    >
                      <svg
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                      <span>Sửa trạng thái thanh toán</span>
                      <span className="rounded-full bg-bg-surface/18 px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {selectedCount}
                      </span>
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {outputs.length === 0 ? (
              <div className="mt-5 rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/35 p-6 text-center text-sm text-text-muted">
                Chưa có lesson output nào trong {summary?.days ?? RECENT_DAYS} ngày qua.
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-3 lg:hidden">
                  {outputs.map((output) => {
                    const isSelected = selectedOutputIds.has(output.id);
                    const linkUrl = resolvePrimaryLink(output);

                    return (
                      <article
                        key={output.id}
                        className={`rounded-[1.35rem] border p-3 shadow-sm transition-all duration-200 ${
                          isSelected
                            ? "border-primary/35 bg-primary/5 shadow-[0_20px_36px_-26px_color-mix(in_srgb,var(--ue-primary)_38%,transparent)]"
                            : "border-border-default bg-bg-surface"
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <SelectionCheckbox
                            checked={isSelected}
                            onChange={() => toggleOutputSelection(output.id)}
                            disabled={bulkStatusMutation.isPending}
                            ariaLabel={`Chọn lesson output ${output.lessonName}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-snug text-text-primary">
                                  {output.lessonName}
                                </p>
                                <p className="mt-1 text-xs text-text-muted">
                                  {output.contestUploaded?.trim() || "Chưa có contest"}
                                </p>
                              </div>
                              <PaymentPill
                                paymentStatus={output.paymentStatus}
                                cost={output.cost}
                              />
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1">
                              {output.tags.length > 0 ? (
                                output.tags.map((tag) => (
                                  <span
                                    key={`${output.id}-${tag}`}
                                    className="rounded-full border border-border-default bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                                  >
                                    {tag}
                                  </span>
                                ))
                              ) : (
                                <span className="text-sm text-text-muted">-</span>
                              )}
                            </div>

                            <div className="mt-3 flex items-center justify-between gap-3">
                              <LevelPill level={output.level} />
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  title="Sao chép liên kết"
                                  disabled={!linkUrl}
                                  onClick={() => void copyText(linkUrl, "liên kết")}
                                  className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <svg
                                    className="size-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                    />
                                  </svg>
                                </button>
                                <button
                                  type="button"
                                  title="Mở liên kết"
                                  disabled={!linkUrl}
                                  onClick={() => openExternal(linkUrl)}
                                  className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  <svg
                                    className="size-4"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                    aria-hidden
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={2}
                                      d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                    />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>

                <div className="mt-5 hidden overflow-hidden rounded-xl border border-border-default lg:block">
                  <div className="overflow-x-auto">
                    <table className="w-full table-fixed border-collapse text-left">
                      <colgroup>
                        <col style={{ width: "76px" }} />
                        <col style={{ width: "18%" }} />
                        <col style={{ width: "12%" }} />
                        <col style={{ width: "23%" }} />
                        <col style={{ width: "20%" }} />
                        <col style={{ width: "17%" }} />
                        <col style={{ width: "96px" }} />
                      </colgroup>
                      <thead className="bg-bg-secondary">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                          <th className="px-2.5 py-2.5 text-center" scope="col">
                            <SelectionCheckbox
                              checked={allOutputsSelected}
                              indeterminate={hasPartialSelection}
                              onChange={toggleAllOutputs}
                              disabled={
                                outputIds.length === 0 || bulkStatusMutation.isPending
                              }
                              ariaLabel="Chọn tất cả lesson output"
                            />
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Tag
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Level
                          </th>
                          <th className="min-w-[13rem] px-2.5 py-2.5" scope="col">
                            Tên bài
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Trạng thái
                          </th>
                          <th className="min-w-[9rem] px-2.5 py-2.5" scope="col">
                            Contest
                          </th>
                          <th className="w-28 px-2.5 py-2.5 text-right" scope="col">
                            Link
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {outputs.map((output) => {
                          const linkUrl = resolvePrimaryLink(output);
                          const isSelected = selectedOutputIds.has(output.id);

                          return (
                            <tr
                              key={output.id}
                              className={`border-t transition-colors ${
                                isSelected
                                  ? "border-primary/15 bg-primary/5 hover:bg-primary/8"
                                  : "border-border-default bg-bg-surface hover:bg-bg-secondary/40"
                              }`}
                            >
                              <td className="px-2.5 py-2.5 text-center align-top">
                                <SelectionCheckbox
                                  checked={isSelected}
                                  onChange={() => toggleOutputSelection(output.id)}
                                  disabled={bulkStatusMutation.isPending}
                                  ariaLabel={`Chọn lesson output ${output.lessonName}`}
                                />
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <div className="flex max-w-[14rem] flex-wrap gap-1">
                                  {output.tags.length > 0 ? (
                                    output.tags.map((tag) => (
                                      <span
                                        key={`${output.id}-${tag}`}
                                        className="rounded-full border border-border-default bg-bg-secondary px-2 py-0.5 text-[11px] font-medium text-text-secondary"
                                      >
                                        {tag}
                                      </span>
                                    ))
                                  ) : (
                                    <span className="text-sm text-text-muted">-</span>
                                  )}
                                </div>
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <LevelPill level={output.level} />
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <p className="text-sm font-semibold leading-snug text-text-primary">
                                  {output.lessonName}
                                </p>
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <PaymentPill
                                  paymentStatus={output.paymentStatus}
                                  cost={output.cost}
                                />
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-sm text-text-secondary">
                                <span className="line-clamp-2">
                                  {output.contestUploaded?.trim() || "—"}
                                </span>
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-right">
                                <div className="flex items-center justify-end gap-0.5">
                                  <button
                                    type="button"
                                    title="Sao chép liên kết"
                                    disabled={!linkUrl}
                                    onClick={() => void copyText(linkUrl, "liên kết")}
                                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <svg
                                      className="size-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                                      />
                                    </svg>
                                  </button>
                                  <button
                                    type="button"
                                    title="Mở liên kết"
                                    disabled={!linkUrl}
                                    onClick={() => openExternal(linkUrl)}
                                    className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    <svg
                                      className="size-3.5"
                                      fill="none"
                                      stroke="currentColor"
                                      viewBox="0 0 24 24"
                                      aria-hidden
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        strokeWidth={2}
                                        d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
                                      />
                                    </svg>
                                  </button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            )}
          </section>
        </>
      )}
      </div>
      ) : null}

      {bulkEditPopupOpen && selectedCount > 0 ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeBulkEditPopup}
          />
          <div className="fixed inset-0 z-[70] p-3 sm:p-4">
            <div className="mx-auto flex h-full w-full max-w-md items-center">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-lesson-output-status-title"
                className="relative w-full overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-2xl"
              >
                <div
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-success/0 via-success/50 to-primary/0"
                  aria-hidden
                />
                <div
                  className="absolute -right-8 -top-10 size-24 rounded-full bg-success/10 blur-3xl"
                  aria-hidden
                />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Chỉnh sửa hàng loạt
                      </p>
                      <h2
                        id="bulk-lesson-output-status-title"
                        className="mt-1 text-lg font-semibold text-text-primary text-balance"
                      >
                        Cập nhật trạng thái thanh toán
                      </h2>
                      <p className="mt-2 text-sm text-text-secondary">
                        Áp dụng cho{" "}
                        <span className="font-semibold text-primary">
                          {selectedCount}
                        </span>{" "}
                        lesson output đã chọn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeBulkEditPopup}
                      className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label="Đóng popup sửa trạng thái thanh toán"
                    >
                      <svg
                        className="size-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-text-secondary">
                        Trạng thái muốn đổi
                      </span>
                      <UpgradedSelect
                        name="bulk-lesson-output-status"
                        value={bulkPaymentStatusDraft}
                        onValueChange={(value) =>
                          setBulkPaymentStatusDraft(value as LessonPaymentStatus)
                        }
                        options={LESSON_PAYMENT_STATUS_OPTIONS}
                        buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={closeBulkEditPopup}
                        disabled={bulkStatusMutation.isPending}
                        className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={confirmBulkStatusUpdate}
                        disabled={bulkStatusMutation.isPending}
                        className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {bulkStatusMutation.isPending ? "Đang cập nhật…" : "Xác nhận"}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
