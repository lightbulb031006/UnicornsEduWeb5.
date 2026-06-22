"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { toast } from "sonner";
import SelectionCheckbox from "@/components/ui/SelectionCheckbox";
import UpgradedSelect from "@/components/ui/UpgradedSelect";
import { MonthInput } from "@/components/ui/MonthInput";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  AssistantCommissionPaymentStatus,
  AssistantCommissionScope,
  AssistantManagedCustomerCareItem,
  AssistantManagedStudentItem,
  AssistantSessionShareItem,
} from "@/dtos/assistant-commission.dto";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as assistantCommissionApi from "@/lib/apis/assistant-commission.api";
import { formatCurrency } from "@/lib/class.helpers";
import { formatMonthKeyLabel, getDefaultMonthKey } from "@/lib/month-format";
import { cn } from "@/lib/utils";

const DEFAULT_BULK_PAYMENT_STATUS: AssistantCommissionPaymentStatus = "paid";
const BULK_PAYMENT_STATUS_OPTIONS = [
  { value: "pending", label: "Chưa thanh toán" },
  { value: "paid", label: "Đã thanh toán" },
] as const;

const PAYMENT_STATUS_LABELS: Record<AssistantCommissionPaymentStatus, string> = {
  pending: "Chưa thanh toán",
  paid: "Đã thanh toán",
};

const CUSTOMER_CARE_ROW_GRID_CLASS =
  "grid-cols-[minmax(0,1fr)_minmax(6rem,7rem)_minmax(6rem,7rem)_minmax(4.5rem,5.5rem)_minmax(6.5rem,8rem)_1.25rem]";
const STUDENT_ROW_GRID_CLASS =
  "grid-cols-[minmax(0,1fr)_minmax(7rem,8.5rem)_1.25rem]";
const SESSION_SHARE_GRID_CLASS =
  "grid-cols-[7.5rem_minmax(14rem,1.85fr)_8.5rem_6.5rem_10rem_8.5rem]";
const SESSION_SHARE_GRID_WITH_SELECTION_CLASS =
  "grid-cols-[2.75rem_7.5rem_minmax(14rem,1.85fr)_8.5rem_6.5rem_10rem_8.5rem]";

type FilterMode = "pending" | "month";

