"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import AssistantCommissionTabPanel from "@/components/admin/extra-allowance/AssistantCommissionTabPanel";
import ExtraAllowanceFormPopup, {
  type ExtraAllowanceFormSubmitPayload,
} from "@/components/admin/extra-allowance/ExtraAllowanceFormPopup";
import ExtraAllowanceListTableSkeleton from "@/components/admin/extra-allowance/ExtraAllowanceListTableSkeleton";
import {
  getExtraAllowanceRoleChipClass,
  getExtraAllowanceRoleLabel,
  getExtraAllowanceStatusChipClass,
  getExtraAllowanceStatusLabel,
} from "@/components/admin/extra-allowance/extraAllowancePresentation";
import type {
  ExtraAllowanceBaseFields,
  ExtraAllowanceListItem,
  ExtraAllowanceListResponse,
  ExtraAllowanceRoleType,
  ExtraAllowanceStatus,
  SelfManagedExtraAllowanceRoleType,
} from "@/dtos/extra-allowance.dto";
import type { StaffOption } from "@/dtos/staff.dto";
import { resolveCanonicalUserName } from "@/dtos/user-name.dto";
import {
  createMyStaffExtraAllowance,
  getMyStaffExtraAllowances,
  getMyStaffDetail,
  updateMyStaffExtraAllowance,
} from "@/lib/apis/auth.api";
import { formatMonthKeyLabel } from "@/lib/month-format";

const MAX_VISIBLE_ALLOWANCES = 20;

type SupportedRoleType = Extract<
  ExtraAllowanceRoleType,
  | "assistant"
  | "communication"
  | "technical"
  | "training"
  | "accountant"
  | "accountant_income"
  | "accountant_expense"
>;

type RoleTheme = {
  listGradientClassName: string;
  listGlowTopClassName: string;
  listGlowBottomClassName: string;
};

