"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import { MonthInput } from "@/components/ui/MonthInput";
import SelectionCheckbox from "@/components/ui/SelectionCheckbox";
import { Skeleton } from "@/components/ui/skeleton";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import type {
  TrainingManagerManagedClassItem,
  TrainingManagerPaymentStatus,
  TrainingManagerSessionAllowanceItem,
} from "@/dtos/training-manager.dto";
import { getFullProfile } from "@/lib/apis/auth.api";
import {
  bulkUpdateTrainingManagerPaymentStatus,
  getTrainingManagerManagedClasses,
  getTrainingManagerSessionAllowances,
} from "@/lib/apis/training-manager.api";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { formatCurrency } from "@/lib/class.helpers";
import { formatMonthKeyLabel, getDefaultMonthKey } from "@/lib/month-format";
import { cn } from "@/lib/utils";

type Props = {
  staffId: string;
  workspaceMode?: "self" | "admin";
  classLinkBase?: "staff" | "admin";
};

const ROW_GRID_CLASS =
  "grid-cols-[minmax(0,1fr)_minmax(7rem,8.5rem)_minmax(7rem,8.5rem)_1.25rem]";

const SESSION_GRID_CLASS =
  "grid-cols-[7.5rem_minmax(0,1fr)_5.5rem_6.5rem_8.5rem_8.5rem]";

const SESSION_GRID_WITH_SELECTION_CLASS =
  "grid-cols-[2.75rem_7.5rem_minmax(0,1fr)_5.5rem_6.5rem_8.5rem_8.5rem]";

const PAYMENT_STATUS_LABELS: Record<TrainingManagerPaymentStatus, string> = {
  pending: "Chưa thanh toán",
  paid: "Đã thanh toán",
};

const BULK_PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Chưa thanh toán" },
  { value: "paid", label: "Đã thanh toán" },
] as const;

function formatSessionDate(iso?: string | null): string {
  if (!iso) return "—";
  try {
    return new Intl.DateTimeFormat("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return "—";
  }
}

function paymentStatusChipClass(status: TrainingManagerPaymentStatus): string {
  return status === "paid"
    ? "border-success/25 bg-success/10 text-success"
    : "border-warning/25 bg-warning/10 text-warning";
}

function SessionAllowanceSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: 3 }).map((_, index) => (
        <Skeleton
          key={`session-allowance-skeleton-${index}`}
          className="h-10 w-full rounded-lg bg-bg-tertiary"
        />
      ))}
    </div>
  );
}