function formatDate(iso?: string | null) {
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

function paymentStatusChipClass(status: AssistantCommissionPaymentStatus) {
  return status === "paid"
    ? "border-success/25 bg-success/10 text-success"
    : "border-warning/25 bg-warning/10 text-warning";
}

function buildStudentKey(customerCareStaffId: string, studentId: string) {
  return `${customerCareStaffId}:${studentId}`;
}

function SessionShareSkeleton() {
  return (
    <div className="overflow-x-auto" aria-hidden>
      <div className="min-w-[720px] space-y-2">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={`assistant-session-share-skeleton-${index}`}
            className={`grid items-center gap-3 rounded-xl bg-bg-surface px-3 py-2 ${SESSION_SHARE_GRID_CLASS}`}
          >
            <Skeleton className="h-4 w-20 rounded bg-bg-tertiary" />
            <Skeleton className="h-4 w-full rounded bg-bg-tertiary" />
            <Skeleton className="h-4 w-24 rounded bg-bg-tertiary" />
            <Skeleton className="h-5 w-16 rounded-full bg-bg-tertiary" />
            <Skeleton className="h-4 w-24 rounded bg-bg-tertiary" />
            <Skeleton className="h-5 w-20 rounded-full bg-bg-tertiary" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AssistantCommissionTabPanel({
  assistantStaffId,
}: {
  assistantStaffId: string;
}) {
  const queryClient = useQueryClient();
  const [filterMode, setFilterMode] = useState<FilterMode>("pending");
  const [monthKey, setMonthKey] = useState(getDefaultMonthKey);
  const [expandedCustomerCareIds, setExpandedCustomerCareIds] = useState<
    Set<string>
  >(new Set());
  const [expandedStudentKeys, setExpandedStudentKeys] = useState<Set<string>>(
    new Set(),
  );
  const [selectedAttendanceIds, setSelectedAttendanceIds] = useState<Set<string>>(
    new Set(),
  );
  const [bulkPaymentPopupOpen, setBulkPaymentPopupOpen] = useState(false);
  const [bulkPaymentStatusDraft, setBulkPaymentStatusDraft] =
    useState<AssistantCommissionPaymentStatus>(DEFAULT_BULK_PAYMENT_STATUS);

  const scope: AssistantCommissionScope =
    filterMode === "month" ? "month" : "pending";
  const queryMonth = filterMode === "month" ? monthKey : undefined;
  const canQuery = filterMode === "pending" || Boolean(monthKey?.trim());

  useEffect(() => {
    setExpandedCustomerCareIds(new Set());
    setExpandedStudentKeys(new Set());
    setSelectedAttendanceIds(new Set());
  }, [filterMode, monthKey]);

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

  const {
    data: managedCustomerCare,
    isLoading: managedLoading,
    isError: managedError,
  } = useQuery({
    queryKey: [
      "assistant-commission",
      "managed-customer-care",
      assistantStaffId,
      scope,
      queryMonth,
    ],
    queryFn: () =>
      assistantCommissionApi.getAssistantManagedCustomerCare(
        assistantStaffId,
        {
          scope,
          month: queryMonth,
          page: 1,
          limit: 100,
        },
      ),
    enabled: Boolean(assistantStaffId) && canQuery,
    staleTime: 30_000,
  });

  const managedRows = managedCustomerCare?.data ?? [];
  const expandedCustomerCareIdList = useMemo(
    () => Array.from(expandedCustomerCareIds).sort(),
    [expandedCustomerCareIds],
  );

  const studentQueries = useQueries({
    queries: expandedCustomerCareIdList.map((customerCareStaffId) => ({
      queryKey: [
        "assistant-commission",
        "managed-students",
        assistantStaffId,
        customerCareStaffId,
        scope,
        queryMonth,
      ],
      queryFn: () =>
        assistantCommissionApi.getAssistantManagedStudents(
          assistantStaffId,
          customerCareStaffId,
          {
            scope,
            month: queryMonth,
            page: 1,
            limit: 100,
          },
        ),
      enabled: Boolean(assistantStaffId) && canQuery,
      staleTime: 30_000,
    })),
  });

  const studentsByCustomerCareId = useMemo(() => {
    const map = new Map<string, AssistantManagedStudentItem[]>();
    expandedCustomerCareIdList.forEach((customerCareStaffId, index) => {
      map.set(customerCareStaffId, studentQueries[index]?.data?.data ?? []);
    });
    return map;
  }, [expandedCustomerCareIdList, studentQueries]);

  const studentsLoadingByCustomerCareId = useMemo(() => {
    const map = new Map<string, boolean>();
    expandedCustomerCareIdList.forEach((customerCareStaffId, index) => {
      map.set(customerCareStaffId, studentQueries[index]?.isLoading ?? false);
    });
    return map;
  }, [expandedCustomerCareIdList, studentQueries]);

  const expandedStudentKeyList = useMemo(
    () => Array.from(expandedStudentKeys).sort(),
    [expandedStudentKeys],
  );

  const sessionShareQueries = useQueries({
    queries: expandedStudentKeyList.map((studentKey) => {
      const [customerCareStaffId, studentId] = studentKey.split(":");
      return {
        queryKey: [
          "assistant-commission",
          "session-shares",
          assistantStaffId,
          customerCareStaffId,
          studentId,
          scope,
          queryMonth,
        ],
        queryFn: () =>
          assistantCommissionApi.getAssistantSessionShares(
            assistantStaffId,
            customerCareStaffId,
            studentId,
            {
              scope,
              month: queryMonth,
            },
          ),
        enabled: Boolean(assistantStaffId) && canQuery,
        staleTime: 30_000,
      };
    }),
  });

  const sessionSharesByStudentKey = useMemo(() => {
    const map = new Map<string, AssistantSessionShareItem[]>();
    expandedStudentKeyList.forEach((studentKey, index) => {
      map.set(studentKey, sessionShareQueries[index]?.data ?? []);
    });
    return map;
  }, [expandedStudentKeyList, sessionShareQueries]);

  const sessionSharesLoadingByStudentKey = useMemo(() => {
    const map = new Map<string, boolean>();
    expandedStudentKeyList.forEach((studentKey, index) => {
      map.set(studentKey, sessionShareQueries[index]?.isLoading ?? false);
    });
    return map;
  }, [expandedStudentKeyList, sessionShareQueries]);

  const expandedAttendanceIds = useMemo(() => {
    const ids: string[] = [];
    sessionShareQueries.forEach((query) => {
      (query.data ?? []).forEach((session) => {
        if (session.attendanceId) {
          ids.push(session.attendanceId);
        }
      });
    });
    return ids;
  }, [sessionShareQueries]);

  const selectedCount = selectedAttendanceIds.size;
  const visibleSelectedAttendanceIds = useMemo(
    () =>
      new Set(
        expandedAttendanceIds.filter((attendanceId) =>
          selectedAttendanceIds.has(attendanceId),
        ),
      ),
    [expandedAttendanceIds, selectedAttendanceIds],
  );
  const allExpandedSessionsSelected =
    expandedAttendanceIds.length > 0 &&
    visibleSelectedAttendanceIds.size === expandedAttendanceIds.length;

  const bulkPaymentStatusMutation = useMutation({
    mutationFn: (payload: {
      attendanceIds: string[];
      paymentStatus: AssistantCommissionPaymentStatus;
    }) =>
      assistantCommissionApi.bulkUpdateAssistantSharePaymentStatus(
        assistantStaffId,
        payload,
      ),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["assistant-commission"] }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", assistantStaffId],
        }),
        queryClient.invalidateQueries({ queryKey: ["extra-allowance"] }),
      ]);
      setSelectedAttendanceIds(new Set());
      setBulkPaymentPopupOpen(false);
      toast.success(
        result.updatedCount > 0
          ? `Đã cập nhật ${result.updatedCount} khoản hoa hồng.`
          : "Các khoản đã chọn đang ở trạng thái này.",
      );
    },
    onError: () => {
      toast.error("Không thể cập nhật trạng thái thanh toán. Vui lòng thử lại.");
    },
  });

  const toggleCustomerCareExpand = (customerCareStaffId: string) => {
    setExpandedCustomerCareIds((current) => {
      const next = new Set(current);
      if (next.has(customerCareStaffId)) {
        next.delete(customerCareStaffId);
      } else {
        next.add(customerCareStaffId);
      }
      return next;
    });
  };

  const toggleStudentExpand = (
    customerCareStaffId: string,
    studentId: string,
  ) => {
    const studentKey = buildStudentKey(customerCareStaffId, studentId);
    setExpandedStudentKeys((current) => {
      const next = new Set(current);
      if (next.has(studentKey)) {
        next.delete(studentKey);
      } else {
        next.add(studentKey);
      }
      return next;
    });
  };

  const getStudentAttendanceIds = (
    customerCareStaffId: string,
    studentId: string,
  ) =>
    (sessionSharesByStudentKey.get(
      buildStudentKey(customerCareStaffId, studentId),
    ) ?? [])
      .map((session) => session.attendanceId)
      .filter((attendanceId): attendanceId is string => Boolean(attendanceId));

  const toggleAttendanceSelection = (attendanceId: string) => {
    setSelectedAttendanceIds((current) => {
      const next = new Set(current);
      if (next.has(attendanceId)) {
        next.delete(attendanceId);
      } else {
        next.add(attendanceId);
      }
      return next;
    });
  };

  const toggleAllStudentSessions = (
    customerCareStaffId: string,
    studentId: string,
  ) => {
    const attendanceIds = getStudentAttendanceIds(customerCareStaffId, studentId);
    const allSelected =
      attendanceIds.length > 0 &&
      attendanceIds.every((attendanceId) =>
        selectedAttendanceIds.has(attendanceId),
      );
    setSelectedAttendanceIds((current) => {
      const next = new Set(current);
      if (allSelected) {
        attendanceIds.forEach((attendanceId) => next.delete(attendanceId));
      } else {
        attendanceIds.forEach((attendanceId) => next.add(attendanceId));
      }
      return next;
    });
  };

  const toggleAllExpandedSessions = () => {
    setSelectedAttendanceIds((current) => {
      const next = new Set(current);
      if (allExpandedSessionsSelected) {
        expandedAttendanceIds.forEach((attendanceId) => next.delete(attendanceId));
      } else {
        expandedAttendanceIds.forEach((attendanceId) => next.add(attendanceId));
      }
      return next;
    });
  };

  const openBulkPaymentPopup = () => {
    setBulkPaymentStatusDraft(DEFAULT_BULK_PAYMENT_STATUS);
    setBulkPaymentPopupOpen(true);
  };

  const closeBulkPaymentPopup = () => {
    if (bulkPaymentStatusMutation.isPending) return;
    setBulkPaymentPopupOpen(false);
  };

  const confirmBulkPaymentStatusUpdate = () => {
    if (selectedCount === 0 || bulkPaymentStatusMutation.isPending) return;
    bulkPaymentStatusMutation.mutate({
      attendanceIds: Array.from(selectedAttendanceIds),
      paymentStatus: bulkPaymentStatusDraft,
    });
  };

  const monthLabel = formatMonthKeyLabel(monthKey);
  const emptyMessage =
    filterMode === "pending"
      ? "Không có khoản hoa hồng chưa thanh toán."
      : `Không có hoa hồng trong ${monthLabel}.`;

  const renderSessionRows = (
    customerCareStaffId: string,
    studentId: string,
    studentName: string,
    sessions: AssistantSessionShareItem[],
    sessionsLoading: boolean,
  ) => {
    if (sessionsLoading) {
      return <SessionShareSkeleton />;
    }

    if (sessions.length === 0) {
      return (
        <p className="text-sm text-text-muted">
          {filterMode === "pending"
            ? "Không có buổi học chưa thanh toán."
            : `Không có buổi học trong ${monthLabel}.`}
        </p>
      );
    }

    return (
      <div className="space-y-3">
        <div className="space-y-3 lg:hidden">
          {sessions.map((session) => {
            const isSelected = selectedAttendanceIds.has(session.attendanceId);
            return (
              <article
                key={`mobile-${session.attendanceId}`}
                className={cn(
                  "rounded-[1.15rem] border bg-bg-surface px-4 py-3 shadow-sm",
                  canEditPaymentStatus && isSelected
                    ? "border-primary/35 bg-primary/5"
                    : "border-border-default",
                )}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  {canEditPaymentStatus ? (
                    <div className="flex items-start gap-3">
                      <SelectionCheckbox
                        checked={isSelected}
                        onChange={() =>
                          toggleAttendanceSelection(session.attendanceId)
                        }
                        disabled={bulkPaymentStatusMutation.isPending}
                        ariaLabel={`Chọn buổi học ${formatDate(session.date)} của ${studentName}`}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                          Buổi học
                        </p>
                        <p className="mt-1 text-sm font-semibold text-text-primary">
                          {formatDate(session.date)}
                        </p>
                        <p className="mt-1 break-words text-sm text-text-secondary">
                          {session.className ?? "Chưa gắn lớp"}
                        </p>
                      </div>
                    </div>
                  ) : (
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                        Buổi học
                      </p>
                      <p className="mt-1 text-sm font-semibold text-text-primary">
                        {formatDate(session.date)}
                      </p>
                      <p className="mt-1 break-words text-sm text-text-secondary">
                        {session.className ?? "Chưa gắn lớp"}
                      </p>
                    </div>
                  )}
                  <span
                    className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${paymentStatusChipClass(
                      session.paymentStatus,
                    )}`}
                  >
                    {PAYMENT_STATUS_LABELS[session.paymentStatus]}
                  </span>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Học phí
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-text-secondary">
                      {formatCurrency(session.tuitionFee)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Tỷ lệ chia
                    </p>
                    <p className="mt-1 text-sm tabular-nums text-text-secondary">
                      {session.shareRatePercent}%
                    </p>
                  </div>
                  <div className="sm:col-span-2">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted">
                      Hoa hồng
                    </p>
                    <p className="mt-1 text-base font-semibold tabular-nums text-primary">
                      {formatCurrency(session.shareAmount)}
                    </p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        <div className="hidden overflow-x-auto rounded-[1.1rem] border border-border-default bg-bg-surface lg:block">
          <div className="min-w-[46rem]">
            <div
              className={`grid gap-3 border-b border-border-default bg-bg-secondary/75 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-text-muted ${canEditPaymentStatus ? SESSION_SHARE_GRID_WITH_SELECTION_CLASS : SESSION_SHARE_GRID_CLASS}`}
            >
              {canEditPaymentStatus ? (
                <span className="flex justify-center">
                  <SelectionCheckbox
                    checked={
                      sessions.length > 0 &&
                      sessions.every((session) =>
                        selectedAttendanceIds.has(session.attendanceId),
                      )
                    }
                    indeterminate={
                      sessions.some((session) =>
                        selectedAttendanceIds.has(session.attendanceId),
                      ) &&
                      !sessions.every((session) =>
                        selectedAttendanceIds.has(session.attendanceId),
                      )
                    }
                    onChange={() =>
                      toggleAllStudentSessions(customerCareStaffId, studentId)
                    }
                    disabled={
                      sessions.length === 0 ||
                      bulkPaymentStatusMutation.isPending
                    }
                    ariaLabel={`Chọn tất cả buổi học của ${studentName}`}
                  />
                </span>
              ) : null}
              <span>Ngày</span>
              <span>Lớp</span>
              <span className="text-right">Học phí</span>
              <span className="text-right">Tỷ lệ</span>
              <span>Thanh toán</span>
              <span className="text-right">Hoa hồng</span>
            </div>
            <ul className="divide-y divide-border-subtle">
              {sessions.map((session) => {
                const isSelected = selectedAttendanceIds.has(session.attendanceId);
                return (
                  <li
                    key={`desktop-${session.attendanceId}`}
                    className={cn(
                      "grid items-center gap-3 px-3 py-3 text-sm transition-colors",
                      canEditPaymentStatus && isSelected
                        ? "bg-primary/5 hover:bg-primary/10"
                        : "hover:bg-bg-secondary/45",
                      canEditPaymentStatus
                        ? SESSION_SHARE_GRID_WITH_SELECTION_CLASS
                        : SESSION_SHARE_GRID_CLASS,
                    )}
                  >
                    {canEditPaymentStatus ? (
                      <span className="flex justify-center">
                        <SelectionCheckbox
                          checked={isSelected}
                          onChange={() =>
                            toggleAttendanceSelection(session.attendanceId)
                          }
                          disabled={bulkPaymentStatusMutation.isPending}
                          ariaLabel={`Chọn buổi học ${formatDate(session.date)}`}
                        />
                      </span>
                    ) : null}
                    <span className="font-semibold text-text-primary">
                      {formatDate(session.date)}
                    </span>
                    <span className="truncate text-text-secondary">
                      {session.className ?? "Chưa gắn lớp"}
                    </span>
                    <span className="text-right tabular-nums text-text-secondary">
                      {formatCurrency(session.tuitionFee)}
                    </span>
                    <span className="text-right tabular-nums text-text-muted">
                      {session.shareRatePercent}%
                    </span>
                    <span
                      className={`inline-flex w-fit items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] ${paymentStatusChipClass(
                        session.paymentStatus,
                      )}`}
                    >
                      {PAYMENT_STATUS_LABELS[session.paymentStatus]}
                    </span>
                    <span className="text-right tabular-nums font-semibold text-primary">
                      {formatCurrency(session.shareAmount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      </div>
    );
  };

  const renderStudentRows = (
    customerCareStaffId: string,
    students: AssistantManagedStudentItem[],
    studentsLoading: boolean,
  ) => {
    if (studentsLoading) {
      return (
        <div className="space-y-2" aria-hidden>
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton
              key={`assistant-student-skeleton-${index}`}
              className="h-14 rounded-[1.25rem] bg-bg-tertiary"
            />
          ))}
        </div>
      );
    }

    if (students.length === 0) {
      return (
        <p className="text-sm text-text-muted">
          {filterMode === "pending"
            ? "Không có học sinh có hoa hồng chưa thanh toán."
            : `Không có học sinh có hoa hồng trong ${monthLabel}.`}
        </p>
      );
    }

    return (
      <div className="space-y-2">
        {students.map((student) => {
          const studentKey = buildStudentKey(
            customerCareStaffId,
            student.studentId,
          );
          const isExpanded = expandedStudentKeys.has(studentKey);
          const sessions = sessionSharesByStudentKey.get(studentKey) ?? [];
          const sessionsLoading =
            sessionSharesLoadingByStudentKey.get(studentKey) ?? false;

          return (
            <div
              key={studentKey}
              className="overflow-hidden rounded-[1.25rem] border border-border-default bg-bg-surface"
            >
              <button
                type="button"
                onClick={() =>
                  toggleStudentExpand(customerCareStaffId, student.studentId)
                }
                aria-expanded={isExpanded}
                className={`grid w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset ${STUDENT_ROW_GRID_CLASS}`}
              >
                <span
                  className="min-w-0 truncate font-medium text-text-primary"
                  title={student.fullName}
                >
                  {student.fullName}
                </span>
                <span className="text-right tabular-nums font-semibold text-primary">
                  {formatCurrency(
                    filterMode === "pending"
                      ? student.pendingShareAmount
                      : student.totalShareAmount,
                  )}
                </span>
                <svg
                  className={`size-4 justify-self-end text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
              {isExpanded ? (
                <div className="border-t border-border-subtle bg-bg-secondary px-4 py-3">
                  {renderSessionRows(
                    customerCareStaffId,
                    student.studentId,
                    student.fullName,
                    sessions,
                    sessionsLoading,
                  )}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    );
  };

  if (!assistantStaffId) {
    return (
      <div className="rounded-[1.5rem] border border-border-default bg-bg-surface px-4 py-6 text-sm text-text-muted shadow-sm">
        Không tìm thấy hồ sơ trợ lí để hiển thị hoa hồng.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-base font-medium text-text-primary">Hoa hồng</h2>
          <p className="mt-1 text-sm text-text-muted">
            Phần chia 3% học phí từ CSKH do trợ lí quản lý.
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:items-end">
          <div className="inline-flex w-full rounded-xl border border-border-default bg-bg-surface p-1 sm:w-auto">
            <button
              type="button"
              onClick={() => setFilterMode("pending")}
              className={cn(
                "min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none",
                filterMode === "pending"
                  ? "bg-primary text-text-inverse"
                  : "text-text-secondary hover:bg-bg-secondary",
              )}
            >
              Chưa thanh toán
            </button>
            <button
              type="button"
              onClick={() => setFilterMode("month")}
              className={cn(
                "min-h-10 flex-1 rounded-lg px-3 py-2 text-sm font-medium transition-colors sm:flex-none",
                filterMode === "month"
                  ? "bg-primary text-text-inverse"
                  : "text-text-secondary hover:bg-bg-secondary",
              )}
            >
              Theo tháng
            </button>
          </div>
          {filterMode === "month" ? (
            <MonthInput
              value={monthKey}
              onChange={(event) => setMonthKey(event.target.value)}
              className="w-full sm:min-w-[18rem]"
              aria-label="Chọn tháng đối soát hoa hồng"
            />
          ) : null}
        </div>
      </div>

      {canEditPaymentStatus && selectedCount > 0 ? (
        <div className="rounded-xl border border-border-default bg-bg-secondary/55 px-3 py-2">
          <div className="flex flex-wrap items-center gap-3">
            <div className="inline-flex min-h-10 items-center rounded-lg bg-bg-surface px-3 text-sm font-medium text-text-secondary">
              Đã chọn: {selectedCount} khoản
            </div>
            {expandedAttendanceIds.length > 0 ? (
              <button
                type="button"
                onClick={toggleAllExpandedSessions}
                disabled={bulkPaymentStatusMutation.isPending}
                className="touch-manipulation inline-flex min-h-10 items-center justify-center rounded-lg px-1 text-sm font-medium text-text-muted transition-colors hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
              >
                {allExpandedSessionsSelected
                  ? "Bỏ chọn tất cả buổi đang mở"
                  : `Chọn tất cả ${expandedAttendanceIds.length} buổi đang mở`}
              </button>
            ) : null}
            <button
              type="button"
              onClick={openBulkPaymentPopup}
              disabled={selectedCount === 0 || bulkPaymentStatusMutation.isPending}
              className="touch-manipulation ml-auto inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
            >
              Chuyển trạng thái thanh toán
            </button>
          </div>
        </div>
      ) : null}

      {managedError ? (
        <p className="text-sm text-error" role="alert">
          Không tải được danh sách hoa hồng.
        </p>
      ) : null}

      {managedLoading ? (
        <div className="space-y-2" aria-busy="true">
          {Array.from({ length: 4 }).map((_, index) => (
            <Skeleton
              key={`assistant-managed-skeleton-${index}`}
              className="h-16 rounded-[1.5rem] bg-bg-tertiary"
            />
          ))}
        </div>
      ) : null}

      {!managedLoading && !managedError && managedRows.length === 0 ? (
        <div className="rounded-[1.5rem] border border-border-default bg-bg-surface p-6 text-center text-sm text-text-muted shadow-sm">
          {emptyMessage}
        </div>
      ) : null}

      {!managedLoading && !managedError && managedRows.length > 0 ? (
        <div className="space-y-2 overflow-x-auto">
          <div
            className={`hidden min-w-[42rem] items-center gap-3 rounded-[1.25rem] border border-border-default/80 bg-bg-secondary/80 px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted lg:grid ${CUSTOMER_CARE_ROW_GRID_CLASS}`}
            aria-hidden
          >
            <span>Nhân sự CSKH</span>
            <span className="text-right">Chưa thanh toán</span>
            <span className="text-right">Tổng hoa hồng</span>
            <span className="text-right">Số người nợ</span>
            <span className="text-right">Tổng tiền nợ</span>
            <span className="sr-only">Mở rộng</span>
          </div>

          {managedRows.map((item: AssistantManagedCustomerCareItem) => {
            const isExpanded = expandedCustomerCareIds.has(
              item.customerCareStaffId,
            );
            const students =
              studentsByCustomerCareId.get(item.customerCareStaffId) ?? [];
            const studentsLoading =
              studentsLoadingByCustomerCareId.get(item.customerCareStaffId) ??
              false;

            return (
              <div
                key={item.customerCareStaffId}
                className="overflow-hidden rounded-[1.5rem] border border-border-default bg-bg-surface shadow-sm"
              >
                <button
                  type="button"
                  onClick={() => toggleCustomerCareExpand(item.customerCareStaffId)}
                  aria-expanded={isExpanded}
                  className={`grid w-full min-w-[42rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-inset ${CUSTOMER_CARE_ROW_GRID_CLASS}`}
                >
                  <span
                    className="min-w-0 truncate font-medium text-text-primary"
                    title={item.fullName}
                  >
                    {item.fullName}
                  </span>
                  <span className="text-right tabular-nums font-semibold text-warning">
                    {formatCurrency(item.pendingShareAmount)}
                  </span>
                  <span className="text-right tabular-nums font-semibold text-primary">
                    {formatCurrency(
                      filterMode === "pending"
                        ? item.pendingShareAmount
                        : item.totalShareAmount,
                    )}
                  </span>
                  <span className="text-right tabular-nums font-medium text-text-secondary">
                    {item.debtStudentCount}
                  </span>
                  <span className="text-right tabular-nums font-semibold text-warning">
                    {formatCurrency(item.totalDebtAmount)}
                  </span>
                  <svg
                    className={`size-4 justify-self-end text-text-muted transition-transform ${isExpanded ? "rotate-180" : ""}`}
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
                {isExpanded ? (
                  <div className="border-t border-border-subtle bg-bg-secondary px-4 py-3">
                    <p className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                      {filterMode === "pending"
                        ? "Học sinh có hoa hồng chưa thanh toán"
                        : `Học sinh trong ${monthLabel}`}
                    </p>
                    {renderStudentRows(
                      item.customerCareStaffId,
                      students,
                      studentsLoading,
                    )}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}

      {bulkPaymentPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-[60] bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closeBulkPaymentPopup}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="assistant-commission-bulk-payment-title"
            className="fixed left-1/2 top-1/2 z-[70] w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p
                  id="assistant-commission-bulk-payment-title"
                  className="text-base font-semibold text-text-primary"
                >
                  Cập nhật trạng thái thanh toán
                </p>
                <p className="mt-1 text-sm text-text-secondary">
                  Áp dụng cho {selectedCount} khoản hoa hồng đã chọn.
                </p>
              </div>
              <button
                type="button"
                onClick={closeBulkPaymentPopup}
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
                  name="bulk-assistant-commission-payment-status"
                  value={bulkPaymentStatusDraft}
                  onValueChange={(value) =>
                    setBulkPaymentStatusDraft(
                      value as AssistantCommissionPaymentStatus,
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
                  onClick={closeBulkPaymentPopup}
                  disabled={bulkPaymentStatusMutation.isPending}
                  className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  onClick={confirmBulkPaymentStatusUpdate}
                  disabled={bulkPaymentStatusMutation.isPending}
                  className="min-h-11 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {bulkPaymentStatusMutation.isPending
                    ? "Đang cập nhật…"
                    : "Xác nhận"}
                </button>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
