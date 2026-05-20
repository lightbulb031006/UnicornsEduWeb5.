"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import type {
  LessonPaymentStatus,
  LessonWorkOutputItem,
  LessonWorkResponse,
} from "@/dtos/lesson.dto";
import * as lessonApi from "@/lib/apis/lesson.api";
import type { StaffLessonEndpointAccessMode } from "@/lib/staff-lesson-workspace";
import LessonOutputQuickPopup from "./LessonOutputQuickPopup";
import LessonWorkNewLessonPanel from "./LessonWorkNewLessonPanel";
import LessonWorkQuickFilters, {
  type LessonWorkFilterDraft,
} from "./LessonWorkQuickFilters";
import {
  DEFAULT_BULK_LESSON_PAYMENT_STATUS,
  LESSON_PAYMENT_STATUS_LABELS,
  LESSON_PAYMENT_STATUS_OPTIONS,
  lessonPaymentStatusChipClass,
} from "./lessonTaskUi";
import SelectionCheckbox from "@/components/ui/SelectionCheckbox";
import UpgradedSelect from "@/components/ui/UpgradedSelect";

const WORK_PAGE_SIZE = 10;
const EMPTY_OUTPUTS: LessonWorkOutputItem[] = [];

function normalizePositiveInt(value: string | null, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  return Math.floor(parsed);
}

function normalizeMonthYear(
  yearRaw: string | null,
  monthRaw: string | null,
): { year: number; month: number } {
  const now = new Date();
  const defaultYear = now.getFullYear();
  const defaultMonth = now.getMonth() + 1;

  const year = Number(yearRaw);
  const month = Number(monthRaw);

  const y =
    Number.isFinite(year) && year >= 2000 && year <= 2100 ? year : defaultYear;
  const m =
    Number.isFinite(month) && month >= 1 && month <= 12 ? month : defaultMonth;

  return { year: y, month: m };
}

function getErrorMessage(error: unknown, fallback: string) {
  return (
    (error as { response?: { data?: { message?: string } } })?.response?.data
      ?.message ??
    (error as Error)?.message ??
    fallback
  );
}

function formatMonthLabel(year: number, month: number) {
  const m = String(month).padStart(2, "0");
  return `Tháng ${m}/${year}`;
}

function resolvePrimaryLink(output: LessonWorkOutputItem) {
  return output.link?.trim() || output.originalLink?.trim() || "";
}

function isNestedInteractiveElement(target: EventTarget | null) {
  return (
    target instanceof HTMLElement &&
    Boolean(target.closest("button, a, input, textarea, select, summary"))
  );
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN").format(value);
}

async function copyText(text: string, label: string) {
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
}

