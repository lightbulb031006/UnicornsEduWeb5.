"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useDebouncedCallback } from "use-debounce";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as costApi from "@/lib/apis/cost.api";
import { CostFormPopup, CostListTableSkeleton } from "@/components/admin/cost";
import {
  COST_STATUS_OPTIONS,
  DEFAULT_BULK_COST_STATUS,
  getCostStatusChipClass,
  getCostStatusLabel,
} from "@/components/admin/cost/costStatusPresentation";
import MonthNav from "@/components/admin/MonthNav";
import type { CostFormSubmitPayload } from "@/components/admin/cost/CostFormPopup";
import SelectionCheckbox from "@/components/ui/SelectionCheckbox";
import { CostListItem, CostListResponse, CostStatus, CostUpsertMode } from "@/dtos/cost.dto";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";

const PAGE_SIZE = 20;
const SEARCH_DEBOUNCE_MS = 1000;

function normalizePage(rawPage: string | null): number {
  const parsed = Number(rawPage);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.floor(parsed);
}

function formatCurrency(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

export default function AdminCostsPage() {
  const { replace } = useRouter();
  const queryClient = useQueryClient();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const getSearchParam = searchParams.get.bind(searchParams);

  const page = normalizePage(getSearchParam("page"));
  const search = getSearchParam("search") ?? "";
  const monthParam = getSearchParam("month") ?? "";

  const [selectedMonth, setSelectedMonth] = useState(() => {
    if (monthParam && /^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam)) return monthParam;
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);

  const [searchInput, setSearchInput] = useState(search);
  const [popupOpen, setPopupOpen] = useState(false);
  const [popupMode, setPopupMode] = useState<CostUpsertMode>("create");
  const [selectedCost, setSelectedCost] = useState<CostListItem | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [costToDelete, setCostToDelete] = useState<{ id: string; category: string } | null>(null);
  const [selectedCostIds, setSelectedCostIds] = useState<Set<string>>(new Set());
  const [bulkEditPopupOpen, setBulkEditPopupOpen] = useState(false);
  const [bulkStatusDraft, setBulkStatusDraft] =
    useState<CostStatus>(DEFAULT_BULK_COST_STATUS);
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { isAdmin, isAssistant, isAccountant } =
    resolveAdminShellAccess(fullProfile);
  const canCreateCost = isAdmin || isAssistant || isAccountant;
  const canDeleteCost = isAdmin || isAssistant || isAccountant;

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (/^\d{4}-(0[1-9]|1[0-2])$/.test(monthParam) && monthParam !== selectedMonth) {
      setSelectedMonth(monthParam);
    }
  }, [monthParam, selectedMonth]);

  const syncMonthToUrl = (value: string) => {
    setSelectedMonth(value);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("month", value);
    params.set("page", "1");
    replace(`${pathname}?${params.toString()}`);
  };

  const [selectedYear, selectedMonthValue] = selectedMonth.split("-");

  const applySearchToUrl = useDebouncedCallback(
    (value: string, currentParams: string, currentPathname: string) => {
      const params = new URLSearchParams(currentParams);
      params.set("search", value);
      params.set("page", "1");
      replace(`${currentPathname}?${params.toString()}`);
    },
    SEARCH_DEBOUNCE_MS,
  );

  const handleSearchChange = (value: string) => {
    setSearchInput(value);
    applySearchToUrl(value, searchParams?.toString() ?? "", pathname);
  };

  const {
    data: costListResponse,
    isLoading,
    isError,
    error,
  } = useQuery<CostListResponse>({
    queryKey: ["cost", "list", page, PAGE_SIZE, search, selectedYear, selectedMonthValue],
    queryFn: () =>
      costApi.getCosts({
        page,
        limit: PAGE_SIZE,
        search: search.trim() || undefined,
        year: selectedYear,
        month: selectedMonthValue,
      }),
  });

  const list = useMemo<CostListItem[]>(
    () => costListResponse?.data ?? [],
    [costListResponse],
  );
  const pageCostIds = useMemo(() => list.map((cost) => cost.id), [list]);
  const visibleSelectedCostIds = useMemo(
    () => new Set(pageCostIds.filter((costId) => selectedCostIds.has(costId))),
    [pageCostIds, selectedCostIds],
  );
  const selectedOnPageCount = visibleSelectedCostIds.size;
  const totalSelectedCount = selectedCostIds.size;
  const selectedFromOtherPagesCount = totalSelectedCount - selectedOnPageCount;
  const allCostsSelectedOnPage =
    pageCostIds.length > 0 && selectedOnPageCount === pageCostIds.length;
  const hasPartialCostSelection =
    selectedOnPageCount > 0 && !allCostsSelectedOnPage;
  const total = costListResponse?.meta?.total ?? 0;
  const serverPage = costListResponse?.meta?.page;
  const currentPage = serverPage && Number.isFinite(serverPage) ? serverPage : page;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  useEffect(() => {
    setSelectedCostIds(new Set());
    setBulkEditPopupOpen(false);
  }, [search, selectedYear, selectedMonthValue]);

  useEffect(() => {
    if (!serverPage || serverPage === page) return;
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(serverPage));
    replace(`${pathname}?${params.toString()}`);
  }, [serverPage, page, searchParams, pathname, replace]);

  const handlePreviousPage = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(Math.max(1, currentPage - 1)));
    replace(`${pathname}?${params.toString()}`);
  };

  const handleNextPage = () => {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("page", String(Math.min(totalPages, currentPage + 1)));
    replace(`${pathname}?${params.toString()}`);
  };

  const getErrorMessage = (err: unknown, fallback: string) => {
    return (
      (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
      (err as Error)?.message ??
      fallback
    );
  };

  const createMutation = useMutation({
    mutationFn: costApi.createCost,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cost", "list"] });
      toast.success("Đã tạo khoản chi phí.");
      setPopupOpen(false);
      setSelectedCost(null);
      setPopupMode("create");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không thể tạo khoản chi phí."));
    },
  });

  const updateMutation = useMutation({
    mutationFn: costApi.updateCost,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["cost", "list"] });
      toast.success("Đã cập nhật khoản chi phí.");
      setPopupOpen(false);
      setSelectedCost(null);
      setPopupMode("create");
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không thể cập nhật khoản chi phí."));
    },
  });

  const deleteMutation = useMutation({
    mutationFn: ({ id }: { id: string }) => costApi.deleteCostById(id),
    onSuccess: async (_, variables) => {
      setSelectedCostIds((current) => {
        if (!current.has(variables.id)) return current;
        const next = new Set(current);
        next.delete(variables.id);
        return next;
      });
      toast.success("Đã xóa khoản chi phí.");
      await queryClient.invalidateQueries({ queryKey: ["cost", "list"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không thể xóa khoản chi phí."));
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: (status: CostStatus) =>
      costApi.bulkUpdateCostStatus({
        costIds: Array.from(selectedCostIds),
        status,
      }),
    onSuccess: async (result, status) => {
      const statusLabel = getCostStatusLabel(status).toLowerCase();
      if (result.updatedCount > 0) {
        toast.success(`Đã chuyển ${result.updatedCount} khoản chi sang trạng thái ${statusLabel}.`);
      } else {
        toast.success(`Các khoản chi đã ở trạng thái ${statusLabel}.`);
      }

      setBulkEditPopupOpen(false);
      setSelectedCostIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["cost", "list"] });
    },
    onError: (err: unknown) => {
      toast.error(getErrorMessage(err, "Không thể cập nhật trạng thái thanh toán hàng loạt."));
    },
  });

  const handleOpenCreatePopup = () => {
    if (!canCreateCost) return;
    setPopupMode("create");
    setSelectedCost(null);
    setPopupOpen(true);
  };

  const handleOpenEditPopup = (cost: CostListItem) => {
    setPopupMode("edit");
    setSelectedCost(cost);
    setPopupOpen(true);
  };

  const handleClosePopup = () => {
    if (createMutation.isPending || updateMutation.isPending) return;
    setPopupOpen(false);
    setSelectedCost(null);
    setPopupMode("create");
  };

  const toggleCostSelection = (costId: string) => {
    if (bulkStatusMutation.isPending) return;

    setSelectedCostIds((current) => {
      const next = new Set(current);
      if (next.has(costId)) {
        next.delete(costId);
      } else {
        next.add(costId);
      }
      return next;
    });
  };

  const toggleAllCosts = () => {
    if (bulkStatusMutation.isPending) return;
    setSelectedCostIds((current) => {
      const next = new Set(current);

      if (allCostsSelectedOnPage) {
        pageCostIds.forEach((costId) => next.delete(costId));
      } else {
        pageCostIds.forEach((costId) => next.add(costId));
      }

      return next;
    });
  };

  const openBulkEditPopup = () => {
    if (totalSelectedCount === 0 || bulkStatusMutation.isPending) return;
    setBulkStatusDraft(DEFAULT_BULK_COST_STATUS);
    setBulkEditPopupOpen(true);
  };

  const closeBulkEditPopup = () => {
    if (bulkStatusMutation.isPending) return;
    setBulkEditPopupOpen(false);
  };

  const confirmBulkStatusUpdate = () => {
    if (totalSelectedCount === 0 || bulkStatusMutation.isPending) return;
    bulkStatusMutation.mutate(bulkStatusDraft);
  };

  const handleSubmitCost = async (payload: CostFormSubmitPayload) => {
    if (popupMode === "create") {
      if (!canCreateCost) {
        toast.error("Bạn không có quyền tạo khoản chi mới.");
        return;
      }

      try {
        await createMutation.mutateAsync({
          category: payload.category,
          month: payload.month,
          date: payload.date,
          status: payload.status,
          amount: payload.amount,
        });
      } catch {
        // toast lỗi đã xử lý trong onError
      }
      return;
    }

    const editingId = selectedCost?.id;
    if (!editingId) {
      toast.error("Không tìm thấy khoản chi phí để cập nhật.");
      return;
    }

    try {
      await updateMutation.mutateAsync({
        id: editingId,
        category: payload.category,
        month: payload.month ?? null,
        date: payload.date ?? null,
        status: payload.status,
        amount: payload.amount,
      });
    } catch {
      // toast lỗi đã xử lý trong onError
    }
  };

  const openDeleteConfirm = (id: string, category: string) => {
    if (!canDeleteCost) return;
    setCostToDelete({ id, category });
    setDeleteConfirmOpen(true);
  };

  const closeDeleteConfirm = () => {
    setDeleteConfirmOpen(false);
    setCostToDelete(null);
  };

  const handleDeleteConfirmed = async () => {
    if (!costToDelete) return;
    try {
      await deleteMutation.mutateAsync({ id: costToDelete.id });
      closeDeleteConfirm();
    } catch {
      // toast lỗi đã xử lý trong onError
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 sm:p-6">
      <div className="flex min-w-0 flex-1 flex-col rounded-xl border border-border-default bg-bg-surface p-3 shadow-sm sm:rounded-lg sm:p-5">
        <section className="relative mb-4 overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-secondary via-bg-surface to-bg-secondary/70 p-4 sm:p-5">
          <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/10 blur-2xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-10 left-16 size-28 rounded-full bg-secondary/50 blur-2xl" aria-hidden />

          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0">
              <h1 className="text-xl font-semibold text-text-primary sm:text-2xl">Chi phí mở rộng</h1>
              <p className="mt-1 text-sm text-text-secondary">
                Quản lý và theo dõi các khoản phát sinh theo tháng.
              </p>
            </div>
            {canCreateCost ? (
              <button
                type="button"
                className="self-end flex size-11 items-center justify-center rounded-full bg-primary text-text-inverse shadow-sm transition-colors duration-200 hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:size-10 sm:self-auto"
                aria-label="Thêm chi phí"
                title="Thêm chi phí"
                onClick={handleOpenCreatePopup}
              >
                <svg className="size-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <span className="sr-only">Thêm chi phí</span>
              </button>
            ) : null}
          </div>

          <div className="relative mt-4">
            <label className="block text-sm font-medium text-text-secondary" htmlFor="cost-search-input">
              Tìm kiếm
            </label>
            <div className="mt-1 flex items-center rounded-md border border-border-default bg-bg-surface/90 px-3 focus-within:border-border-focus focus-within:ring-2 focus-within:ring-border-focus">
              <svg className="size-4 shrink-0 text-text-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="m21 21-4.35-4.35m1.85-5.15a7 7 0 1 1-14 0 7 7 0 0 1 14 0Z" />
              </svg>
              <input
                id="cost-search-input"
                type="search"
                value={searchInput}
                onChange={(e) => handleSearchChange(e.target.value)}
                placeholder="Theo danh mục…"
                className="min-w-0 flex-1 border-0 bg-transparent px-2 py-2.5 text-sm text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-0"
                aria-label="Tìm theo danh mục"
              />
            </div>
          </div>
        </section>

        <div className="mb-4">
          <MonthNav
            value={selectedMonth}
            onChange={syncMonthToUrl}
            monthPopupOpen={monthPopupOpen}
            setMonthPopupOpen={setMonthPopupOpen}
            countLabel={`${total} khoản`}
          />
        </div>

        {totalSelectedCount > 0 ? (
          <section className="relative mb-4 overflow-hidden rounded-2xl border border-border-default bg-gradient-to-br from-bg-surface via-bg-secondary/70 to-bg-surface p-3 shadow-sm">
            <div className="pointer-events-none absolute -right-8 top-0 size-24 rounded-full bg-success/10 blur-2xl" aria-hidden />
            <div className="pointer-events-none absolute bottom-0 left-10 size-20 rounded-full bg-primary/10 blur-2xl" aria-hidden />

            <div className="relative flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="space-y-1">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                  Thanh toán hàng loạt
                </p>
                <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                  <span className="inline-flex items-center rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 font-medium text-primary">
                    Đã chọn {totalSelectedCount} khoản
                  </span>
                  {selectedFromOtherPagesCount > 0 ? (
                    <span className="inline-flex items-center rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-text-secondary">
                      +{selectedFromOtherPagesCount} khoản từ trang khác
                    </span>
                  ) : (
                    <span className="text-text-muted">
                      Chọn nhiều trang trong cùng bộ lọc hiện tại.
                    </span>
                  )}
                </div>
              </div>

              <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end md:w-auto">
                <button
                  type="button"
                  onClick={toggleAllCosts}
                  disabled={pageCostIds.length === 0 || bulkStatusMutation.isPending}
                  className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {allCostsSelectedOnPage
                    ? `Bỏ chọn ${selectedOnPageCount} khoản ở trang này`
                    : `Chọn cả ${pageCostIds.length} khoản ở trang ${currentPage}`}
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCostIds(new Set())}
                  disabled={bulkStatusMutation.isPending}
                  className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Bỏ chọn toàn bộ
                </button>
                <button
                  type="button"
                  onClick={openBulkEditPopup}
                  disabled={bulkStatusMutation.isPending}
                  className="touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-[0_14px_30px_-18px_color-mix(in_srgb,var(--ue-primary)_55%,transparent)] transition-all hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label={`Sửa trạng thái thanh toán cho ${totalSelectedCount} khoản chi đã chọn`}
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                    />
                  </svg>
                  <span>Sửa trạng thái thanh toán</span>
                  <span className="rounded-full bg-text-inverse/18 px-2 py-0.5 text-xs font-semibold tabular-nums">
                    {totalSelectedCount}
                  </span>
                </button>
              </div>
            </div>
          </section>
        ) : null}

        <div className="min-w-0 flex-1 overflow-auto">
          {isLoading ? (
            <CostListTableSkeleton
              rows={6}
              showActions={canDeleteCost}
              showPagination
            />
          ) : isError ? (
            <div className="py-16 text-center text-error" role="alert" aria-live="assertive">
              <p className="text-sm">
                {(error as { response?: { data?: { message?: string } } })?.response?.data?.message ??
                  (error as Error)?.message ??
                  "Không tải được danh sách chi phí."}
              </p>
            </div>
          ) : list.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-text-muted" aria-live="polite">
              <p className="text-sm">
                {search ? "Không có kết quả phù hợp." : "Chưa có khoản chi phí nào."}
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-3 sm:hidden">
                {list.map((row) => (
                  <article
                    key={row.id}
                    role="button"
                    tabIndex={0}
                    className={`rounded-xl border p-3 shadow-sm transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${visibleSelectedCostIds.has(row.id)
                        ? "border-primary/35 bg-primary/5 shadow-[0_20px_36px_-26px_color-mix(in_srgb,var(--ue-primary)_48%,transparent)]"
                      : "border-border-default bg-bg-surface hover:-translate-y-0.5 hover:bg-bg-secondary/90"
                      }`}
                    onClick={() => handleOpenEditPopup(row)}
                    onKeyDown={(event) => {
                      if (event.key !== "Enter" && event.key !== " ") return;
                      event.preventDefault();
                      handleOpenEditPopup(row);
                    }}
                    aria-label={`Xem và chỉnh sửa ${row.category?.trim() || "khoản chi phí"}`}
                  >
                    <div className="flex items-start gap-3">
                      <SelectionCheckbox
                        checked={visibleSelectedCostIds.has(row.id)}
                        onChange={() => toggleCostSelection(row.id)}
                        disabled={bulkStatusMutation.isPending}
                        ariaLabel={`Chọn khoản chi ${row.category?.trim() || row.id}`}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="line-clamp-2 text-sm font-semibold text-text-primary">
                            {row.category?.trim() || "—"}
                          </p>
                          {canDeleteCost ? (
                            <button
                              type="button"
                              className="shrink-0 rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:opacity-50"
                              aria-label={`Xóa ${row.category || "khoản chi phí"}`}
                              title="Xóa"
                              disabled={deleteMutation.isPending}
                              onClick={(event) => {
                                event.stopPropagation();
                                openDeleteConfirm(row.id, row.category?.trim() || "khoản chi phí");
                              }}
                            >
                              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                <path
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                  strokeWidth={2}
                                  d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                />
                              </svg>
                            </button>
                          ) : null}
                        </div>
                        <div className="mt-2 grid grid-cols-[72px_1fr] gap-x-2 gap-y-1 text-xs">
                          <span className="text-text-muted">Tháng</span>
                          <span className="text-text-secondary">{row.month?.trim() || "—"}</span>
                          <span className="text-text-muted">Ngày</span>
                          <span className="text-text-secondary">{formatDate(row.date)}</span>
                          <span className="text-text-muted">Trạng thái</span>
                          <span
                            className={`inline-flex w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${getCostStatusChipClass(row.status)}`}
                          >
                            {getCostStatusLabel(row.status)}
                          </span>
                        </div>
                        <p className="mt-2 text-sm font-semibold tabular-nums text-text-primary">
                          {formatCurrency(row.amount)}
                        </p>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                  <caption className="sr-only">Danh sách chi phí mở rộng</caption>
                  <thead>
                    <tr className="border-b border-border-default bg-bg-secondary/80">
                      <th scope="col" className="px-3 py-3 text-center">
                        <SelectionCheckbox
                          checked={allCostsSelectedOnPage}
                          indeterminate={hasPartialCostSelection}
                          onChange={toggleAllCosts}
                          disabled={pageCostIds.length === 0 || bulkStatusMutation.isPending}
                          ariaLabel="Chọn tất cả khoản chi trên trang hiện tại"
                        />
                      </th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Danh mục</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Tháng</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Ngày</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Trạng thái</th>
                      <th scope="col" className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">Số tiền</th>
                      {canDeleteCost ? (
                        <th scope="col" className="w-24 px-4 py-3">
                          <span className="sr-only">Xóa</span>
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((row) => (
                      <tr
                        key={row.id}
                        role="button"
                        tabIndex={0}
                        className={`group cursor-pointer border-b border-border-default transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${visibleSelectedCostIds.has(row.id)
                          ? "bg-primary/5 hover:bg-primary/10"
                          : "bg-bg-surface hover:bg-bg-secondary/80"
                          }`}
                        onClick={() => handleOpenEditPopup(row)}
                        onKeyDown={(event) => {
                          if (event.key !== "Enter" && event.key !== " ") return;
                          event.preventDefault();
                          handleOpenEditPopup(row);
                        }}
                      >
                        <td className="px-3 py-3 text-center align-middle">
                          <SelectionCheckbox
                            checked={visibleSelectedCostIds.has(row.id)}
                            onChange={() => toggleCostSelection(row.id)}
                            disabled={bulkStatusMutation.isPending}
                            ariaLabel={`Chọn khoản chi ${row.category?.trim() || row.id}`}
                          />
                        </td>
                        <td className="min-w-0 px-4 py-3 text-text-primary">
                          <span className="truncate">{row.category?.trim() || "—"}</span>
                        </td>
                        <td className="px-4 py-3 text-text-secondary">{row.month?.trim() || "—"}</td>
                        <td className="px-4 py-3 text-text-secondary">{formatDate(row.date)}</td>
                        <td className="px-4 py-3 text-text-secondary">
                          <span
                            className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${getCostStatusChipClass(row.status)}`}
                          >
                            {getCostStatusLabel(row.status)}
                          </span>
                        </td>
                        <td className="px-4 py-3 tabular-nums text-text-primary">{formatCurrency(row.amount)}</td>
                        {canDeleteCost ? (
                          <td className="px-4 py-3">
                            <div className="flex items-center justify-end opacity-0 transition-opacity duration-150 group-hover:opacity-100 focus-within:opacity-100">
                              <button
                                type="button"
                                className="rounded p-1.5 text-text-muted transition-colors duration-200 hover:bg-error/15 hover:text-error focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:opacity-50"
                                aria-label={`Xóa ${row.category || "khoản chi phí"}`}
                                title="Xóa"
                                disabled={deleteMutation.isPending}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  openDeleteConfirm(row.id, row.category?.trim() || "khoản chi phí");
                                }}
                              >
                                <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                                  <path
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                    strokeWidth={2}
                                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                                  />
                                </svg>
                              </button>
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <nav
                  className="mt-4 flex flex-col gap-3 border-t border-border-default pt-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                  aria-label="Phân trang"
                >
                  <p className="text-sm text-text-muted" aria-live="polite">
                    Hiển thị {(currentPage - 1) * PAGE_SIZE + 1}-{Math.min(currentPage * PAGE_SIZE, total)} trong {total} khoản
                  </p>
                  <div className="grid grid-cols-3 items-center gap-2 sm:flex sm:items-center">
                    <button
                      type="button"
                      className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={currentPage <= 1}
                      aria-label="Trang trước"
                      onClick={handlePreviousPage}
                    >
                      Trước
                    </button>
                    <span className="text-center tabular-nums text-sm text-text-secondary">
                      {currentPage}/{totalPages}
                    </span>
                    <button
                      type="button"
                      className="rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={currentPage >= totalPages}
                      aria-label="Trang sau"
                      onClick={handleNextPage}
                    >
                      Sau
                    </button>
                  </div>
                </nav>
              )}
            </>
          )}
        </div>
      </div>

      <CostFormPopup
        key={`cost-form-${popupMode}-${selectedCost?.id ?? "new"}-${popupOpen ? "open" : "closed"}`}
        open={popupOpen}
        mode={popupMode}
        onClose={handleClosePopup}
        initialData={popupMode === "edit" ? selectedCost : null}
        onSubmit={handleSubmitCost}
        isSubmitting={createMutation.isPending || updateMutation.isPending}
      />
      {bulkEditPopupOpen ? (
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
                aria-labelledby="bulk-cost-status-title"
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
                        id="bulk-cost-status-title"
                        className="mt-1 text-lg font-semibold text-text-primary text-balance"
                      >
                        Cập nhật trạng thái thanh toán
                      </h2>
                      <p className="mt-2 text-sm text-text-secondary">
                        Áp dụng cho{" "}
                        <span className="font-semibold text-primary">
                          {totalSelectedCount}
                        </span>{" "}
                        khoản chi đã chọn.
                      </p>
                      {selectedFromOtherPagesCount > 0 ? (
                        <p className="mt-1 text-xs text-text-muted">
                          Bao gồm {selectedFromOtherPagesCount} khoản được giữ từ trang khác.
                        </p>
                      ) : null}
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
                        name="bulk-cost-status"
                        value={bulkStatusDraft}
                        onValueChange={(value) => setBulkStatusDraft(value as CostStatus)}
                        options={COST_STATUS_OPTIONS}
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
      {canDeleteCost && deleteConfirmOpen && costToDelete ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeDeleteConfirm}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-cost-title"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-9 items-center justify-center rounded-full bg-error/10 text-error">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v4m0 4h.01M5.1 19h13.8a2 2 0 001.79-2.89L13.79 4.79a2 2 0 00-3.58 0L3.31 16.11A2 2 0 005.1 19z"
                  />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2
                  id="delete-cost-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Xóa khoản chi phí?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Bạn có chắc muốn xóa khoản{" "}
                  <span className="font-semibold text-text-primary">
                    {costToDelete.category || "chi phí này"}
                  </span>
                  ? Hành động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                className="min-h-10 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:flex-none sm:px-5"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deleteMutation.isPending}
                className="min-h-10 flex-1 rounded-md border border-error bg-error px-4 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-error/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-60 sm:flex-none sm:px-5"
              >
                {deleteMutation.isPending ? "Đang xóa…" : "Xóa khoản chi phí"}
              </button>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