function SessionAllowanceRows({
  sessions,
  canEdit,
  selectedSessionIds,
  onToggleSession,
  isLoading,
  monthLabel,
}: {
  sessions: TrainingManagerSessionAllowanceItem[];
  canEdit: boolean;
  selectedSessionIds: Set<string>;
  onToggleSession: (sessionId: string) => void;
  isLoading: boolean;
  monthLabel: string;
}) {
  if (isLoading) {
    return <SessionAllowanceSkeleton />;
  }

  if (sessions.length === 0) {
    return (
      <p className="text-sm text-text-muted">
        {`Không có buổi học phát sinh trợ cấp QLL trong ${monthLabel}.`}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-3 lg:hidden">
        {sessions.map((session) => {
          const isSelected = selectedSessionIds.has(session.sessionId);
          return (
            <article
              key={`mobile-${session.sessionId}`}
              className={cn(
                "rounded-xl border border-border-default/80 bg-bg-surface px-3 py-3 text-sm",
                canEdit && isSelected && "border-primary/30 bg-primary/5",
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold text-text-primary">
                    {formatSessionDate(session.date)}
                  </p>
                  <p className="mt-1 text-text-secondary">
                    Học phí buổi:{" "}
                    <span className="tabular-nums font-medium">
                      {formatCurrency(session.sessionTuitionTotal)}
                    </span>
                  </p>
                </div>
                {canEdit ? (
                  <SelectionCheckbox
                    checked={isSelected}
                    onChange={() => onToggleSession(session.sessionId)}
                    ariaLabel={`Chọn buổi ${formatSessionDate(session.date)}`}
                  />
                ) : null}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <p className="text-text-muted">% QLL</p>
                  <p className="tabular-nums font-medium text-text-primary">
                    {session.trainingManagerRatePercent.toFixed(2)}%
                  </p>
                </div>
                <div>
                  <p className="text-text-muted">Trợ cấp</p>
                  <p className="tabular-nums font-semibold text-primary">
                    {formatCurrency(session.allowanceAmount)}
                  </p>
                </div>
              </div>
              <p className="mt-2">
                <span
                  className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${paymentStatusChipClass(session.paymentStatus)}`}
                >
                  {PAYMENT_STATUS_LABELS[session.paymentStatus]}
                </span>
              </p>
            </article>
          );
        })}
      </div>

      <div className="hidden overflow-x-auto lg:block">
        <div
          className={cn(
            "grid gap-2 border-b border-border-default px-2 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted",
            canEdit
              ? SESSION_GRID_WITH_SELECTION_CLASS
              : SESSION_GRID_CLASS,
          )}
        >
          {canEdit ? <span className="sr-only">Chọn</span> : null}
          <span>Ngày</span>
          <span>Học phí buổi</span>
          <span className="text-right">% QLL</span>
          <span className="text-right">Trợ cấp</span>
          <span>Trạng thái</span>
        </div>
        <ul className="divide-y divide-border-subtle">
          {sessions.map((session) => {
            const isSelected = selectedSessionIds.has(session.sessionId);
            return (
              <li
                key={`desktop-${session.sessionId}`}
                className={cn(
                  "grid items-center gap-2 px-2 py-2.5 text-sm transition-colors",
                  canEdit && isSelected
                    ? "bg-primary/5"
                    : "hover:bg-bg-secondary/40",
                  canEdit
                    ? SESSION_GRID_WITH_SELECTION_CLASS
                    : SESSION_GRID_CLASS,
                )}
              >
                {canEdit ? (
                  <span className="flex justify-center">
                    <SelectionCheckbox
                      checked={isSelected}
                      onChange={() => onToggleSession(session.sessionId)}
                      ariaLabel={`Chọn buổi ${formatSessionDate(session.date)}`}
                    />
                  </span>
                ) : null}
                <span className="font-medium text-text-primary">
                  {formatSessionDate(session.date)}
                </span>
                <span className="tabular-nums text-text-secondary">
                  {formatCurrency(session.sessionTuitionTotal)}
                </span>
                <span className="text-right tabular-nums text-text-muted">
                  {session.trainingManagerRatePercent.toFixed(2)}%
                </span>
                <span className="text-right tabular-nums font-semibold text-primary">
                  {formatCurrency(session.allowanceAmount)}
                </span>
                <span>
                  <span
                    className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${paymentStatusChipClass(session.paymentStatus)}`}
                  >
                    {PAYMENT_STATUS_LABELS[session.paymentStatus]}
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function ManagedClassRow({
  item,
  href,
  isExpanded,
  onToggleExpand,
  monthLabel,
  canEditPaymentStatus,
  selectedSessionIds,
  onToggleSession,
  sessions,
  sessionsLoading,
}: {
  item: TrainingManagerManagedClassItem;
  href: string;
  isExpanded: boolean;
  onToggleExpand: () => void;
  monthLabel: string;
  canEditPaymentStatus: boolean;
  selectedSessionIds: Set<string>;
  onToggleSession: (sessionId: string) => void;
  sessions: TrainingManagerSessionAllowanceItem[];
  sessionsLoading: boolean;
}) {
  return (
    <div className="overflow-hidden border-b border-border-default/70 last:border-b-0">
      <div
        className={cn(
          "grid items-center gap-2 px-3 py-3 text-sm sm:gap-3 sm:px-4",
          ROW_GRID_CLASS,
        )}
      >
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onToggleExpand}
            aria-expanded={isExpanded}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-bg-secondary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
            aria-label={
              isExpanded
                ? `Thu gọn buổi học lớp ${item.className}`
                : `Mở buổi học lớp ${item.className}`
            }
          >
            <svg
              className={cn(
                "size-4 transition-transform",
                isExpanded && "rotate-180",
              )}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>
          <Link
            href={href}
            className="min-w-0 truncate font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
          >
            {item.className}
          </Link>
        </div>
        <p className="text-right font-semibold tabular-nums text-text-primary">
          {formatCurrency(item.monthTotal)}
        </p>
        <p className="text-right font-semibold tabular-nums text-warning">
          {formatCurrency(item.pendingTotal)}
        </p>
        <span className="hidden sm:block" aria-hidden />
      </div>
      {isExpanded ? (
        <div className="border-t border-border-subtle bg-bg-secondary/50 px-3 py-3 sm:px-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
            {`Buổi học trong ${monthLabel}`}
          </p>
          <SessionAllowanceRows
            sessions={sessions}
            canEdit={canEditPaymentStatus}
            selectedSessionIds={selectedSessionIds}
            onToggleSession={onToggleSession}
            isLoading={sessionsLoading}
            monthLabel={monthLabel}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function TrainingManagerClassesTabPanel({
  staffId,
  workspaceMode = "self",
  classLinkBase,
}: Props) {
  const queryClient = useQueryClient();
  const [monthKey, setMonthKey] = useState(getDefaultMonthKey);
  const [expandedClassIds, setExpandedClassIds] = useState<Set<string>>(
    new Set(),
  );
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkPaymentPopupOpen, setBulkPaymentPopupOpen] = useState(false);
  const [bulkPaymentStatusDraft, setBulkPaymentStatusDraft] =
    useState<TrainingManagerPaymentStatus>("paid");

  const routeBase = useMemo(
    () => classLinkBase ?? (workspaceMode === "admin" ? "admin" : "staff"),
    [classLinkBase, workspaceMode],
  );
  const adminLikeBase = resolveAdminLikeRouteBase();
  const monthLabel = formatMonthKeyLabel(monthKey);

  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const staffRoles = fullProfile?.staffInfo?.roles ?? [];
  const canEditPaymentStatus =
    fullProfile?.roleType === "admin" ||
    staffRoles.includes("assistant") ||
    staffRoles.includes("accountant_income") ||
    staffRoles.includes("accountant_expense") ||
    staffRoles.includes("accountant") ||
    staffRoles.includes("admin");

  const { data, isLoading, isFetching, isError } = useQuery({
    queryKey: ["training-manager", "managed-classes", staffId, monthKey],
    queryFn: () => getTrainingManagerManagedClasses(staffId, monthKey),
    enabled: Boolean(staffId),
    staleTime: 30_000,
  });

  const rows = data?.data ?? [];
  const summary = data?.summary;

  const expandedClassIdList = useMemo(
    () => Array.from(expandedClassIds).sort(),
    [expandedClassIds],
  );

  const sessionAllowanceQueries = useQueries({
    queries: expandedClassIdList.map((classId) => ({
      queryKey: [
        "training-manager",
        "session-allowances",
        staffId,
        classId,
        monthKey,
      ],
      queryFn: () =>
        getTrainingManagerSessionAllowances(staffId, classId, monthKey),
      enabled: Boolean(staffId) && Boolean(monthKey?.trim()),
      staleTime: 30_000,
    })),
  });

  const sessionsByClassId = useMemo(() => {
    const map = new Map<string, TrainingManagerSessionAllowanceItem[]>();
    expandedClassIdList.forEach((classId, index) => {
      map.set(classId, sessionAllowanceQueries[index]?.data ?? []);
    });
    return map;
  }, [expandedClassIdList, sessionAllowanceQueries]);

  const sessionsLoadingByClassId = useMemo(() => {
    const map = new Map<string, boolean>();
    expandedClassIdList.forEach((classId, index) => {
      map.set(classId, sessionAllowanceQueries[index]?.isLoading ?? false);
    });
    return map;
  }, [expandedClassIdList, sessionAllowanceQueries]);

  const expandedSessionIds = useMemo(() => {
    const ids: string[] = [];
    expandedClassIdList.forEach((classId) => {
      for (const session of sessionsByClassId.get(classId) ?? []) {
        ids.push(session.sessionId);
      }
    });
    return ids;
  }, [expandedClassIdList, sessionsByClassId]);

  const selectedCount = selectedSessionIds.size;
  const allExpandedSessionsSelected =
    expandedSessionIds.length > 0 &&
    expandedSessionIds.every((id) => selectedSessionIds.has(id));

  useEffect(() => {
    setExpandedClassIds(new Set());
    setSelectedSessionIds(new Set());
  }, [monthKey]);

  const bulkPaymentMutation = useMutation({
    mutationFn: (payload: {
      sessionIds: string[];
      paymentStatus: TrainingManagerPaymentStatus;
    }) => bulkUpdateTrainingManagerPaymentStatus(staffId, payload),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({
        queryKey: ["training-manager", "managed-classes", staffId],
      });
      void queryClient.invalidateQueries({
        queryKey: ["training-manager", "session-allowances", staffId],
      });
      setSelectedSessionIds(new Set());
      setBulkPaymentPopupOpen(false);
      toast.success(
        result.updatedCount > 0
          ? `Đã cập nhật ${result.updatedCount} buổi học.`
          : "Các buổi đã chọn đang ở trạng thái này.",
      );
    },
    onError: () => {
      toast.error(
        "Không thể cập nhật trạng thái thanh toán. Vui lòng thử lại.",
      );
    },
  });

  const toggleExpandClass = (classId: string) => {
    setExpandedClassIds((prev) => {
      const next = new Set(prev);
      if (next.has(classId)) {
        next.delete(classId);
      } else {
        next.add(classId);
      }
      return next;
    });
  };

  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(sessionId)) {
        next.delete(sessionId);
      } else {
        next.add(sessionId);
      }
      return next;
    });
  };

  const toggleAllExpandedSessions = () => {
    setSelectedSessionIds((prev) => {
      if (allExpandedSessionsSelected) {
        const next = new Set(prev);
        for (const id of expandedSessionIds) {
          next.delete(id);
        }
        return next;
      }
      const next = new Set(prev);
      for (const id of expandedSessionIds) {
        next.add(id);
      }
      return next;
    });
  };

  const confirmBulkPaymentStatusUpdate = () => {
    if (selectedCount === 0 || bulkPaymentMutation.isPending) return;
    bulkPaymentMutation.mutate({
      sessionIds: Array.from(selectedSessionIds),
      paymentStatus: bulkPaymentStatusDraft,
    });
  };

  return (
    <section className="overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface shadow-sm">
      <div className="border-b border-border-default px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold text-text-primary sm:text-lg">
              Lớp học (Số lượng: {summary?.classCount ?? 0})
            </h2>
            <p className="mt-1 text-xs text-text-muted sm:text-sm">
              Tổng nhận tháng {monthLabel}:{" "}
              <span className="font-semibold tabular-nums text-text-primary">
                {formatCurrency(summary?.totalMonth ?? 0)}
              </span>
              {" · "}
              Chưa thanh toán (all-time):{" "}
              <span className="font-semibold tabular-nums text-warning">
                {formatCurrency(summary?.totalPending ?? 0)}
              </span>
            </p>
          </div>
          <MonthInput
            value={monthKey}
            onChange={(event) => setMonthKey(event.target.value)}
          />
        </div>
      </div>

      {canEditPaymentStatus && expandedSessionIds.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border-default px-4 py-3 sm:px-5">
          <button
            type="button"
            onClick={toggleAllExpandedSessions}
            disabled={bulkPaymentMutation.isPending}
            className="inline-flex min-h-10 items-center rounded-lg px-2 text-sm font-medium text-text-muted transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:opacity-50"
          >
            {allExpandedSessionsSelected
              ? "Bỏ chọn tất cả buổi đang mở"
              : `Chọn tất cả ${expandedSessionIds.length} buổi đang mở`}
          </button>
          <button
            type="button"
            onClick={() => {
              setBulkPaymentStatusDraft("paid");
              setBulkPaymentPopupOpen(true);
            }}
            disabled={selectedCount === 0 || bulkPaymentMutation.isPending}
            className="ml-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
          >
            Chuyển trạng thái thanh toán
            {selectedCount > 0 ? ` (${selectedCount})` : ""}
          </button>
        </div>
      ) : null}

      <div
        className={cn(
          "hidden border-b border-border-default bg-bg-secondary/70 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted sm:grid sm:px-5",
          ROW_GRID_CLASS,
        )}
      >
        <span>Tên lớp</span>
        <span className="text-right">Tổng tháng</span>
        <span className="text-right">Chưa TT</span>
        <span className="sr-only">Mở rộng</span>
      </div>

      <div
        className={cn(
          "transition-opacity",
          isFetching && !isLoading && "opacity-70",
        )}
      >
        {isLoading ? (
          <div className="space-y-3 px-4 py-4 sm:px-5">
            {Array.from({ length: 4 }).map((_, index) => (
              <Skeleton key={index} className="h-12 w-full rounded-xl" />
            ))}
          </div>
        ) : isError ? (
          <p className="px-4 py-8 text-center text-sm text-error sm:px-5">
            Không tải được danh sách lớp quản lý.
          </p>
        ) : rows.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-text-muted sm:px-5">
            Chưa có lớp nào được gán quản lý trong tháng này.
          </p>
        ) : (
          <div>
            {rows.map((item) => {
              const href =
                routeBase === "admin"
                  ? buildAdminLikePath(
                      adminLikeBase,
                      `/classes/${encodeURIComponent(item.classId)}`,
                    )
                  : `/staff/classes/${encodeURIComponent(item.classId)}`;

              return (
                <ManagedClassRow
                  key={item.classId}
                  item={item}
                  href={href}
                  isExpanded={expandedClassIds.has(item.classId)}
                  onToggleExpand={() => toggleExpandClass(item.classId)}
                  monthLabel={monthLabel}
                  canEditPaymentStatus={canEditPaymentStatus}
                  selectedSessionIds={selectedSessionIds}
                  onToggleSession={toggleSessionSelection}
                  sessions={sessionsByClassId.get(item.classId) ?? []}
                  sessionsLoading={
                    sessionsLoadingByClassId.get(item.classId) ?? false
                  }
                />
              );
            })}
          </div>
        )}
      </div>

      {bulkPaymentPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={() => {
              if (!bulkPaymentMutation.isPending) setBulkPaymentPopupOpen(false);
            }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="training-manager-bulk-payment-title"
            className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  id="training-manager-bulk-payment-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Cập nhật trạng thái thanh toán
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Áp dụng cho {selectedCount} buổi học đã chọn.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (!bulkPaymentMutation.isPending) {
                    setBulkPaymentPopupOpen(false);
                  }
                }}
                className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                aria-label="Đóng popup cập nhật trạng thái thanh toán"
              >
                <XMarkIcon className="size-5" aria-hidden />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-sm font-medium text-text-secondary">
                  Trạng thái muốn đổi
                </span>
                <UpgradedSelect
                  name="bulk-training-manager-payment-status"
                  value={bulkPaymentStatusDraft}
                  onValueChange={(value) =>
                    setBulkPaymentStatusDraft(
                      value as TrainingManagerPaymentStatus,
                    )
                  }
                  options={BULK_PAYMENT_STATUS_OPTIONS.map((option) => ({
                    value: option.value,
                    label: option.label,
                  }))}
                  buttonClassName="min-h-11 rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setBulkPaymentPopupOpen(false)}
                  disabled={bulkPaymentMutation.isPending}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={confirmBulkPaymentStatusUpdate}
                  disabled={bulkPaymentMutation.isPending}
                  className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkPaymentMutation.isPending
                    ? "Đang cập nhật…"
                    : "Xác nhận"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