const ROLE_THEMES: Record<SupportedRoleType, RoleTheme> = {
  assistant: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-warning/12",
    listGlowBottomClassName: "bg-primary/10",
  },
  communication: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-error/12",
    listGlowBottomClassName: "bg-primary/10",
  },
  technical: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-info/12",
    listGlowBottomClassName: "bg-primary/10",
  },
  training: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-primary/12",
    listGlowBottomClassName: "bg-success/10",
  },
  accountant: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-success/12",
    listGlowBottomClassName: "bg-info/10",
  },
  accountant_income: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-success/12",
    listGlowBottomClassName: "bg-primary/10",
  },
  accountant_expense: {
    listGradientClassName: "bg-bg-surface",
    listGlowTopClassName: "bg-warning/12",
    listGlowBottomClassName: "bg-success/10",
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

function resolveStaffName(item: ExtraAllowanceListItem) {
  return item.staff?.fullName?.trim() || "Nhân sự chưa xác định";
}

function resolveNote(note: string | null | undefined) {
  return note?.trim() || "Chưa có ghi chú.";
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

function StatusPill({
  status,
}: {
  status: ExtraAllowanceStatus | null | undefined;
}) {
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

export default function StaffSelfExtraAllowanceRoleDetailPage({
  roleType,
  allowCreate = false,
}: {
  roleType: SupportedRoleType;
  /** Cho các role self-service được backend cho phép tự thêm trợ cấp pending. */
  allowCreate?: boolean;
}) {
  const { back } = useRouter();
  const theme = ROLE_THEMES[roleType];
  const roleLabel = getExtraAllowanceRoleLabel(roleType);
  const canSelfCreateAllowance = Boolean(allowCreate);
  const canSelfEditAllowance =
    roleType === "communication" ||
    roleType === "technical" ||
    roleType === "training";
  const selfManagedRoleType: SelfManagedExtraAllowanceRoleType | null =
    roleType === "communication" ||
    roleType === "technical" ||
    roleType === "training"
      ? roleType
      : null;
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [createFormKey, setCreateFormKey] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [editFormKey, setEditFormKey] = useState(0);
  const [editingAllowance, setEditingAllowance] =
    useState<ExtraAllowanceListItem | null>(null);
  const [assistantDetailTab, setAssistantDetailTab] = useState<
    "allowance" | "commission"
  >("allowance");
  const showAssistantCommissionTab = roleType === "assistant";

  const { data: meStaff, isLoading: isMeStaffLoading } = useQuery({
    queryKey: ["users", "me", "staff-detail"],
    queryFn: getMyStaffDetail,
    enabled: canSelfEditAllowance || showAssistantCommissionTab,
    staleTime: 60_000,
  });

  const lockedStaffOption: StaffOption | null = meStaff
    ? {
      id: meStaff.id,
      fullName:
        resolveCanonicalUserName(meStaff.user, meStaff.fullName) || "Nhân sự",
      status: meStaff.status,
      roles: Array.isArray(meStaff.roles) ? meStaff.roles : [],
    }
    : null;
  const lockedRoleContext = lockedStaffOption
    ? {
        staff: lockedStaffOption,
        roleType,
      }
    : null;
  const editPopupInitialData: ExtraAllowanceBaseFields | null =
    editingAllowance && lockedStaffOption
      ? {
        staffId: lockedStaffOption.id,
        month: editingAllowance.month ?? "",
        amount: editingAllowance.amount ?? 0,
        status: editingAllowance.status ?? "pending",
        note: editingAllowance.note ?? "",
        roleType,
        staff: {
          id: lockedStaffOption.id,
          fullName: lockedStaffOption.fullName,
          status: lockedStaffOption.status,
          roles: lockedStaffOption.roles,
        },
      }
      : null;

  const refreshSelfAllowanceData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["extra-allowance", "self", "role-detail"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["staff", "self", "income-summary"],
      }),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: async (payload: ExtraAllowanceFormSubmitPayload) => {
      if (!selfManagedRoleType) {
        throw new Error("Role này không hỗ trợ tự tạo trợ cấp.");
      }

      await createMyStaffExtraAllowance({
        roleType: selfManagedRoleType,
        month: payload.month,
        amount: payload.amount,
        note: payload.note,
      });
    },
    onSuccess: async () => {
      toast.success("Đã tạo khoản trợ cấp. Trạng thái: chờ thanh toán.");
      setCreateOpen(false);
      await refreshSelfAllowanceData();
    },
    onError: (err) => {
      toast.error(
        getErrorMessage(err, "Không tạo được trợ cấp. Vui lòng thử lại."),
      );
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (payload: {
      id: string;
      form: ExtraAllowanceFormSubmitPayload;
    }) => {
      if (!selfManagedRoleType) {
        throw new Error("Role này không hỗ trợ tự chỉnh trợ cấp.");
      }

      await updateMyStaffExtraAllowance({
        id: payload.id,
        roleType: selfManagedRoleType,
        month: payload.form.month,
        amount: payload.form.amount,
        note: payload.form.note,
      });
    },
    onSuccess: async () => {
      toast.success("Đã cập nhật khoản trợ cấp.");
      setEditOpen(false);
      setEditingAllowance(null);
      await refreshSelfAllowanceData();
    },
    onError: (err) => {
      toast.error(
        getErrorMessage(err, "Không cập nhật được trợ cấp. Vui lòng thử lại."),
      );
    },
  });

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<ExtraAllowanceListResponse>({
    queryKey: [
      "extra-allowance",
      "self",
      "role-detail",
      roleType,
      MAX_VISIBLE_ALLOWANCES,
    ],
    queryFn: () =>
      getMyStaffExtraAllowances({
        page: 1,
        limit: MAX_VISIBLE_ALLOWANCES,
        roleType,
      }),
    staleTime: 60_000,
  });

  const allowances = data?.data ?? [];
  const totalAllowances = allowances.length;
  const paidCount = allowances.filter((allowance) => allowance.status === "paid").length;
  const pendingCount = allowances.filter(
    (allowance) => allowance.status === "pending",
  ).length;
  const totalAvailable = data?.meta.total ?? totalAllowances;
  const canManageOwnAllowances = Boolean(
    canSelfEditAllowance && lockedRoleContext,
  );
  const visibilityNote =
    totalAvailable > totalAllowances
      ? `Đang hiển thị ${totalAllowances}/${totalAvailable} khoản mới nhất của chính bạn.`
      : `Lịch sử trợ cấp ${roleLabel.toLowerCase()} của chính bạn.`;

  const scopeChipLabel = canSelfCreateAllowance
    ? "Được thêm và chỉnh sửa"
    : canSelfEditAllowance
      ? "Được chỉnh sửa, không được xóa"
      : "Không cho phép thêm hoặc đổi trạng thái";
  const scopeDescription = canSelfCreateAllowance
    ? "Bạn có thể khai báo hoặc điều chỉnh khoản trợ cấp của chính mình. Trạng thái thanh toán vẫn do kế toán xác nhận riêng, và thao tác xóa tiếp tục bị khóa."
    : canSelfEditAllowance
      ? "Bạn có thể chỉnh sửa ghi nhận trợ cấp của chính mình, nhưng không được xóa hoặc đổi trạng thái thanh toán."
      : "Trang này chỉ hiển thị lịch sử trợ cấp theo đúng role của chính bạn.";

  const openEditAllowance = (allowance: ExtraAllowanceListItem) => {
    if (
      !canManageOwnAllowances ||
      updateMutation.isPending ||
      createMutation.isPending
    ) {
      return;
    }

    setEditFormKey((current) => current + 1);
    setEditingAllowance(allowance);
    setEditOpen(true);
  };

  const closeEditPopup = () => {
    if (updateMutation.isPending) {
      return;
    }

    setEditOpen(false);
    setEditingAllowance(null);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 p-4 sm:p-6">
      <button
        type="button"
        onClick={() => back()}
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
        Quay lại
      </button>

      {showAssistantCommissionTab ? (
        <div className="inline-flex w-full rounded-xl border border-border-default bg-bg-surface p-1 sm:w-auto">
          <button
            type="button"
            onClick={() => setAssistantDetailTab("allowance")}
            className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              assistantDetailTab === "allowance"
                ? "bg-primary text-text-inverse"
                : "text-text-secondary hover:bg-bg-secondary"
            }`}
          >
            Trợ cấp
          </button>
          <button
            type="button"
            onClick={() => setAssistantDetailTab("commission")}
            className={`min-h-11 flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
              assistantDetailTab === "commission"
                ? "bg-primary text-text-inverse"
                : "text-text-secondary hover:bg-bg-secondary"
            }`}
          >
            Hoa hồng
          </button>
        </div>
      ) : null}

      {showAssistantCommissionTab && assistantDetailTab === "commission" ? (
        <section className="rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          <AssistantCommissionTabPanel assistantStaffId={meStaff?.id ?? ""} />
        </section>
      ) : null}

      {assistantDetailTab === "allowance" && isLoading ? (
        <>
          <section className="rounded-[2rem] border border-border-default bg-bg-surface p-5 shadow-sm lg:p-6">
            <div className="grid gap-3 md:grid-cols-3">
              {Array.from({ length: 3 }).map((_, index) => (
                <div
                  key={`self-extra-allowance-summary-skeleton-${index}`}
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
                variant="selfDetail"
                showToolbar
              />
            </div>
          </section>
        </>
      ) : assistantDetailTab === "allowance" && isError ? (
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
              "Dữ liệu trợ cấp cho role này hiện chưa lấy được.",
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
      ) : assistantDetailTab === "allowance" ? (
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
                  <span className="inline-flex rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary">
                    Chỉ xem dữ liệu của bạn
                  </span>
                  {canManageOwnAllowances ? (
                    <span className="inline-flex rounded-full border border-error/20 bg-error/8 px-2.5 py-1 text-xs font-semibold text-error">
                      Chạm vào khoản để chỉnh sửa
                    </span>
                  ) : null}
                </div>
                <p className="mt-1 text-sm text-text-muted">{visibilityNote}</p>
              </div>
              <div className="flex flex-col items-stretch gap-2 sm:items-end">
                {canSelfCreateAllowance ? (
                  <button
                    type="button"
                    onClick={() => {
                      setCreateFormKey((k) => k + 1);
                      setCreateOpen(true);
                    }}
                    disabled={
                      isMeStaffLoading ||
                      !lockedStaffOption ||
                      createMutation.isPending
                    }
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-medium text-text-inverse shadow-sm transition-colors hover:bg-primary-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50 sm:w-auto"
                  >
                    Thêm trợ cấp
                  </button>
                ) : null}
                <span className="inline-flex rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-xs font-semibold text-text-secondary sm:self-end">
                  {totalAvailable}
                </span>
              </div>
            </div>

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

              <div className="relative flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] border border-border-default/70 bg-bg-surface/80 px-4 py-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Self-Service Scope
                  </p>
                  <p className="mt-1 text-sm text-text-secondary">
                    {scopeDescription}
                  </p>
                </div>
                <span className="inline-flex rounded-full border border-primary/15 bg-primary/8 px-2.5 py-1 text-xs font-semibold text-primary">
                  {scopeChipLabel}
                </span>
              </div>

              {allowances.length === 0 ? (
                <div className="mt-5 rounded-[1.5rem] border border-dashed border-border-default bg-bg-secondary/35 p-6 text-center text-sm text-text-muted">
                  Chưa có khoản trợ cấp nào ở vai trò {roleLabel.toLowerCase()}.
                </div>
              ) : (
                <>
                  <div className="mt-5 space-y-3 lg:hidden">
                    {allowances.map((allowance) => {
                      const isInteractive = canManageOwnAllowances;

                      return (
                        <article
                          key={allowance.id}
                          role={isInteractive ? "button" : undefined}
                          tabIndex={isInteractive ? 0 : undefined}
                          onClick={
                            isInteractive
                              ? () => openEditAllowance(allowance)
                              : undefined
                          }
                          onKeyDown={
                            isInteractive
                              ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  openEditAllowance(allowance);
                                }
                              }
                              : undefined
                          }
                          className={`rounded-[1.35rem] border border-border-default bg-bg-surface p-3 shadow-sm transition-colors ${isInteractive
                            ? "cursor-pointer hover:bg-bg-secondary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            : ""
                            }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold leading-snug text-text-primary">
                                {resolveStaffName(allowance)}
                              </p>
                              <p className="mt-1 text-xs text-text-muted">
                                {formatMonthKeyLabel(allowance.month)}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              {isInteractive ? (
                                <span className="inline-flex rounded-full border border-border-default bg-bg-secondary px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                  Chỉnh sửa
                                </span>
                              ) : null}
                              <StatusPill status={allowance.status} />
                            </div>
                          </div>

                          <p className="mt-3 text-2xl font-semibold tabular-nums text-text-primary">
                            {formatCurrency(allowance.amount)}
                          </p>
                          <p className="mt-3 break-words text-sm leading-6 text-text-secondary">
                            {resolveNote(allowance.note)}
                          </p>
                        </article>
                      );
                    })}
                  </div>

                  <div className="mt-5 hidden overflow-hidden rounded-xl border border-border-default lg:block">
                    <div className="overflow-x-auto">
                      <table className="w-full table-fixed border-collapse text-left">
                        <colgroup>
                          <col style={{ width: "28%" }} />
                          <col style={{ width: "16%" }} />
                          <col style={{ width: "30%" }} />
                          <col style={{ width: "14%" }} />
                          <col style={{ width: "12%" }} />
                        </colgroup>
                        <thead className="bg-bg-secondary">
                          <tr className="text-[11px] font-semibold uppercase tracking-wide text-text-muted">
                            <th className="px-3 py-2.5" scope="col">
                              Nhân sự
                            </th>
                            <th className="px-3 py-2.5" scope="col">
                              Tháng
                            </th>
                            <th className="px-3 py-2.5" scope="col">
                              Ghi chú
                            </th>
                            <th className="px-3 py-2.5" scope="col">
                              Trạng thái
                            </th>
                            <th className="px-3 py-2.5 text-right" scope="col">
                              Số tiền
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {allowances.map((allowance) => {
                            const isInteractive = canManageOwnAllowances;

                            return (
                              <tr
                                key={allowance.id}
                                role={isInteractive ? "button" : undefined}
                                tabIndex={isInteractive ? 0 : undefined}
                                onClick={
                                  isInteractive
                                    ? () => openEditAllowance(allowance)
                                    : undefined
                                }
                                onKeyDown={
                                  isInteractive
                                    ? (event) => {
                                      if (event.key === "Enter" || event.key === " ") {
                                        event.preventDefault();
                                        openEditAllowance(allowance);
                                      }
                                    }
                                    : undefined
                                }
                                className={`border-t border-border-default bg-bg-surface transition-colors ${isInteractive
                                  ? "cursor-pointer hover:bg-bg-secondary/40"
                                  : "hover:bg-bg-secondary/40"
                                  }`}
                              >
                                <td className="px-3 py-2.5 align-top">
                                  <p className="text-sm font-semibold text-text-primary">
                                    {resolveStaffName(allowance)}
                                  </p>
                                </td>
                                <td className="px-3 py-2.5 align-top text-sm text-text-secondary">
                                  {formatMonthKeyLabel(allowance.month)}
                                </td>
                                <td className="px-3 py-2.5 align-top text-sm text-text-secondary">
                                  <p className="line-clamp-2 break-words">
                                    {resolveNote(allowance.note)}
                                  </p>
                                </td>
                                <td className="px-3 py-2.5 align-top">
                                  <StatusPill status={allowance.status} />
                                </td>
                                <td className="px-3 py-2.5 text-right align-top text-sm font-semibold tabular-nums text-text-primary">
                                  {formatCurrency(allowance.amount)}
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
          </section>

          {canSelfCreateAllowance && lockedStaffOption ? (
            <ExtraAllowanceFormPopup
              key={createFormKey}
              open={createOpen}
              mode="create"
              onClose={() => setCreateOpen(false)}
              lockedContext={lockedRoleContext}
              lockStatusToPending
              isSubmitting={createMutation.isPending}
              onSubmit={async (payload) => {
                await createMutation.mutateAsync(payload);
              }}
            />
          ) : null}

          {editOpen &&
            editingAllowance &&
            lockedRoleContext &&
            editPopupInitialData ? (
            <ExtraAllowanceFormPopup
              key={`self-extra-allowance-edit-${editingAllowance.id}-${editFormKey}`}
              open={editOpen}
              mode="edit"
              onClose={closeEditPopup}
              initialData={editPopupInitialData}
              lockedContext={lockedRoleContext}
              lockedStatus={editingAllowance.status ?? "pending"}
              isSubmitting={updateMutation.isPending}
              onSubmit={async (payload) => {
                await updateMutation.mutateAsync({
                  id: editingAllowance.id,
                  form: payload,
                });
              }}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
