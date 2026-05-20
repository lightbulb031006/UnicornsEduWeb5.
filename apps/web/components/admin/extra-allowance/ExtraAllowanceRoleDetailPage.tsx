"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import SelectionCheckbox from "@/components/ui/SelectionCheckbox";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { getFullProfile } from "@/lib/apis/auth.api";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import {
  canManageAdminExtraAllowance,
  resolveAdminShellAccess,
} from "@/lib/admin-shell-access";
import * as staffApi from "@/lib/apis/staff.api";
import ExtraAllowanceFormPopup, {
  type ExtraAllowanceFormSubmitPayload,
} from "./ExtraAllowanceFormPopup";
import ExtraAllowanceListTableSkeleton from "./ExtraAllowanceListTableSkeleton";
import {
  DEFAULT_BULK_EXTRA_ALLOWANCE_STATUS,
  EXTRA_ALLOWANCE_STATUS_OPTIONS,
  getExtraAllowanceRoleChipClass,
  getExtraAllowanceRoleLabel,
  getExtraAllowanceStatusChipClass,
  getExtraAllowanceStatusLabel,
} from "./extraAllowancePresentation";
import type {
  ExtraAllowanceBaseFields,
  ExtraAllowanceListItem,
  ExtraAllowanceListResponse,
  ExtraAllowanceRoleType,
  ExtraAllowanceStatus,
} from "@/dtos/extra-allowance.dto";
import type { StaffDetail, StaffOption } from "@/dtos/staff.dto";
import * as extraAllowanceApi from "@/lib/apis/extra-allowance.api";

const MAX_VISIBLE_ALLOWANCES = 20;
const EMPTY_ALLOWANCES: ExtraAllowanceListItem[] = [];

type SupportedRoleType = Extract<
  ExtraAllowanceRoleType,
  "assistant" | "communication" | "technical" | "accountant"
>;

type RoleTheme = {
  listGradientClassName: string;
  listGlowTopClassName: string;
  listGlowBottomClassName: string;
  selectionBadgeClassName: string;
  activeCardClassName: string;
  activeRowClassName: string;
  popupGlowClassName: string;
};

const ROLE_THEMES: Record<SupportedRoleType, RoleTheme> = {
  assistant: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-warning/12",
    listGlowBottomClassName: "bg-primary/10",
    selectionBadgeClassName:
      "border-warning/15 bg-warning/8 text-warning",
    activeCardClassName:
      "border-warning/35 bg-warning/5 shadow-[0_20px_36px_-26px_color-mix(in_srgb,var(--ue-warning)_42%,transparent)]",
    activeRowClassName:
      "border-warning/15 bg-warning/5 hover:bg-warning/8",
    popupGlowClassName: "bg-warning/10",
  },
  communication: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-error/12",
    listGlowBottomClassName: "bg-primary/10",
    selectionBadgeClassName: "border-error/15 bg-error/8 text-error",
    activeCardClassName:
      "border-error/35 bg-error/5 shadow-[0_20px_36px_-26px_color-mix(in_srgb,var(--ue-error)_38%,transparent)]",
    activeRowClassName:
      "border-error/15 bg-error/5 hover:bg-error/8",
    popupGlowClassName: "bg-error/10",
  },
  technical: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-info/12",
    listGlowBottomClassName: "bg-primary/10",
    selectionBadgeClassName: "border-info/15 bg-info/8 text-info",
    activeCardClassName:
      "border-info/35 bg-info/5 shadow-[0_20px_36px_-26px_color-mix(in_srgb,var(--ue-info)_38%,transparent)]",
    activeRowClassName:
      "border-info/15 bg-info/5 hover:bg-info/8",
    popupGlowClassName: "bg-info/10",
  },
  accountant: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-success/12",
    listGlowBottomClassName: "bg-info/10",
    selectionBadgeClassName:
      "border-success/15 bg-success/8 text-success",
    activeCardClassName:
      "border-success/35 bg-success/5 shadow-[0_20px_36px_-26px_color-mix(in_srgb,var(--ue-success)_40%,transparent)]",
    activeRowClassName:
      "border-success/15 bg-success/5 hover:bg-success/8",
    popupGlowClassName: "bg-success/10",
  },
};

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