function openExternal(url: string) {
  const normalizedUrl = url.trim();
  if (!normalizedUrl) {
    toast.error("Chưa có liên kết.");
    return;
  }

  try {
    const href = normalizedUrl.startsWith("http")
      ? normalizedUrl
      : `https://${normalizedUrl}`;
    window.open(href, "_blank", "noopener,noreferrer");
  } catch {
    toast.error("Không mở được liên kết.");
  }
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

function WorkPagination({
  page,
  totalPages,
  total,
  isPending,
  onPageChange,
}: {
  page: number;
  totalPages: number;
  total: number;
  isPending: boolean;
  onPageChange: (nextPage: number) => void;
}) {
  return (
    <div className="flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-text-secondary">
          {total} bài trong tháng đang xem
        </p>
        {isPending ? (
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-text-muted">
            Đang chuyển trang
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 sm:flex sm:items-center">
        <button
          type="button"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1 || isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          Trước
        </button>
        <span className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-secondary px-3 py-2 text-center text-sm font-medium text-text-secondary">
          Trang {page}/{totalPages}
        </span>
        <button
          type="button"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages || isPending}
          className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        >
          Sau
        </button>
      </div>
    </div>
  );
}

function WorkTableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-3 xl:hidden">
        {Array.from({ length: rows }).map((_, index) => (
          <div
            key={`work-mobile-sk-${index}`}
            className="rounded-[1.35rem] border border-border-default bg-bg-surface p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-20 animate-pulse rounded-full bg-bg-tertiary/80" />
                <div className="h-5 w-3/4 animate-pulse rounded-full bg-bg-tertiary" />
                <div className="h-4 w-28 animate-pulse rounded-full bg-bg-tertiary/65" />
              </div>
              <div className="flex gap-2">
                <div className="size-10 animate-pulse rounded-xl bg-bg-tertiary/85" />
                <div className="size-10 animate-pulse rounded-xl bg-bg-tertiary/65" />
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-2xl border border-border-default/70 bg-bg-secondary/30 p-3">
                <div className="h-3 w-20 animate-pulse rounded-full bg-bg-tertiary/80" />
                <div className="mt-3 h-4 w-full animate-pulse rounded-full bg-bg-tertiary/70" />
                <div className="mt-2 h-4 w-3/4 animate-pulse rounded-full bg-bg-tertiary/55" />
              </div>
              <div className="rounded-2xl border border-border-default/70 bg-bg-secondary/30 p-3">
                <div className="h-3 w-24 animate-pulse rounded-full bg-bg-tertiary/80" />
                <div className="mt-3 flex flex-wrap gap-2">
                  <div className="h-7 w-28 animate-pulse rounded-full bg-bg-tertiary" />
                  <div className="h-7 w-32 animate-pulse rounded-full bg-bg-tertiary/75" />
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-hidden rounded-[1.35rem] border border-border-default bg-bg-surface shadow-sm xl:block">
        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-left">
            <colgroup>
              <col style={{ width: "13%" }} />
              <col style={{ width: "29%" }} />
              <col style={{ width: "18%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "15%" }} />
              <col style={{ width: "10%" }} />
            </colgroup>
            <thead className="bg-bg-secondary/70">
              <tr className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                <th className="px-4 py-3.5" scope="col">
                  Ngày
                </th>
                <th className="px-4 py-3.5" scope="col">
                  Bài giáo án
                </th>
                <th className="px-4 py-3.5" scope="col">
                  Công việc
                </th>
                <th className="px-4 py-3.5" scope="col">
                  Trạng thái
                </th>
                <th className="px-4 py-3.5" scope="col">
                  Contest / Link
                </th>
                <th className="px-4 py-3.5 text-right" scope="col">
                  Thao tác
                </th>
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: rows }).map((_, index) => (
                <tr
                  key={`work-sk-${index}`}
                  className="border-t border-border-default/80"
                >
                  <td className="px-4 py-4 align-top">
                    <div className="h-8 w-24 animate-pulse rounded-full bg-bg-tertiary" />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="h-5 w-full max-w-[16rem] animate-pulse rounded bg-bg-tertiary" />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <div className="h-6 w-[4.5rem] animate-pulse rounded-full bg-bg-tertiary/85" />
                      <div className="h-6 w-20 animate-pulse rounded-full bg-bg-tertiary/70" />
                    </div>
                    <div className="mt-3 h-4 w-32 animate-pulse rounded bg-bg-tertiary/65" />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-bg-tertiary/85" />
                    <div className="mt-3 h-4 w-24 animate-pulse rounded bg-bg-tertiary/70" />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="h-7 w-28 animate-pulse rounded-full bg-bg-tertiary" />
                    <div className="mt-3 h-7 w-full max-w-[8rem] animate-pulse rounded-full bg-bg-tertiary/80" />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="h-4 w-full max-w-[10rem] animate-pulse rounded bg-bg-tertiary/85" />
                    <div className="mt-3 h-4 w-full max-w-[8rem] animate-pulse rounded bg-bg-tertiary/70" />
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="ml-auto flex flex-wrap justify-end gap-2">
                      <div className="h-10 w-full max-w-[5rem] animate-pulse rounded-xl bg-bg-tertiary" />
                      <div className="size-10 animate-pulse rounded-xl bg-bg-tertiary/85" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

export default function LessonWorkTab({
  basePagePath = "/admin/lesson-plans",
  outputAccessMode = "manage",
  createAccessMode = "manage",
  allowCreate = true,
  allowBulkPaymentStatusEdit = true,
  allowDelete = true,
}: {
  basePagePath?: string;
  outputAccessMode?: StaffLessonEndpointAccessMode;
  createAccessMode?: Exclude<StaffLessonEndpointAccessMode, "account"> | null;
  allowCreate?: boolean;
  allowBulkPaymentStatusEdit?: boolean;
  allowDelete?: boolean;
}) {
  const { replace } = useRouter();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);
  const queryClient = useQueryClient();
  const canManageOutputs = outputAccessMode !== "participant";
  const canCreateOutputs = createAccessMode !== null && allowCreate;
  const canBulkEditPaymentStatus =
    outputAccessMode !== "participant" && allowBulkPaymentStatusEdit;
  const canDeleteOutputs = outputAccessMode === "manage" && allowDelete;
  const canOpenOutputPopup = true;
  const canShowStaffSummary = outputAccessMode !== "participant";
  const canEditTasklessOutput = outputAccessMode !== "participant";
  const canEditPaymentStatus = outputAccessMode !== "participant";
  const canEditCost = outputAccessMode !== "participant";
  const createRequiresTaskSelection = createAccessMode === "participant";
  const createAllowsTasklessOutput = createAccessMode === "manage";
  const createAllowsPaymentStatusEdit = createAccessMode === "manage";
  const createOpenAfterCreate = createAccessMode === "manage" ? "popup" : "none";
  const workPage = normalizePositiveInt(getSearchParam("workPage"));
  const { year: workYear, month: workMonth } = normalizeMonthYear(
    getSearchParam("workYear"),
    getSearchParam("workMonth"),
  );

  const [filterOpen, setFilterOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedOutputId, setSelectedOutputId] = useState<string | null>(null);
  const [bulkEditPopupOpen, setBulkEditPopupOpen] = useState(false);
  const [bulkPaymentStatusDraft, setBulkPaymentStatusDraft] =
    useState<LessonPaymentStatus>(DEFAULT_BULK_LESSON_PAYMENT_STATUS);

  const workSearch = getSearchParam("workSearch") ?? "";
  const workTag = getSearchParam("workTag") ?? "";
  const workOutputStatus = getSearchParam("workOutputStatus") ?? "all";
  const workStaffId = getSearchParam("workStaffId") ?? "";
  const workDateFrom = getSearchParam("workDateFrom") ?? "";
  const workDateTo = getSearchParam("workDateTo") ?? "";
  const appliedDraft = useMemo<LessonWorkFilterDraft>(
    () => ({
      search: workSearch,
      tag: workTag,
      outputStatus: workOutputStatus || "all",
      staffId: workStaffId,
      dateFrom: workDateFrom,
      dateTo: workDateTo,
    }),
    [
      workDateFrom,
      workDateTo,
      workOutputStatus,
      workSearch,
      workStaffId,
      workTag,
    ],
  );
  const filterDraftKey = useMemo(
    () => JSON.stringify(appliedDraft),
    [appliedDraft],
  );

  const { data: staffFilterOptions = [] } = useQuery({
    queryKey: ["lesson", "output-staff-options", "work-filter"],
    queryFn: () =>
      lessonApi.searchLessonOutputStaffOptions({
        limit: 80,
      }),
    enabled: canManageOutputs,
  });

  const syncWorkParams = useCallback(
    (patch: Record<string, string | number | null | undefined>) => {
      const params = new URLSearchParams(searchParams?.toString() ?? "");
      params.set("tab", "work");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === undefined || value === "") {
          params.delete(key);
        } else {
          params.set(key, String(value));
        }
      }
      replace(`${basePagePath}?${params.toString()}`, {
        scroll: false,
      });
    },
    [basePagePath, replace, searchParams],
  );

  const applyFilters = useCallback((draft: LessonWorkFilterDraft) => {
    syncWorkParams({
      workSearch: draft.search.trim() || null,
      workTag: draft.tag.trim() || null,
      workOutputStatus:
        draft.outputStatus === "all" || !draft.outputStatus.trim()
          ? null
          : draft.outputStatus.trim(),
      workStaffId: draft.staffId.trim() || null,
      workDateFrom: draft.dateFrom.trim() || null,
      workDateTo: draft.dateTo.trim() || null,
      workPage: 1,
    });
  }, [syncWorkParams]);

  const clearFilters = useCallback(() => {
    syncWorkParams({
      workSearch: null,
      workTag: null,
      workOutputStatus: null,
      workStaffId: null,
      workDateFrom: null,
      workDateTo: null,
      workPage: 1,
    });
  }, [syncWorkParams]);

  const handleMonthStep = (delta: number) => {
    const d = new Date(Date.UTC(workYear, workMonth - 1 + delta, 1));
    syncWorkParams({
      workYear: d.getUTCFullYear(),
      workMonth: d.getUTCMonth() + 1,
      workPage: 1,
      workDateFrom: null,
      workDateTo: null,
    });
  };

  const handlePageChange = (page: number) => {
    syncWorkParams({ workPage: page });
  };

  const openOutputDetail = useCallback((outputId: string) => {
    setSelectedOutputId(outputId);
  }, [setSelectedOutputId]);

  const queryKey = useMemo(
    () =>
      [
        "lesson",
        "work",
        workPage,
        workYear,
        workMonth,
        workSearch,
        workTag,
        workOutputStatus,
        canManageOutputs ? workStaffId : "",
        workDateFrom,
        workDateTo,
      ] as const,
    [
      workPage,
      workYear,
      workMonth,
      workSearch,
      workTag,
      workOutputStatus,
      canManageOutputs,
      workStaffId,
      workDateFrom,
      workDateTo,
    ],
  );

  const { data, isLoading, isFetching, isError, error, refetch } =
    useQuery<LessonWorkResponse>({
      queryKey,
      queryFn: () =>
        lessonApi.getLessonWork({
          page: workPage,
          limit: WORK_PAGE_SIZE,
          year: workYear,
          month: workMonth,
          search: workSearch || undefined,
          tag: workTag || undefined,
          outputStatus:
            workOutputStatus && workOutputStatus !== "all"
              ? workOutputStatus
              : undefined,
          staffId: canManageOutputs ? workStaffId || undefined : undefined,
          dateFrom: workDateFrom || undefined,
          dateTo: workDateTo || undefined,
        }),
      placeholderData: (previousData) => previousData,
    });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => lessonApi.deleteLessonOutput(id),
    onSuccess: () => {
      toast.success("Đã xóa bài giáo án.");
      void queryClient.invalidateQueries({ queryKey: ["lesson", "work"] });
      void queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không xóa được bản ghi."));
    },
  });

  const outputs = data?.outputs ?? EMPTY_OUTPUTS;
  const pageIds = useMemo(() => outputs.map((o) => o.id), [outputs]);
  const selectedVisibleIds = useMemo(
    () => pageIds.filter((id) => selected.has(id)),
    [pageIds, selected],
  );
  const selectedCount = selectedVisibleIds.length;
  const allSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const hasPartialSelection = selectedCount > 0 && !allSelected;

  const bulkStatusMutation = useMutation({
    mutationFn: (paymentStatus: LessonPaymentStatus) =>
      lessonApi.bulkUpdateLessonOutputPaymentStatus({
        outputIds: selectedVisibleIds,
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
      setSelected(new Set());
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["lesson", "work"] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "overview"] }),
        queryClient.invalidateQueries({ queryKey: ["lesson", "exercises"] }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error(
        getErrorMessage(err, "Không thể cập nhật trạng thái thanh toán hàng loạt."),
      );
    },
  });

  const toggleAllPage = () => {
    if (bulkStatusMutation.isPending) return;
    if (allSelected) {
      setSelected((prev) => {
        const next = new Set(prev);
        pageIds.forEach((id) => next.delete(id));
        return next;
      });
      return;
    }
    setSelected((prev) => {
      const next = new Set(prev);
      pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    if (bulkStatusMutation.isPending) return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const confirmDelete = (output: LessonWorkOutputItem) => {
    const ok = window.confirm(
      `Xóa bài “${output.lessonName.trim() || output.id}”? Hành động không hoàn tác.`,
    );
    if (!ok) {
      return;
    }
    deleteMutation.mutate(output.id);
  };

  const clearSelection = () => {
    if (bulkStatusMutation.isPending) return;
    setSelected(new Set());
    setBulkEditPopupOpen(false);
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

  const confirmBulkPaymentStatusUpdate = () => {
    if (selectedCount === 0 || bulkStatusMutation.isPending) return;
    bulkStatusMutation.mutate(bulkPaymentStatusDraft);
  };


  if (isLoading && !data) {
    return (
      <section
        id="lesson-panel-work"
        role="tabpanel"
        aria-labelledby="lesson-tab-work"
        className="space-y-4"
      >
        <WorkTableSkeleton rows={6} />
      </section>
    );
  }

  if (isError || !data) {
    return (
      <section
        id="lesson-panel-work"
        role="tabpanel"
        aria-labelledby="lesson-tab-work"
        className="space-y-6"
      >
        <section className="rounded-xl border border-border-default bg-bg-surface p-5 shadow-sm sm:p-6">
          <div className="rounded-xl border border-dashed border-border-default bg-bg-secondary/40 px-5 py-12 text-center">
            <p className="text-base font-semibold text-text-primary">
              Không tải được danh sách công việc (tab Công việc).
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
              {getErrorMessage(error, "Đã có lỗi khi tải tab Công việc.")}
            </p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-5 rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            >
              Tải lại
            </button>
          </div>
        </section>

        {canOpenOutputPopup ? (
          <LessonOutputQuickPopup
            open={Boolean(selectedOutputId)}
            outputId={selectedOutputId}
            forceSharedLayout
            showStaffSummary={canShowStaffSummary}
            allowTasklessOutput={canEditTasklessOutput}
            allowPaymentStatusEdit={canEditPaymentStatus}
            allowCostEdit={canEditCost}
            allowDelete={canDeleteOutputs}
            onClose={() => setSelectedOutputId(null)}
          />
        ) : null}
      </section>
    );
  }

  return (
    <section
      id="lesson-panel-work"
      role="tabpanel"
      aria-labelledby="lesson-tab-work"
      className="space-y-4"
    >
      <LessonWorkQuickFilters
        key={filterDraftKey}
        open={filterOpen}
        onOpenChange={setFilterOpen}
        initialDraft={appliedDraft}
        onApply={applyFilters}
        onClear={clearFilters}
        staffOptions={staffFilterOptions}
        showStaffFilter={canManageOutputs}
      />

      {canCreateOutputs ? (
        <LessonWorkNewLessonPanel
          requireTaskSelection={createRequiresTaskSelection}
          allowTasklessOutput={createAllowsTasklessOutput}
          hideStaffFields
          forceSharedLayout
          allowPaymentStatusEdit={createAllowsPaymentStatusEdit}
          openAfterCreate={createOpenAfterCreate}
        />
      ) : null}

      <section className="space-y-6">
        <div className="border-b border-border-default/60 pb-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-center gap-2">
              <h3 className="text-base font-semibold text-text-primary sm:text-lg">
                Bài giáo án đã làm
              </h3>
              <span className="inline-flex rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                {data.outputsMeta.total}
              </span>
            </div>

            <div className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 lg:w-auto">
              <button
                type="button"
                onClick={() => handleMonthStep(-1)}
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-border-default bg-bg-surface text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label="Tháng trước"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <div className="min-w-0 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-center">
                <p className="truncate text-sm font-medium tabular-nums text-text-primary">
                  {formatMonthLabel(workYear, workMonth)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => handleMonthStep(1)}
                className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md border border-border-default bg-bg-surface text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label="Tháng sau"
              >
                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          {canBulkEditPaymentStatus && selectedCount > 0 ? (
              <section className="relative mb-4 overflow-hidden rounded-[1.2rem] border border-border-default bg-bg-surface p-3 shadow-sm">
              <div className="pointer-events-none absolute -right-10 top-0 size-24 rounded-full bg-success/10 blur-3xl" aria-hidden />
              <div className="pointer-events-none absolute bottom-0 left-8 size-20 rounded-full bg-primary/10 blur-3xl" aria-hidden />
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
                      Chọn nhiều bài để chuyển trạng thái thanh toán trong một lần.
                    </span>
                  </div>
                </div>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto">
                  <button
                    type="button"
                    onClick={toggleAllPage}
                    disabled={pageIds.length === 0 || bulkStatusMutation.isPending}
                    className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {allSelected ? `Bỏ chọn ${selectedCount} bài` : `Chọn cả ${pageIds.length} bài`}
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
                  className="touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-[0_14px_30px_-18px_color-mix(in_srgb,var(--ue-primary)_45%,transparent)] transition-all hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                    aria-label={`Sửa trạng thái thanh toán cho ${selectedCount} bài đã chọn`}
                  >
                    <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
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

          {outputs.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-border-default">
              <div className="grid grid-cols-1 gap-3 p-3 md:grid-cols-1 xl:hidden">
                {outputs.map((output) => {
                  const linkUrl = resolvePrimaryLink(output);
                  const isSelected = selected.has(output.id);

                  return (
                    <article
                      key={`${output.id}-card`}
                      role={canOpenOutputPopup ? "button" : undefined}
                      tabIndex={canOpenOutputPopup ? 0 : undefined}
                      className={`rounded-[1.35rem] border bg-bg-surface p-4 text-left shadow-sm transition-colors ${canOpenOutputPopup
                        ? "cursor-pointer hover:bg-bg-secondary/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                        : ""
                        } ${isSelected
                          ? "border-primary/30 bg-primary/5"
                          : "border-border-default"
                        }`}
                      onClick={
                        canOpenOutputPopup
                          ? () => openOutputDetail(output.id)
                          : undefined
                      }
                      onKeyDown={(event) => {
                        if (
                          !canOpenOutputPopup ||
                          isNestedInteractiveElement(event.target)
                        ) {
                          return;
                        }

                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          openOutputDetail(output.id);
                        }
                      }}
                      aria-label={
                        canOpenOutputPopup
                          ? `Mở popup chỉnh sửa bài ${output.lessonName}`
                          : undefined
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap gap-1.5">
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
                          <p className="mt-3 text-base font-semibold leading-6 text-text-primary">
                            {output.lessonName}
                          </p>
                          {output.task?.title ? (
                            <p className="mt-1 text-sm text-text-muted">
                              Công việc: {output.task.title}
                            </p>
                          ) : null}
                        </div>

                        <div className="flex shrink-0 items-start gap-2">
                          {canBulkEditPaymentStatus ? (
                            <div role="presentation" onClick={(event) => event.stopPropagation()}>
                              <SelectionCheckbox
                                checked={isSelected}
                                onChange={() => toggleOne(output.id)}
                                disabled={bulkStatusMutation.isPending}
                                ariaLabel={`Chọn ${output.lessonName}`}
                              />
                            </div>
                          ) : null}
                          <LevelPill level={output.level} />
                        </div>
                      </div>

                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <PaymentPill
                          paymentStatus={output.paymentStatus}
                          cost={output.cost}
                        />
                        <span className="rounded-full border border-border-default bg-bg-secondary/70 px-2.5 py-1 text-xs text-text-secondary">
                          {output.contestUploaded?.trim() || "Chưa có contest"}
                        </span>
                      </div>

                      <div className="mt-4 flex items-start justify-between gap-3">
                        <p className="min-w-0 flex-1 text-sm leading-6 text-text-secondary">
                          <span className="font-medium text-text-primary">
                            Link:
                          </span>{" "}
                          <span className="break-words">
                            {linkUrl || "Chưa có liên kết"}
                          </span>
                        </p>
                        <div
                          className="flex shrink-0 items-center gap-0.5"
                          role="presentation"
                          onClick={(event) => event.stopPropagation()}
                        >
                          <button
                            type="button"
                            title="Sao chép liên kết"
                            aria-label={`Sao chép liên kết của ${output.lessonName}`}
                            disabled={!linkUrl}
                            onClick={() => void copyText(linkUrl, "liên kết")}
                            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                            </svg>
                          </button>
                          <button
                            type="button"
                            title="Mở liên kết"
                            aria-label={`Mở liên kết của ${output.lessonName}`}
                            disabled={!linkUrl}
                            onClick={() => openExternal(linkUrl)}
                            className="rounded-lg p-2 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                            </svg>
                          </button>
                          {canDeleteOutputs ? (
                            <button
                              type="button"
                              title="Xóa"
                              aria-label={`Xóa ${output.lessonName}`}
                              disabled={deleteMutation.isPending}
                              onClick={() => confirmDelete(output)}
                              className="rounded-lg p-2 text-text-muted transition-colors hover:bg-error/15 hover:text-error disabled:opacity-50"
                            >
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="hidden overflow-x-auto xl:block">
                <table className="w-full table-fixed border-collapse text-left">
                  <colgroup>
                    {canBulkEditPaymentStatus ? (
                      <col style={{ width: "80px" }} />
                    ) : null}
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "20%" }} />
                    <col style={{ width: "26%" }} />
                    <col style={{ width: "16%" }} />
                    <col style={{ width: "96px" }} />
                  </colgroup>
                  <thead className="bg-bg-secondary">
                    <tr className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                      {canBulkEditPaymentStatus ? (
                        <th className="w-10 px-2.5 py-2.5" scope="col">
                          <SelectionCheckbox
                            checked={allSelected}
                            indeterminate={hasPartialSelection}
                            onChange={() => toggleAllPage()}
                            disabled={bulkStatusMutation.isPending}
                            ariaLabel="Chọn tất cả trên trang này"
                          />
                        </th>
                      ) : null}
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

                      return (
                        <tr
                          key={output.id}
                          className={`border-t border-border-default bg-bg-surface transition-colors hover:bg-bg-secondary/40 ${canOpenOutputPopup ? "cursor-pointer" : ""}`}
                          onClick={
                            canOpenOutputPopup
                              ? () => openOutputDetail(output.id)
                              : undefined
                          }
                        >
                          {canBulkEditPaymentStatus ? (
                            <td className="px-2.5 py-2.5 align-middle" onClick={(e) => e.stopPropagation()}>
                              <SelectionCheckbox
                                checked={selected.has(output.id)}
                                onChange={() => toggleOne(output.id)}
                                disabled={bulkStatusMutation.isPending}
                                ariaLabel={`Chọn ${output.lessonName}`}
                              />
                            </td>
                          ) : null}
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
                            {canOpenOutputPopup ? (
                              <button
                                type="button"
                                className="text-left text-sm font-semibold leading-snug text-text-primary underline-offset-4 hover:text-primary hover:underline"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openOutputDetail(output.id);
                                }}
                              >
                                {output.lessonName}
                              </button>
                            ) : (
                              <span className="text-sm font-semibold leading-snug text-text-primary">
                                {output.lessonName}
                              </span>
                            )}
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
                          <td className="px-2.5 py-2.5 align-top text-right" onClick={(e) => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-0.5">
                              <button
                                type="button"
                                title="Sao chép liên kết"
                                disabled={!linkUrl}
                                onClick={() => void copyText(linkUrl, "liên kết")}
                                className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              </button>
                              <button
                                type="button"
                                title="Mở liên kết"
                                disabled={!linkUrl}
                                onClick={() => openExternal(linkUrl)}
                                className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-bg-secondary hover:text-primary disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                              </button>
                              {canDeleteOutputs ? (
                                <button
                                  type="button"
                                  title="Xóa"
                                  disabled={deleteMutation.isPending}
                                  onClick={() => confirmDelete(output)}
                                  className="rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/15 hover:text-error disabled:opacity-50"
                                >
                                  <svg className="size-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                                  </svg>
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/35 px-5 py-12 text-center">
              <p className="text-base font-semibold text-text-primary">
                Chưa có bài giáo án trong tháng này.
              </p>
              <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-text-secondary">
                {canCreateOutputs
                  ? "Thử đổi tháng hoặc tạo sản phẩm từ tab Tổng quan / chi tiết công việc."
                  : "Thử đổi tháng hoặc kiểm tra bộ lọc hiện tại."}
              </p>
            </div>
          )}

          {outputs.length > 0 ? (
            <div className="mt-6">
              <WorkPagination
                page={data.outputsMeta.page}
                totalPages={data.outputsMeta.totalPages}
                total={data.outputsMeta.total}
                isPending={isFetching && data.outputsMeta.page !== workPage}
                onPageChange={handlePageChange}
              />
            </div>
          ) : null}
        </div>
      </section>

      {canOpenOutputPopup ? (
        <LessonOutputQuickPopup
          open={Boolean(selectedOutputId)}
          outputId={selectedOutputId}
          forceSharedLayout
          showStaffSummary={canShowStaffSummary}
          allowTasklessOutput={canEditTasklessOutput}
          allowPaymentStatusEdit={canEditPaymentStatus}
          allowCostEdit={canEditCost}
          allowDelete={canDeleteOutputs}
          onClose={() => setSelectedOutputId(null)}
        />
      ) : null}

      {canBulkEditPaymentStatus && bulkEditPopupOpen && selectedCount > 0 ? (
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
                aria-labelledby="bulk-work-payment-status-title"
                className="relative w-full overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-2xl"
              >
                <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-success/0 via-success/50 to-primary/0" aria-hidden />
                <div className="absolute -right-8 -top-10 size-24 rounded-full bg-success/10 blur-3xl" aria-hidden />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Chỉnh sửa hàng loạt
                      </p>
                      <h2
                        id="bulk-work-payment-status-title"
                        className="mt-1 text-lg font-semibold text-text-primary text-balance"
                      >
                        Cập nhật trạng thái thanh toán
                      </h2>
                      <p className="mt-2 text-sm text-text-secondary">
                        Áp dụng cho{" "}
                        <span className="font-semibold text-primary">
                          {selectedCount}
                        </span>{" "}
                        bài đã chọn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeBulkEditPopup}
                      className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label="Đóng popup sửa trạng thái thanh toán"
                    >
                      <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                  <div className="mt-5 space-y-4">
                    <label className="block">
                      <span className="mb-2 block text-sm font-medium text-text-secondary">
                        Trạng thái muốn đổi
                      </span>
                      <UpgradedSelect
                        name="bulk-work-payment-status"
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
                        onClick={confirmBulkPaymentStatusUpdate}
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
    </section>
  );
}