function formatCurrency(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) {
    return "—";
  }

  return new Intl.NumberFormat("vi-VN", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  }).format(value);
}

function formatMonthLabel(value: string | null | undefined) {
  if (!value?.trim()) {
    return "—";
  }

  const matched = /^(\d{4})-(\d{2})$/.exec(value.trim());
  if (!matched) {
    return value;
  }

  return `${matched[2]}/${matched[1]}`;
}

function resolveStaffName(item: ExtraAllowanceListItem) {
  return item.staff?.fullName?.trim() || "Nhân sự chưa xác định";
}

function resolveNote(note: string | null | undefined) {
  return note?.trim() || "Chưa có ghi chú.";
}

function getDefaultMonthKey() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function toStaffOption(staff: StaffDetail): StaffOption {
  return {
    id: staff.id,
    fullName: staff.fullName,
    status: staff.status,
    roles: Array.isArray(staff.roles) ? staff.roles : [],
  };
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

function StatusPill({ status }: { status: ExtraAllowanceStatus | null | undefined }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-3 py-1.5 text-xs font-semibold ring-1 ${getExtraAllowanceStatusChipClass(
        status,
      )}`}
    >
      {getExtraAllowanceStatusLabel(status)}
    </span>
  );
}

export default function ExtraAllowanceRoleDetailPage({
  roleType,
  staffId,
}: {
  roleType: SupportedRoleType;
  staffId?: string | null;
}) {
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const queryClient = useQueryClient();
  const theme = ROLE_THEMES[roleType];
  const roleLabel = getExtraAllowanceRoleLabel(roleType);
  const normalizedStaffId = staffId?.trim() || "";
  const backHref = normalizedStaffId
    ? buildAdminLikePath(routeBase, `staffs/${encodeURIComponent(normalizedStaffId)}`)
    : buildAdminLikePath(routeBase, "staffs");

  const [selectedAllowanceIds, setSelectedAllowanceIds] = useState<Set<string>>(
    new Set(),
  );
  const [createPopupOpen, setCreatePopupOpen] = useState(false);
  const [allowanceToDelete, setAllowanceToDelete] =
    useState<ExtraAllowanceListItem | null>(null);
  const [bulkEditPopupOpen, setBulkEditPopupOpen] = useState(false);
  const [bulkStatusDraft, setBulkStatusDraft] =
    useState<ExtraAllowanceStatus>(DEFAULT_BULK_EXTRA_ALLOWANCE_STATUS);
  const defaultMonthKey = getDefaultMonthKey();
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const adminShellAccess = resolveAdminShellAccess(fullProfile);
  const canManageAllowance = canManageAdminExtraAllowance(adminShellAccess);
  const canCreateAllowance = canManageAllowance;
  const canDeleteAllowance = canManageAllowance;

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ExtraAllowanceListResponse>({
    queryKey: [
      "extra-allowance",
      "role-detail",
      roleType,
      normalizedStaffId,
      MAX_VISIBLE_ALLOWANCES,
    ],
    queryFn: () =>
      extraAllowanceApi.getExtraAllowances({
        page: 1,
        limit: MAX_VISIBLE_ALLOWANCES,
        roleType,
        staffId: normalizedStaffId || undefined,
      }),
  });
  const {
    data: staffDetail,
    isLoading: isStaffDetailLoading,
    isError: isStaffDetailError,
  } = useQuery<StaffDetail>({
    queryKey: ["staff", "detail", normalizedStaffId],
    queryFn: () => staffApi.getStaffById(normalizedStaffId),
    enabled: !!normalizedStaffId,
  });

  const allowances = data?.data ?? EMPTY_ALLOWANCES;
  const visibleAllowanceIds = useMemo(
    () => allowances.map((allowance) => allowance.id),
    [allowances],
  );
  const selectedVisibleAllowanceIds = useMemo(
    () => visibleAllowanceIds.filter((allowanceId) => selectedAllowanceIds.has(allowanceId)),
    [selectedAllowanceIds, visibleAllowanceIds],
  );
  const totalAllowances = allowances.length;
  const paidCount = useMemo(
    () => allowances.filter((allowance) => allowance.status === "paid").length,
    [allowances],
  );
  const pendingCount = useMemo(
    () => allowances.filter((allowance) => allowance.status === "pending").length,
    [allowances],
  );
  const totalAvailable = data?.meta.total ?? totalAllowances;
  const selectedCount = selectedVisibleAllowanceIds.length;
  const allAllowancesSelected =
    visibleAllowanceIds.length > 0 && selectedCount === visibleAllowanceIds.length;
  const hasPartialSelection = selectedCount > 0 && !allAllowancesSelected;
  const scopeDescription = normalizedStaffId
    ? "Lịch sử trợ cấp đã ghi nhận cho nhân sự được chọn."
    : `Theo dõi các khoản trợ cấp thuộc nhóm ${roleLabel.toLowerCase()}.`;
  const visibilityNote =
    totalAvailable > totalAllowances
      ? `Đang hiển thị ${totalAllowances}/${totalAvailable} khoản mới nhất.`
      : scopeDescription;
  const lockedStaffContext = useMemo(() => {
    if (!staffDetail) {
      return null;
    }

    return {
      staff: toStaffOption(staffDetail),
      roleType,
    };
  }, [roleType, staffDetail]);
  const createPopupInitialData = useMemo<ExtraAllowanceBaseFields | null>(() => {
    if (normalizedStaffId && !lockedStaffContext) {
      return null;
    }

    if (!lockedStaffContext) {
      return {
        month: defaultMonthKey,
        status: "pending",
        roleType,
      };
    }

    return {
      staffId: lockedStaffContext.staff.id,
      month: defaultMonthKey,
      status: "pending",
      roleType,
      staff: {
        id: lockedStaffContext.staff.id,
        fullName: lockedStaffContext.staff.fullName,
        status: lockedStaffContext.staff.status,
        roles: lockedStaffContext.staff.roles,
      },
    };
  }, [defaultMonthKey, lockedStaffContext, normalizedStaffId, roleType]);
  const createMutation = useMutation({
    mutationFn: extraAllowanceApi.createExtraAllowance,
    onSuccess: async (createdAllowance) => {
      toast.success("Đã tạo trợ cấp.");
      setCreatePopupOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["extra-allowance"] });
      const staffIncomeSummaryId = createdAllowance.staffId ?? normalizedStaffId;
      if (staffIncomeSummaryId) {
        await queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", staffIncomeSummaryId],
        });
      }
    },
    onError: (mutationError: unknown) => {
      toast.error(getErrorMessage(mutationError, "Không thể tạo trợ cấp."));
    },
  });
  const createButtonLabel = createMutation.isPending
    ? "Đang tạo trợ cấp…"
    : isStaffDetailLoading
      ? "Đang tải nhân sự…"
      : "Thêm trợ cấp";

  const deleteMutation = useMutation({
    mutationFn: (allowance: ExtraAllowanceListItem) =>
      extraAllowanceApi.deleteExtraAllowanceById(allowance.id),
    onSuccess: async (_deletedAllowance, deletedAllowance) => {
      const willClearSelection =
        selectedAllowanceIds.has(deletedAllowance.id) && selectedCount === 1;
      setSelectedAllowanceIds((current) => {
        if (!current.has(deletedAllowance.id)) {
          return current;
        }

        const next = new Set(current);
        next.delete(deletedAllowance.id);
        return next;
      });
      if (willClearSelection) {
        setBulkEditPopupOpen(false);
      }
      toast.success("Đã xóa khoản trợ cấp.");
      await queryClient.invalidateQueries({ queryKey: ["extra-allowance"] });
      const staffIncomeSummaryId = deletedAllowance.staffId ?? normalizedStaffId;
      if (staffIncomeSummaryId) {
        await queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", staffIncomeSummaryId],
        });
      }
    },
    onError: (mutationError: unknown) => {
      toast.error(getErrorMessage(mutationError, "Không thể xóa khoản trợ cấp."));
    },
  });

  const bulkStatusMutation = useMutation({
    mutationFn: (status: ExtraAllowanceStatus) =>
      extraAllowanceApi.bulkUpdateExtraAllowanceStatus({
        allowanceIds: selectedVisibleAllowanceIds,
        status,
      }),
    onSuccess: async (result, status) => {
      const statusLabel = getExtraAllowanceStatusLabel(status).toLowerCase();

      if (result.updatedCount > 0) {
        toast.success(
          `Đã chuyển ${result.updatedCount} khoản trợ cấp sang trạng thái ${statusLabel}.`,
        );
      } else {
        toast.success(`Các khoản trợ cấp đã ở trạng thái ${statusLabel}.`);
      }

      setBulkEditPopupOpen(false);
      setSelectedAllowanceIds(new Set());
      await queryClient.invalidateQueries({ queryKey: ["extra-allowance"] });
      if (normalizedStaffId) {
        await queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", normalizedStaffId],
        });
      }
    },
    onError: (mutationError: unknown) => {
      toast.error(
        getErrorMessage(
          mutationError,
          "Không thể cập nhật trạng thái thanh toán trợ cấp.",
        ),
      );
    },
  });

  const toggleAllowanceSelection = (allowanceId: string) => {
    if (bulkStatusMutation.isPending) return;

    if (
      bulkEditPopupOpen &&
      selectedCount === 1 &&
      selectedAllowanceIds.has(allowanceId)
    ) {
      setBulkEditPopupOpen(false);
    }

    setSelectedAllowanceIds((current) => {
      const next = new Set(current);
      if (next.has(allowanceId)) {
        next.delete(allowanceId);
      } else {
        next.add(allowanceId);
      }
      return next;
    });
  };

  const toggleAllAllowances = () => {
    if (bulkStatusMutation.isPending) return;
    if (allAllowancesSelected) {
      setBulkEditPopupOpen(false);
    }
    setSelectedAllowanceIds(
      allAllowancesSelected ? new Set() : new Set(visibleAllowanceIds),
    );
  };

  const clearSelection = () => {
    if (selectedCount === 0 || bulkStatusMutation.isPending) return;
    setBulkEditPopupOpen(false);
    setSelectedAllowanceIds(new Set());
  };

  const openBulkEditPopup = () => {
    if (selectedCount === 0 || bulkStatusMutation.isPending) return;
    setBulkStatusDraft(DEFAULT_BULK_EXTRA_ALLOWANCE_STATUS);
    setBulkEditPopupOpen(true);
  };

  const openCreatePopup = () => {
    if (
      !canCreateAllowance ||
      (normalizedStaffId && !lockedStaffContext) ||
      !createPopupInitialData ||
      createMutation.isPending
    ) {
      return;
    }

    setCreatePopupOpen(true);
  };

  const closeCreatePopup = () => {
    if (createMutation.isPending) return;
    setCreatePopupOpen(false);
  };

  const openDeleteConfirm = (allowance: ExtraAllowanceListItem) => {
    if (!canDeleteAllowance || deleteMutation.isPending || bulkStatusMutation.isPending) {
      return;
    }
    setAllowanceToDelete(allowance);
  };

  const closeDeleteConfirm = () => {
    if (deleteMutation.isPending) return;
    setAllowanceToDelete(null);
  };

  const closeBulkEditPopup = () => {
    if (bulkStatusMutation.isPending) return;
    setBulkEditPopupOpen(false);
  };

  const confirmBulkStatusUpdate = () => {
    if (selectedCount === 0 || bulkStatusMutation.isPending) return;
    bulkStatusMutation.mutate(bulkStatusDraft);
  };

  const handleCreateExtraAllowance = async (
    payload: ExtraAllowanceFormSubmitPayload,
  ) => {
    if (!canCreateAllowance) {
      toast.error("Bạn không có quyền tạo trợ cấp mới.");
      return;
    }

    try {
      await createMutation.mutateAsync({
        staffId: payload.staffId,
        month: payload.month,
        amount: payload.amount,
        status: payload.status,
        note: payload.note,
        roleType: payload.roleType,
      });
    } catch {
      // toast lỗi đã xử lý trong onError
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!allowanceToDelete || !canDeleteAllowance) return;

    try {
      await deleteMutation.mutateAsync(allowanceToDelete);
      setAllowanceToDelete(null);
    } catch {
      // toast lỗi đã xử lý trong onError
    }
  };

  const renderDeleteAllowanceButton = (allowance: ExtraAllowanceListItem) => {
    if (!canDeleteAllowance) {
      return null;
    }

    const staffName = resolveStaffName(allowance);

    return (
      <button
        type="button"
        onClick={() => openDeleteConfirm(allowance)}
        disabled={deleteMutation.isPending || bulkStatusMutation.isPending}
        className="shrink-0 rounded-lg p-1.5 text-text-muted transition-colors hover:bg-error/15 hover:text-error focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
        aria-label={`Xóa khoản trợ cấp của ${staffName}`}
        title="Xóa trợ cấp"
      >
        <svg
          className="size-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
          />
        </svg>
      </button>
    );
  };

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
          aria-hidden="true"
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

      {isLoading ? (
        <>
          <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
            <div className="grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`extra-allowance-summary-skeleton-${index}`}
                  className="h-24 animate-pulse rounded-[1.5rem] border border-border-default bg-bg-secondary/70"
                />
              ))}
            </div>
          </section>

          <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
            <div className="h-6 w-48 animate-pulse rounded-full bg-bg-secondary/70" />
            <div className="mt-3 h-4 w-full max-w-2xl animate-pulse rounded bg-bg-secondary/70" />
            <div className="mt-5">
              <ExtraAllowanceListTableSkeleton
                rows={5}
                mobileCards={4}
                variant="roleDetail"
                showToolbar
              />
            </div>
          </section>
        </>
      ) : isError ? (
        <section className="rounded-[2rem] border border-error/30 bg-error/8 p-5 shadow-sm lg:p-6">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-error">
            Allowance Unavailable
          </p>
          <h1 className="mt-3 text-2xl font-semibold text-text-primary">
            Không tải được danh sách trợ cấp {roleLabel.toLowerCase()}.
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-text-secondary">
            {getErrorMessage(
              error,
              "Dữ liệu trợ cấp cho nhóm này hiện chưa lấy được.",
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
              <SummaryCard label="Tổng khoản trợ cấp" value={String(totalAllowances)} />
              <SummaryCard
                label="Khoản đã thanh toán"
                value={String(paidCount)}
                tone="success"
              />
              <SummaryCard
                label="Khoản chờ thanh toán"
                value={String(pendingCount)}
                tone="warning"
              />
            </div>

            <div className="mt-5 flex flex-col gap-3 border-b border-border-default pb-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-base font-semibold text-text-primary text-balance sm:text-lg">
                    Chi tiết trợ cấp
                  </h1>
                  <span
                    className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ${getExtraAllowanceRoleChipClass(
                      roleType,
                    )}`}
                  >
                    {roleLabel}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-muted">{visibilityNote}</p>
                {normalizedStaffId && isStaffDetailError ? (
                  <p className="mt-2 text-xs text-error">
                    Không khóa được hồ sơ nhân sự để tạo trợ cấp mới.
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canCreateAllowance ? (
                  <button
                    type="button"
                    onClick={openCreatePopup}
                    disabled={
                      (normalizedStaffId
                        ? isStaffDetailLoading || !lockedStaffContext
                        : false) ||
                      createMutation.isPending
                    }
                    className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-primary/25 bg-primary/10 px-4 py-2.5 text-sm font-semibold text-primary transition-colors hover:bg-primary/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <svg
                      className="size-4 shrink-0"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M12 4v16m8-8H4"
                      />
                    </svg>
                    {createButtonLabel}
                  </button>
                ) : null}
                <span className="inline-flex rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                  {totalAvailable}
                </span>
              </div>
            </div>

            {selectedCount > 0 ? (
              <section
                className={`relative mt-5 overflow-hidden rounded-[1.35rem] border border-border-default p-3 shadow-sm ${theme.listGradientClassName}`}
              >
                <div
                  className={`pointer-events-none absolute -right-10 top-0 size-28 rounded-full blur-3xl ${theme.listGlowTopClassName}`}
                  aria-hidden="true"
                />
                <div
                  className={`pointer-events-none absolute bottom-0 left-8 size-24 rounded-full blur-3xl ${theme.listGlowBottomClassName}`}
                  aria-hidden="true"
                />

                <div className="relative flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                      Thanh toán hàng loạt
                    </p>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-text-secondary">
                      <span
                        className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${theme.selectionBadgeClassName}`}
                      >
                        Đã chọn {selectedCount} khoản
                      </span>
                      <span className="text-text-muted">
                        Chọn nhiều khoản trợ cấp để đổi trạng thái trong một lần.
                      </span>
                    </div>
                  </div>

                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-end lg:w-auto">
                    <button
                      type="button"
                      onClick={toggleAllAllowances}
                      disabled={visibleAllowanceIds.length === 0 || bulkStatusMutation.isPending}
                      className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {allAllowancesSelected
                        ? `Bỏ chọn ${selectedCount} khoản`
                        : `Chọn cả ${visibleAllowanceIds.length} khoản`}
                    </button>
                    <button
                      type="button"
                      onClick={clearSelection}
                      disabled={bulkStatusMutation.isPending}
                      className="touch-manipulation inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3.5 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Bỏ chọn toàn bộ
                    </button>
                    <button
                      type="button"
                      onClick={openBulkEditPopup}
                      disabled={bulkStatusMutation.isPending}
                      className="touch-manipulation inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-[0_14px_30px_-18px_color-mix(in_srgb,var(--ue-primary)_55%,transparent)] transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                      aria-label={`Sửa trạng thái thanh toán cho ${selectedCount} khoản trợ cấp đã chọn`}
                    >
                      <svg
                        className="size-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z"
                        />
                      </svg>
                      <span>Sửa trạng thái thanh toán</span>
                      <span className="rounded-full bg-text-inverse/18 px-2 py-0.5 text-xs font-semibold tabular-nums">
                        {selectedCount}
                      </span>
                    </button>
                  </div>
                </div>
              </section>
            ) : null}

            {allowances.length === 0 ? (
              <div className="mt-5 rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/35 p-6 text-center text-sm text-text-muted">
                {normalizedStaffId
                  ? `Nhân sự này chưa có khoản trợ cấp nào ở vai trò ${roleLabel.toLowerCase()}.`
                  : `Chưa có khoản trợ cấp nào ở vai trò ${roleLabel.toLowerCase()}.`}
              </div>
            ) : (
              <>
                <div className="mt-5 space-y-3 lg:hidden">
                  {allowances.map((allowance) => {
                    const isSelected = selectedAllowanceIds.has(allowance.id);

                    return (
                      <article
                        key={allowance.id}
                        className={`rounded-[1.35rem] border p-3 shadow-sm transition-colors ${isSelected
                          ? theme.activeCardClassName
                          : "border-border-default bg-bg-surface"
                          }`}
                      >
                        <div className="flex items-start gap-3">
                          <SelectionCheckbox
                            checked={isSelected}
                            onChange={() => toggleAllowanceSelection(allowance.id)}
                            disabled={bulkStatusMutation.isPending}
                            ariaLabel={`Chọn trợ cấp của ${resolveStaffName(allowance)}`}
                          />

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-semibold leading-snug text-text-primary">
                                  {resolveStaffName(allowance)}
                                </p>
                                <p className="mt-1 text-xs text-text-muted">
                                  {formatMonthLabel(allowance.month)}
                                </p>
                              </div>
                              <div className="flex shrink-0 items-center gap-2">
                                <StatusPill status={allowance.status} />
                                {renderDeleteAllowanceButton(allowance)}
                              </div>
                            </div>

                            <p className="mt-3 text-2xl font-semibold tabular-nums text-text-primary">
                              {formatCurrency(allowance.amount)}
                            </p>
                            <p className="mt-3 break-words text-sm leading-6 text-text-secondary">
                              {resolveNote(allowance.note)}
                            </p>
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
                        <col style={{ width: "26%" }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "28%" }} />
                        <col style={{ width: "16%" }} />
                        <col style={{ width: "14%" }} />
                        {canDeleteAllowance ? <col style={{ width: "72px" }} /> : null}
                      </colgroup>
                      <thead className="bg-bg-secondary">
                        <tr className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                          <th className="px-2.5 py-2.5 text-center" scope="col">
                            <SelectionCheckbox
                              checked={allAllowancesSelected}
                              indeterminate={hasPartialSelection}
                              onChange={toggleAllAllowances}
                              disabled={
                                visibleAllowanceIds.length === 0 ||
                                bulkStatusMutation.isPending
                              }
                              ariaLabel="Chọn tất cả khoản trợ cấp đang hiển thị"
                            />
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Nhân sự
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Tháng
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Ghi chú
                          </th>
                          <th className="px-2.5 py-2.5" scope="col">
                            Trạng thái
                          </th>
                          <th className="px-2.5 py-2.5 text-right" scope="col">
                            Số tiền
                          </th>
                          {canDeleteAllowance ? (
                            <th className="px-2.5 py-2.5" scope="col">
                              <span className="sr-only">Xóa</span>
                            </th>
                          ) : null}
                        </tr>
                      </thead>
                      <tbody>
                        {allowances.map((allowance) => {
                          const isSelected = selectedAllowanceIds.has(allowance.id);

                          return (
                            <tr
                              key={allowance.id}
                              className={`border-t transition-colors ${isSelected
                                ? theme.activeRowClassName
                                : "border-border-default bg-bg-surface hover:bg-bg-secondary/40"
                                }`}
                            >
                              <td className="px-2.5 py-2.5 text-center align-top">
                                <SelectionCheckbox
                                  checked={isSelected}
                                  onChange={() => toggleAllowanceSelection(allowance.id)}
                                  disabled={bulkStatusMutation.isPending}
                                  ariaLabel={`Chọn trợ cấp của ${resolveStaffName(allowance)}`}
                                />
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <p className="text-sm font-semibold text-text-primary">
                                  {resolveStaffName(allowance)}
                                </p>
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-sm text-text-secondary">
                                {formatMonthLabel(allowance.month)}
                              </td>
                              <td className="px-2.5 py-2.5 align-top text-sm text-text-secondary">
                                <p className="line-clamp-2 break-words">
                                  {resolveNote(allowance.note)}
                                </p>
                              </td>
                              <td className="px-2.5 py-2.5 align-top">
                                <StatusPill status={allowance.status} />
                              </td>
                              <td className="px-2.5 py-2.5 text-right align-top text-sm font-semibold tabular-nums text-text-primary">
                                {formatCurrency(allowance.amount)}
                              </td>
                              {canDeleteAllowance ? (
                                <td className="px-2.5 py-2.5 text-right align-top">
                                  {renderDeleteAllowanceButton(allowance)}
                                </td>
                              ) : null}
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

      {bulkEditPopupOpen && selectedCount > 0 ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden="true"
            onClick={closeBulkEditPopup}
          />
          <div className="fixed inset-0 z-[70] p-3 sm:p-4">
            <div className="mx-auto flex h-full w-full max-w-md items-center">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="bulk-extra-allowance-status-title"
                className="relative w-full overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface p-5 shadow-2xl"
              >
                <div
                  className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-success/0 via-success/50 to-primary/0"
                  aria-hidden="true"
                />
                <div
                  className={`absolute -right-8 -top-10 h-24 w-24 rounded-full blur-3xl ${theme.popupGlowClassName}`}
                  aria-hidden="true"
                />

                <div className="relative">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Chỉnh sửa hàng loạt
                      </p>
                      <h2
                        id="bulk-extra-allowance-status-title"
                        className="mt-1 text-lg font-semibold text-text-primary text-balance"
                      >
                        Cập nhật trạng thái thanh toán
                      </h2>
                      <p className="mt-2 text-sm text-text-secondary">
                        Áp dụng cho{" "}
                        <span className="font-semibold text-primary">
                          {selectedCount}
                        </span>{" "}
                        khoản trợ cấp đã chọn.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={closeBulkEditPopup}
                      className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      aria-label="Đóng popup sửa trạng thái thanh toán trợ cấp"
                    >
                      <svg
                        className="size-5"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                        aria-hidden="true"
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
                        name="bulk-extra-allowance-status"
                        value={bulkStatusDraft}
                        onValueChange={(value) =>
                          setBulkStatusDraft(value as ExtraAllowanceStatus)
                        }
                        options={EXTRA_ALLOWANCE_STATUS_OPTIONS}
                        buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      />
                    </label>

                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={closeBulkEditPopup}
                        disabled={bulkStatusMutation.isPending}
                        className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        onClick={confirmBulkStatusUpdate}
                        disabled={bulkStatusMutation.isPending}
                        className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
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

      {canDeleteAllowance && allowanceToDelete ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden="true"
            onClick={closeDeleteConfirm}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-extra-allowance-title"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start gap-3">
              <div className="mt-1 flex size-9 items-center justify-center rounded-full bg-error/10 text-error">
                <svg
                  className="size-5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  aria-hidden="true"
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
                  id="delete-extra-allowance-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Xóa khoản trợ cấp?
                </h2>
                <p className="mt-1 text-sm text-text-secondary">
                  Bạn có chắc muốn xóa trợ cấp của{" "}
                  <span className="font-semibold text-text-primary">
                    {resolveStaffName(allowanceToDelete)}
                  </span>{" "}
                  trong tháng {formatMonthLabel(allowanceToDelete.month)}? Hành
                  động này không thể hoàn tác.
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
              <button
                type="button"
                onClick={closeDeleteConfirm}
                disabled={deleteMutation.isPending}
                className="min-h-10 flex-1 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50 sm:flex-none sm:px-5"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleDeleteConfirmed}
                disabled={deleteMutation.isPending}
                className="min-h-10 flex-1 rounded-md border border-error bg-error px-4 py-2.5 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-error/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none sm:px-5"
              >
                {deleteMutation.isPending ? "Đang xóa…" : "Xóa khoản trợ cấp"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {canCreateAllowance && createPopupOpen && createPopupInitialData ? (
        <ExtraAllowanceFormPopup
          key={`extra-allowance-create-${lockedStaffContext?.staff.id ?? "role"}-${roleType}-${createPopupOpen ? "open" : "closed"}`}
          open={createPopupOpen}
          mode="create"
          onClose={closeCreatePopup}
          initialData={createPopupInitialData}
          lockedContext={lockedStaffContext}
          lockedRoleType={roleType}
          onSubmit={handleCreateExtraAllowance}
          isSubmitting={createMutation.isPending}
        />
      ) : null}
    </div>
  );
}
