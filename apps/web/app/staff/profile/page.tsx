"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  StaffBonusCard,
  StaffCard,
  StaffIdentityOverview,
  SessionHistoryTableSkeleton,
} from "@/components/admin/staff";
import MonthNav from "@/components/admin/MonthNav";
import SessionHistoryTable from "@/components/admin/session/SessionHistoryTable";
import StaffSelfEditPopup from "@/components/staff/StaffSelfEditPopup";
import { BonusListItem } from "@/dtos/bonus.dto";
import { resolveCanonicalUserName } from "@/dtos/user-name.dto";
import {
  SessionItem,
  SessionUpdatePayload,
} from "@/dtos/session.dto";
import { StaffIncomeSummary, StaffStatus } from "@/dtos/staff.dto";
import {
  createMyStaffBonus,
  getFullProfile,
  getMyStaffBonuses,
  getMyStaffDetail,
  getMyStaffIncomeSummary,
  getMyStaffSessions,
  updateMyStaffBonus,
} from "@/lib/apis/auth.api";
import { formatCurrency } from "@/lib/class.helpers";
import * as staffOpsApi from "@/lib/apis/staff-ops.api";
import { ROLE_LABELS } from "@/lib/staff.constants";

function formatDate(iso?: string | null): string {
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

const STATUS_LABELS: Record<StaffStatus, string> = {
  active: "Hoạt động",
  inactive: "Ngừng",
};

type BonusRecord = {
  id: string;
  workType: string;
  amount: number;
  status: "paid" | "pending";
  note: string;
};

type BonusFormState = {
  workTypeOption: string;
  amount: string;
  status: "pending" | "paid";
  note: string;
};

type BonusFormMode = "create" | "edit";

const EMPTY_AMOUNT_SUMMARY = {
  total: 0,
  paid: 0,
  unpaid: 0,
};

const RECENT_UNPAID_DAYS = 14;
const STAFF_ROLE_WORK_TYPE_OPTIONS = Array.from(
  new Set(Object.values(ROLE_LABELS)),
);
const DEFAULT_ROLE_WORK_TYPE = "Giáo viên";
const DEFAULT_BONUS_FORM: BonusFormState = {
  workTypeOption: DEFAULT_ROLE_WORK_TYPE,
  amount: "",
  status: "pending",
  note: "",
};

function normalizeMoneyAmount(value?: number | string | null): number {
  const amount = typeof value === "number" ? value : Number(value ?? 0);
  return Number.isFinite(amount) ? amount : 0;
}

function normalizeBonusRecord(item: BonusListItem): BonusRecord {
  const rawStatus = (item.status ?? "").toString().toLowerCase();

  return {
    id: item.id,
    workType: item.workType?.trim() || "Khác",
    amount: normalizeMoneyAmount(item.amount),
    status: rawStatus === "paid" ? "paid" : "pending",
    note: item.note?.trim() || "",
  };
}

function getOtherRoleDetailHref(role: string) {
  if (role === "customer_care") {
    return "/staff/customer-care-detail";
  }

  if (role === "assistant") {
    return "/staff/assistant-detail";
  }

  if (role === "accountant") {
    return "/staff/accountant-detail";
  }

  if (role === "communication") {
    return "/staff/communication-detail";
  }

  if (role === "technical") {
    return "/staff/technical-detail";
  }

  if (role === "lesson_plan_head") {
    return "/staff/lesson_plan_detail";
  }

  if (role === "lesson_plan") {
    return "/staff/lesson_plan_detail";
  }

  return null;
}

function toStaffUpdateSessionPayload(payload: SessionUpdatePayload) {
  return {
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    notes: payload.notes ?? null,
    coefficient: payload.coefficient,
    attendance: payload.attendance?.map((item) => ({
      studentId: item.studentId,
      status: item.status,
      notes: item.notes ?? null,
    })),
  };
}

export default function StaffSelfDetailPage() {
  const { back, push } = useRouter();
  const queryClient = useQueryClient();
  const [editPopupOpen, setEditPopupOpen] = useState(false);
  const [addBonusPopupOpen, setAddBonusPopupOpen] = useState(false);
  const [depositPopupOpen, setDepositPopupOpen] = useState(false);
  const [bonusFormMode, setBonusFormMode] = useState<BonusFormMode>("create");
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null);
  const [bonusForm, setBonusForm] =
    useState<BonusFormState>(DEFAULT_BONUS_FORM);
  const [workTypeMenuOpen, setWorkTypeMenuOpen] = useState(false);
  const [workTypeSearch, setWorkTypeSearch] = useState("");
  const workTypeMenuRef = useRef<HTMLDivElement | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const [selectedYear, selectedMonthValue] = selectedMonth.split("-");
  const selectedMonthLabel = `Tháng ${Number.parseInt(selectedMonthValue, 10)}/${selectedYear}`;

  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
  } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });

  const linkedStaffId = profile?.staffInfo?.id ?? "";
  const canAccessClassWorkspace =
    profile?.roleType === "admin" ||
    (profile?.roleType === "staff" &&
      ((profile.staffInfo?.roles ?? []).includes("teacher") ||
        (profile.staffInfo?.roles ?? []).includes("accountant")));
  const canViewBeforeDeduction =
    profile?.roleType === "admin" ||
    (profile?.roleType === "staff" &&
      (profile.staffInfo?.roles ?? []).includes("accountant"));

  const {
    data: staff,
    isLoading: isStaffLoading,
    isError: isStaffError,
  } = useQuery({
    queryKey: ["staff", "self", "detail"],
    queryFn: getMyStaffDetail,
    enabled: !!linkedStaffId,
    retry: false,
    staleTime: 60_000,
  });

  const {
    data: sessionsInCurrentMonth = [],
    isLoading: isSessionsLoading,
    isError: isSessionsError,
  } = useQuery<SessionItem[]>({
    queryKey: ["sessions", "self", selectedYear, selectedMonthValue],
    queryFn: () =>
      getMyStaffSessions({
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!linkedStaffId,
    placeholderData: keepPreviousData,
  });

  const {
    data: incomeSummary,
    isError: isIncomeSummaryError,
    isLoading: isIncomeSummaryLoading,
  } = useQuery<StaffIncomeSummary>({
    queryKey: [
      "staff",
      "self",
      "income-summary",
      selectedYear,
      selectedMonthValue,
      RECENT_UNPAID_DAYS,
    ],
    queryFn: () =>
      getMyStaffIncomeSummary({
        month: selectedMonthValue,
        year: selectedYear,
        days: RECENT_UNPAID_DAYS,
      }),
    enabled: !!linkedStaffId,
    placeholderData: keepPreviousData,
  });

  const {
    data: bonusListResponse,
    isError: isBonusError,
    isLoading: isBonusLoading,
  } = useQuery({
    queryKey: ["bonus", "self", selectedMonth],
    queryFn: () =>
      getMyStaffBonuses({
        page: 1,
        limit: 100,
        month: selectedMonth,
      }),
    enabled: !!linkedStaffId,
    placeholderData: keepPreviousData,
  });

  const createBonusMutation = useMutation({
    mutationFn: createMyStaffBonus,
    onSuccess: async () => {
      toast.success("Đã thêm thưởng mới ở trạng thái chờ thanh toán.");
      setAddBonusPopupOpen(false);
      setBonusFormMode("create");
      setEditingBonusId(null);
      setBonusForm(DEFAULT_BONUS_FORM);
      setWorkTypeMenuOpen(false);
      setWorkTypeSearch("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["bonus", "self", selectedMonth],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "self", "income-summary"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "self", "detail"],
        }),
      ]);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (error as Error)?.message ??
        "Không thể thêm thưởng.";
      toast.error(message);
    },
  });

  const updateBonusMutation = useMutation({
    mutationFn: updateMyStaffBonus,
    onSuccess: async () => {
      toast.success("Đã điều chỉnh thưởng.");
      setAddBonusPopupOpen(false);
      setBonusFormMode("create");
      setEditingBonusId(null);
      setBonusForm(DEFAULT_BONUS_FORM);
      setWorkTypeMenuOpen(false);
      setWorkTypeSearch("");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["bonus", "self", selectedMonth],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "self", "income-summary"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "self", "detail"],
        }),
      ]);
    },
    onError: (error: unknown) => {
      const message =
        (error as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (error as Error)?.message ??
        "Không thể điều chỉnh thưởng.";
      toast.error(message);
    },
  });

  const handleStaffEditSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["staff", "self", "detail"] });
  }, [queryClient]);

  const refreshStaffSelfSessionData = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["sessions", "self"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["staff", "self", "income-summary"],
      }),
      queryClient.invalidateQueries({
        queryKey: ["staff", "self", "detail"],
      }),
    ]);
  }, [queryClient]);

  const bonusRecords = useMemo<BonusRecord[]>(() => {
    return (bonusListResponse?.data ?? []).map(normalizeBonusRecord);
  }, [bonusListResponse]);

  const bonuses = useMemo<
    {
      id: string;
      workType: string;
      status: "paid" | "unpaid" | "deposit";
      amount: number;
    }[]
  >(
    () =>
      bonusRecords.map((item) => ({
        id: item.id,
        workType: item.workType,
        amount: item.amount,
        status: item.status === "paid" ? "paid" : "unpaid",
      })),
    [bonusRecords],
  );

  const workTypeOptions = useMemo(() => {
    return STAFF_ROLE_WORK_TYPE_OPTIONS;
  }, []);

  const filteredWorkTypeOptions = useMemo(() => {
    const needle = workTypeSearch.trim().toLowerCase();
    if (!needle) return workTypeOptions;
    return workTypeOptions.filter((item) =>
      item.toLowerCase().includes(needle),
    );
  }, [workTypeOptions, workTypeSearch]);

  const getClassDetailForSessionEditor = useCallback(
    (classId: string) =>
      queryClient.ensureQueryData({
        queryKey: ["staff-ops", "class", "detail", "session-editor", classId],
        queryFn: () => staffOpsApi.getClassById(classId),
      }),
    [queryClient],
  );

  const getClassStudentsForSessionEditor = useCallback(
    async (classId: string) => {
      if (!classId) return [];

      const classDetail = await getClassDetailForSessionEditor(classId);

      return (classDetail.students ?? []).map((student) => ({
        id: student.id,
        fullName: student.fullName,
        tuitionFee: student.effectiveTuitionPerSession ?? null,
      }));
    },
    [getClassDetailForSessionEditor],
  );

  const handleUpdateSessionFromStaffPage = useCallback(
    async (sessionId: string, payload: SessionUpdatePayload) => {
      const updatedSession = await staffOpsApi.updateSession(
        sessionId,
        toStaffUpdateSessionPayload(payload),
      );

      await refreshStaffSelfSessionData();
      return updatedSession;
    },
    [refreshStaffSelfSessionData],
  );

  const openAddBonusPopup = () => {
    setBonusFormMode("create");
    setEditingBonusId(null);
    setBonusForm(DEFAULT_BONUS_FORM);
    setWorkTypeMenuOpen(false);
    setWorkTypeSearch("");
    setAddBonusPopupOpen(true);
  };

  const openEditBonusPopup = (bonusId: string) => {
    const target = bonusRecords.find((item) => item.id === bonusId);
    if (!target) {
      toast.error("Không tìm thấy thưởng để điều chỉnh.");
      return;
    }

    setBonusFormMode("edit");
    setEditingBonusId(target.id);
    setBonusForm({
      workTypeOption: target.workType,
      amount: String(target.amount),
      status: target.status,
      note: target.note,
    });
    setWorkTypeMenuOpen(false);
    setWorkTypeSearch("");
    setAddBonusPopupOpen(true);
  };

  const closeAddBonusPopup = () => {
    if (createBonusMutation.isPending || updateBonusMutation.isPending) return;
    setAddBonusPopupOpen(false);
    setBonusFormMode("create");
    setEditingBonusId(null);
    setBonusForm(DEFAULT_BONUS_FORM);
    setWorkTypeMenuOpen(false);
    setWorkTypeSearch("");
  };

  useEffect(() => {
    if (!addBonusPopupOpen || !workTypeMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!workTypeMenuRef.current?.contains(event.target as Node)) {
        setWorkTypeMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkTypeMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [addBonusPopupOpen, workTypeMenuOpen]);

  const handleSubmitBonus = async () => {
    const workType = bonusForm.workTypeOption.trim();
    if (!workType) {
      toast.error("Vui lòng nhập loại công việc.");
      return;
    }

    const parsedAmount = Number(bonusForm.amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
      toast.error("Số tiền không hợp lệ.");
      return;
    }

    if (bonusFormMode === "create") {
      try {
        await createBonusMutation.mutateAsync({
          workType,
          month: selectedMonth,
          amount: Math.round(parsedAmount),
          note: bonusForm.note.trim() || undefined,
        });
      } catch {
        // toast lỗi đã xử lý trong onError
      }
      return;
    }

    if (!editingBonusId) {
      toast.error("Không tìm thấy thưởng để điều chỉnh.");
      return;
    }

    try {
      await updateBonusMutation.mutateAsync({
        id: editingBonusId,
        workType,
        month: selectedMonth,
        amount: Math.round(parsedAmount),
        note: bonusForm.note.trim() || undefined,
      });
    } catch {
      // toast lỗi đã xử lý trong onError
    }
  };

  if (isProfileLoading || isStaffLoading) {
    return (
      <div
        className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 pb-8 sm:p-6"
        aria-busy="true"
        aria-live="polite"
      >
        <div className="mb-4 h-8 w-48 animate-pulse rounded bg-bg-tertiary" />
        <div className="mb-6 flex h-8 w-64 animate-pulse rounded bg-bg-tertiary" />

        <div className="rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="h-5 w-40 animate-pulse rounded bg-bg-tertiary" />
            <div className="size-12 shrink-0 animate-pulse rounded-md bg-bg-tertiary" />
          </div>
          <div className="mt-3 h-4 w-full max-w-md animate-pulse rounded bg-bg-tertiary" />
          <div className="mt-5 border-t border-border-default pt-4">
            <div className="h-5 w-48 animate-pulse rounded bg-bg-tertiary" />
            <div className="mt-3 rounded-lg border border-border-default bg-bg-secondary/40 px-3 py-3">
              <div className="space-y-2.5">
                <div className="h-3.5 w-full animate-pulse rounded bg-bg-tertiary" />
                <div className="h-3.5 w-11/12 animate-pulse rounded bg-bg-tertiary" />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border-default bg-bg-surface p-4">
          <div className="mb-4 h-5 w-40 animate-pulse rounded bg-bg-tertiary" />
          <div className="space-y-3">
            <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
            <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
          </div>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border-default bg-bg-surface p-4">
            <div className="mb-4 h-5 w-36 animate-pulse rounded bg-bg-tertiary" />
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
            </div>
          </div>
          <div className="rounded-lg border border-border-default bg-bg-surface p-4">
            <div className="mb-4 h-5 w-32 animate-pulse rounded bg-bg-tertiary" />
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!linkedStaffId || isProfileError || isStaffError || !profile || !staff) {
    const message = !linkedStaffId
      ? "Tài khoản hiện tại chưa có hồ sơ staff."
      : "Không tìm thấy hoặc không tải được thông tin staff hiện tại.";

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 pb-8 sm:p-6">
        <button
          type="button"
          onClick={() => back()}
          className="mb-4 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:min-w-0 sm:px-0"
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
          <span className="hidden sm:inline">Quay lại</span>
        </button>
        <div
          className="rounded-lg border border-error/30 bg-error/10 px-4 py-6 text-error"
          role="alert"
        >
          <p>{message}</p>
        </div>
      </div>
    );
  }

  const province = staff.user?.province || profile.province || "—";
  const resolvedQrLink = staff.bankQrLink?.trim() || null;
  const classMonthlySummaries = incomeSummary?.classMonthlySummaries ?? [];
  const monthlyIncomeTotals =
    incomeSummary?.monthlyIncomeTotals ?? EMPTY_AMOUNT_SUMMARY;
  const snapshotUnpaidNetTotal = incomeSummary?.snapshotUnpaidNetTotal ?? 0;
  const incomeStatsTotalNet =
    incomeSummary?.incomeStatsTotalNet ?? monthlyIncomeTotals.total;
  const yearIncomeTotal = incomeSummary?.yearIncomeTotal ?? 0;
  const monthlyGrossTotals =
    incomeSummary?.monthlyGrossTotals ?? EMPTY_AMOUNT_SUMMARY;
  const monthlyTaxTotals =
    incomeSummary?.monthlyTaxTotals ?? EMPTY_AMOUNT_SUMMARY;
  const monthlyOperatingDeductionTotals =
    incomeSummary?.monthlyOperatingDeductionTotals;
  const monthlyTotalDeductionTotals = incomeSummary?.monthlyTotalDeductionTotals;
  const yearTaxTotal = incomeSummary?.yearTaxTotal ?? 0;
  const yearOperatingDeductionTotal = incomeSummary?.yearOperatingDeductionTotal;
  const yearTotalDeductionTotal = incomeSummary?.yearTotalDeductionTotal;
  const depositYearTotal = incomeSummary?.depositYearTotal ?? 0;
  const depositByClass = incomeSummary?.depositYearByClass ?? [];
  const bonusTotals = incomeSummary?.bonusMonthlyTotals ?? EMPTY_AMOUNT_SUMMARY;
  const otherRoleSummaries = incomeSummary?.otherRoleSummaries ?? [];
  const staffDisplayName =
    resolveCanonicalUserName(profile, staff.user?.fullName || staff.fullName) ||
    profile.email ||
    "Nhân sự";
  const beforeDeductionCards = (() => {
    const cards = [
      {
        key: "gross-total",
        label: "Tổng tháng trước khấu trừ",
        value: monthlyGrossTotals.total,
      },
      {
        key: "gross-unpaid",
        label: "Chưa nhận trước khấu trừ",
        value: monthlyGrossTotals.unpaid,
      },
      {
        key: "gross-paid",
        label: "Đã nhận trước khấu trừ",
        value: monthlyGrossTotals.paid,
      },
      {
        key: "tax-month",
        label: "Khấu trừ thuế tháng",
        value: monthlyTaxTotals.total,
      },
      {
        key: "tax-year",
        label: "Khấu trừ thuế năm",
        value: yearTaxTotal,
      },
    ];

    if (monthlyOperatingDeductionTotals) {
      cards.push({
        key: "operating-month",
        label: "Khấu trừ vận hành tháng",
        value: monthlyOperatingDeductionTotals.total,
      });
    }

    if (yearOperatingDeductionTotal != null) {
      cards.push({
        key: "operating-year",
        label: "Khấu trừ vận hành năm",
        value: yearOperatingDeductionTotal,
      });
    }

    if (monthlyTotalDeductionTotals) {
      cards.push({
        key: "deduction-month",
        label: "Tổng khấu trừ tháng",
        value: monthlyTotalDeductionTotals.total,
      });
    }

    if (yearTotalDeductionTotal != null) {
      cards.push({
        key: "deduction-year",
        label: "Tổng khấu trừ năm",
        value: yearTotalDeductionTotal,
      });
    }

    return cards.filter((card) => card.value > 0);
  })();
  const avatarLabel = (staffDisplayName || "?")
    .charAt(0)
    .toUpperCase();

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 pb-8 sm:p-6">
      <button
        type="button"
        onClick={() => back()}
        className="mb-4 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:min-w-0 sm:px-0"
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
        <span className="hidden sm:inline">Quay lại</span>
      </button>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="relative flex shrink-0">
            <div
              className="flex size-14 items-center justify-center overflow-hidden rounded-full bg-bg-tertiary text-xl font-semibold text-text-primary ring-2 ring-border-default sm:size-16 sm:text-2xl"
              aria-hidden
            >
              {avatarLabel}
            </div>
            <span
              className={`absolute bottom-0 right-0 block size-3 rounded-full border-2 border-bg-surface ${staff.status === "active" ? "bg-success" : "bg-error"
                }`}
              title={STATUS_LABELS[staff.status]}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="mb-2 min-w-0 truncate text-lg font-semibold text-text-primary sm:text-xl">
              {staffDisplayName}
            </h1>
            <div className="flex flex-wrap gap-1.5">
              {(staff.roles ?? []).map((role) => (
                <span
                  key={role}
                  className="inline-flex rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-medium text-primary"
                >
                  {ROLE_LABELS[role] ?? role}
                </span>
              ))}
              {(!staff.roles || staff.roles.length === 0) && (
                <span className="text-sm text-text-muted">Chưa có role</span>
              )}
            </div>
          </div>
        </div>
      </header>

      <StaffSelfEditPopup
        key={`${staff.id}:${editPopupOpen ? "open" : "closed"}`}
        open={editPopupOpen}
        onClose={() => setEditPopupOpen(false)}
        profile={profile}
        onSuccess={handleStaffEditSuccess}
      />

      <div className="flex flex-col gap-4">
        <StaffIdentityOverview
          birthDateLabel={formatDate(staff.birthDate)}
          province={province}
          university={staff.university}
          specialization={staff.specialization}
          personalAchievementLink={staff.personalAchievementLink}
          googleMeetLink={staff.googleMeetLink}
          qrLink={resolvedQrLink}
          onQrEdit={() => setEditPopupOpen(true)}
        />

        <section
          className="rounded-lg border border-border-default bg-bg-surface p-4 shadow-sm sm:p-5"
          aria-labelledby="income-stats-title"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <h2
              id="income-stats-title"
              className="text-sm font-semibold uppercase tracking-wide text-text-primary"
            >
              Thống kê thu nhập
            </h2>
            <div className="sm:pt-0.5">
              <MonthNav
                value={selectedMonth}
                onChange={setSelectedMonth}
                monthPopupOpen={monthPopupOpen}
                setMonthPopupOpen={setMonthPopupOpen}
              />
            </div>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Tổng nhận</p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-primary">{formatCurrency(incomeStatsTotalNet)}</p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Chưa nhận</p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-error">{formatCurrency(snapshotUnpaidNetTotal)}</p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Đã nhận</p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-success">{formatCurrency(monthlyIncomeTotals.paid)}</p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Tổng năm</p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-warning">{formatCurrency(yearIncomeTotal)}</p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">Ghi cọc</p>
              {depositYearTotal > 0 ? (
                <button
                  type="button"
                  onClick={() => setDepositPopupOpen(true)}
                  className="mt-1 tabular-nums text-lg font-semibold text-warning underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                  aria-label="Xem danh sách buổi cọc theo lớp"
                >
                  {formatCurrency(depositYearTotal)}
                </button>
              ) : (
                <p className="mt-1 tabular-nums text-lg font-semibold text-text-muted">0</p>
              )}
            </article>
          </div>
          {canViewBeforeDeduction && beforeDeductionCards.length > 0 ? (
            <div className="mt-3 rounded-xl border border-border-default bg-bg-tertiary/70 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">Trước khấu trừ</p>
              <div className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
                {beforeDeductionCards.map((card) => (
                  <div
                    key={card.key}
                    className="rounded-lg border border-border-default/70 bg-bg-surface px-3 py-2"
                  >
                    <p className="text-[11px] text-text-muted">{card.label}</p>
                    <p className="tabular-nums text-sm font-semibold text-text-primary">
                      {formatCurrency(card.value)}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
          {isIncomeSummaryError ? (
            <p className="mt-3 text-sm text-error" role="alert">
              Không tải được tổng hợp thu nhập từ backend.
            </p>
          ) : null}
          {isIncomeSummaryLoading && !incomeSummary ? (
            <p className="mt-3 text-xs text-text-muted" aria-live="polite">
              Đang tải tổng hợp thu nhập từ backend.
            </p>
          ) : null}
        </section>

        <div className="grid gap-4 lg:grid-cols-2">
          <StaffCard title="Lớp phụ trách">
            {classMonthlySummaries.length === 0 ? (
              <p className="text-text-muted">Chưa gán lớp nào.</p>
            ) : (
              <>
                <div className="space-y-3 md:hidden">
                  {classMonthlySummaries.map((item) => {
                    const isInteractive = canAccessClassWorkspace;
                    return (
                      <div
                        key={item.classId}
                        role="button"
                        tabIndex={isInteractive ? 0 : -1}
                        aria-disabled={!isInteractive}
                        onClick={
                          isInteractive
                            ? () =>
                              push(
                                `/staff/classes/${encodeURIComponent(item.classId)}`,
                              )
                            : undefined
                        }
                        onKeyDown={
                          isInteractive
                            ? (e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                push(
                                  `/staff/classes/${encodeURIComponent(item.classId)}`,
                                );
                              }
                            }
                            : undefined
                        }
                        className={`rounded-lg border border-border-default bg-bg-secondary px-4 py-3 ${isInteractive
                          ? "cursor-pointer transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          : ""
                          }`}
                      >
                        <p className="font-medium text-text-primary">
                          {item.className}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                          <span>
                            Tổng:{" "}
                            <span className="font-semibold text-primary">
                              {formatCurrency(item.total)}
                            </span>
                          </span>
                          <span>
                            Chưa nhận:{" "}
                            <span className="font-semibold text-error">
                              {formatCurrency(item.unpaid)}
                            </span>
                          </span>
                          <span>
                            Đã nhận:{" "}
                            <span className="font-semibold text-success">
                              {formatCurrency(item.paid)}
                            </span>
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-default bg-bg-secondary">
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary"
                        >
                          Lớp
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary tabular-nums"
                        >
                          Tổng
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary tabular-nums"
                        >
                          Chưa nhận
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary tabular-nums"
                        >
                          Đã nhận
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {classMonthlySummaries.map((item) => {
                        const isInteractive = canAccessClassWorkspace;
                        return (
                          <tr
                            key={item.classId}
                            role={isInteractive ? "button" : undefined}
                            tabIndex={isInteractive ? 0 : undefined}
                            onClick={
                              isInteractive
                                ? () =>
                                  push(
                                    `/staff/classes/${encodeURIComponent(item.classId)}`,
                                  )
                                : undefined
                            }
                            onKeyDown={
                              isInteractive
                                ? (e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    push(
                                      `/staff/classes/${encodeURIComponent(item.classId)}`,
                                    );
                                  }
                                }
                                : undefined
                            }
                            className={`border-b border-border-default bg-bg-surface transition-colors duration-200 ${isInteractive ? "cursor-pointer hover:bg-bg-secondary" : ""
                              }`}
                          >
                            <td className="px-4 py-3 text-text-primary">
                              {item.className}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-primary">
                              {formatCurrency(item.total)}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-error">
                              {formatCurrency(item.unpaid)}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-success">
                              {formatCurrency(item.paid)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </StaffCard>
          <div className="space-y-2">
            <StaffBonusCard
              bonuses={bonuses}
              totalMonth={bonusTotals.total}
              paid={bonusTotals.paid}
              unpaid={bonusTotals.unpaid}
              onAddBonus={openAddBonusPopup}
              onEditBonus={(bonus) => openEditBonusPopup(bonus.id)}
              canManage
            />
            {isBonusLoading ? (
              <p className="text-sm text-text-muted" aria-live="polite">
                Đang tải dữ liệu thưởng…
              </p>
            ) : null}
            {isBonusError ? (
              <p className="text-sm text-error" role="alert">
                Không tải được dữ liệu thưởng.
              </p>
            ) : null}

          </div>
        </div>

        <StaffCard title="Công việc khác">
          {(() => {
            if (isIncomeSummaryLoading && !incomeSummary) {
              return (
                <p className="text-text-muted" aria-live="polite">
                  Đang tải dữ liệu công việc khác…
                </p>
              );
            }

            if (isIncomeSummaryError) {
              return (
                <p className="text-error" role="alert">
                  Không tải được dữ liệu công việc khác từ backend.
                </p>
              );
            }

            if (otherRoleSummaries.length === 0) {
              return (
                <p className="text-text-muted">
                  Chưa có công việc khác (role ngoài giáo viên).
                </p>
              );
            }
            return (
              <>
                <div className="space-y-3 md:hidden">
                  {otherRoleSummaries.map((item) => {
                    const detailHref = getOtherRoleDetailHref(item.role);
                    const isInteractive = detailHref !== null;
                    const cardClassName = `block rounded-lg border border-border-default bg-bg-secondary px-4 py-3 transition-colors ${isInteractive
                      ? "hover:bg-bg-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      : ""
                      }`;
                    const cardContent = (
                      <>
                        <p className="font-medium text-text-primary">
                          {item.label}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
                          <span>
                            Tổng:{" "}
                            <span className="font-semibold text-primary">
                              {formatCurrency(item.total)}
                            </span>
                          </span>
                          <span>
                            Chưa nhận:{" "}
                            <span className="font-semibold text-error">
                              {formatCurrency(item.unpaid)}
                            </span>
                          </span>
                          <span>
                            Đã nhận:{" "}
                            <span className="font-semibold text-success">
                              {formatCurrency(item.paid)}
                            </span>
                          </span>
                        </div>
                      </>
                    );

                    if (isInteractive) {
                      return (
                        <Link
                          key={item.role}
                          href={detailHref}
                          className={cardClassName}
                        >
                          {cardContent}
                        </Link>
                      );
                    }

                    return (
                      <div
                        key={item.role}
                        className={cardClassName}
                      >
                        {cardContent}
                      </div>
                    );
                  })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[480px] border-collapse text-left text-sm">
                    <caption className="sr-only">
                      Bảng công việc khác theo role
                    </caption>
                    <thead>
                      <tr className="border-b border-border-default bg-bg-secondary">
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary"
                        >
                          Công việc
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary tabular-nums"
                        >
                          Tổng nhận
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary tabular-nums"
                        >
                          Chưa nhận
                        </th>
                        <th
                          scope="col"
                          className="px-4 py-3 font-medium text-text-primary tabular-nums"
                        >
                          Đã nhận
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {otherRoleSummaries.map((item) => {
                        const detailHref = getOtherRoleDetailHref(item.role);
                        const isInteractive = detailHref !== null;
                        const cellLinkClass =
                          "block -mx-4 -my-3 px-4 py-3 transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus";

                        return (
                          <tr
                            key={item.role}
                            className={`border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary ${isInteractive ? "cursor-pointer" : ""
                              }`}
                          >
                            <td className="px-4 py-3 text-text-primary">
                              {isInteractive ? (
                                <Link href={detailHref} className={cellLinkClass}>
                                  {item.label}
                                </Link>
                              ) : (
                                item.label
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-primary">
                              {isInteractive ? (
                                <Link href={detailHref} className={cellLinkClass}>
                                  {formatCurrency(item.total)}
                                </Link>
                              ) : (
                                formatCurrency(item.total)
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-error">
                              {isInteractive ? (
                                <Link href={detailHref} className={cellLinkClass}>
                                  {formatCurrency(item.unpaid)}
                                </Link>
                              ) : (
                                formatCurrency(item.unpaid)
                              )}
                            </td>
                            <td className="px-4 py-3 tabular-nums font-semibold text-success">
                              {isInteractive ? (
                                <Link href={detailHref} className={cellLinkClass}>
                                  {formatCurrency(item.paid)}
                                </Link>
                              ) : (
                                formatCurrency(item.paid)
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            );
          })()}
        </StaffCard>

        <StaffCard title="Lịch sử buổi học">
          <div className="min-w-0 overflow-x-auto">
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="space-y-2">
                <div className="rounded-full bg-bg-secondary px-3 py-1 text-xs text-text-muted sm:bg-transparent sm:px-0 sm:py-0 sm:text-sm">
                  Đang xem {selectedMonthLabel} · {sessionsInCurrentMonth.length} buổi
                </div>
              </div>
            </div>
            {isSessionsLoading ? (
              <SessionHistoryTableSkeleton
                rows={1}
                entityMode="class"
                variant="classDetail"
                showActionsColumn
              />
            ) : (
              <SessionHistoryTable
                sessions={sessionsInCurrentMonth}
                entityMode="class"
                variant="classDetail"
                emptyText="Không có buổi học trong tháng này."
                editorLayout="wide"
                showActionsColumn
                getClassStudents={getClassStudentsForSessionEditor}
                getClassDetailForEdit={getClassDetailForSessionEditor}
                allowTeacherSelection={false}
                allowFinancialEdits={false}
                allowCoefficientEdit
                allowPaymentStatusEdit={false}
                allowDeleteSession={false}
                updateSessionFn={handleUpdateSessionFromStaffPage}
              />
            )}
            {isSessionsError ? (
              <p className="mt-3 text-sm text-error" role="alert">
                Không tải được lịch sử buổi học.
              </p>
            ) : null}
          </div>
        </StaffCard>
      </div>

      {addBonusPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/50"
            aria-hidden
            onClick={closeAddBonusPopup}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-bonus-title"
            className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-1.5rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-xl border border-border-default bg-bg-surface p-4 shadow-xl sm:p-5"
          >
            <h2
              id="add-bonus-title"
              className="text-lg font-semibold text-text-primary"
            >
              {bonusFormMode === "create"
                ? "Thêm thưởng"
                : "Điều chỉnh thưởng"}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {bonusFormMode === "create"
                ? `Tạo đề nghị thưởng cho ${selectedMonthLabel}`
                : `Cập nhật nội dung khoản thưởng trong ${selectedMonthLabel}`}
            </p>

            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  Loại công việc
                </span>
                <div className="relative" ref={workTypeMenuRef}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border-default bg-bg-surface px-3 py-2 text-left text-sm text-text-primary transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    onClick={() => {
                      setWorkTypeMenuOpen((prev) => !prev);
                    }}
                    aria-haspopup="listbox"
                    aria-expanded={workTypeMenuOpen}
                    aria-label="Chọn loại công việc"
                  >
                    <span className="truncate">{bonusForm.workTypeOption}</span>
                    <svg
                      className={`ml-2 size-4 shrink-0 text-text-muted transition-transform duration-200 ${workTypeMenuOpen ? "rotate-180" : ""}`}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      aria-hidden
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="m6 9 6 6 6-6"
                      />
                    </svg>
                  </button>

                  {workTypeMenuOpen ? (
                    <div
                      role="listbox"
                      aria-label="Danh sách công việc"
                      className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border-default bg-bg-surface shadow-lg"
                    >
                      <div className="border-b border-border-default p-2">
                        <input
                          type="search"
                          value={workTypeSearch}
                          onChange={(e) => setWorkTypeSearch(e.target.value)}
                          placeholder="Tìm công việc…"
                          className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                        />
                      </div>
                      <div className="max-h-64 overflow-auto p-1">
                        {filteredWorkTypeOptions.map((item) => {
                          const isSelected = bonusForm.workTypeOption === item;
                          return (
                            <button
                              key={item}
                              type="button"
                              role="option"
                              aria-selected={isSelected}
                              className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition-colors duration-150 ${isSelected
                                ? "bg-primary/10 font-medium text-text-primary"
                                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                                }`}
                              onClick={() => {
                                setBonusForm((prev) => ({
                                  ...prev,
                                  workTypeOption: item,
                                }));
                                setWorkTypeMenuOpen(false);
                              }}
                            >
                              <span>{item}</span>
                            </button>
                          );
                        })}
                        {filteredWorkTypeOptions.length === 0 ? (
                          <p className="px-2 py-2 text-sm text-text-muted">
                            Không tìm thấy công việc phù hợp.
                          </p>
                        ) : null}
                      </div>
                    </div>
                  ) : null}
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  Số tiền
                </span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={bonusForm.amount}
                  onChange={(e) =>
                    setBonusForm((prev) => ({
                      ...prev,
                      amount: e.target.value,
                    }))
                  }
                  placeholder="Ví dụ: 500000"
                  className="w-full rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  Trạng thái thanh toán
                </span>
                <div className="rounded-lg border border-border-default bg-bg-secondary/60 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <span className="inline-flex items-center gap-2 text-sm font-medium text-text-primary">
                      <span
                        className={`size-2.5 rounded-full ${bonusForm.status === "paid" ? "bg-success" : "bg-warning"}`}
                        aria-hidden
                      />
                      {bonusForm.status === "paid"
                        ? "Đã thanh toán"
                        : "Chờ thanh toán"}
                    </span>
                    <span className="rounded-full border border-border-default bg-bg-surface px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-text-muted">
                      Chỉ xem
                    </span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-text-muted">
                    Trạng thái thanh toán do quản trị xác nhận. Bạn chỉ điều
                    chỉnh nội dung khoản thưởng.
                  </p>
                </div>
              </label>

              <label className="block">
                <span className="mb-1 block text-sm font-medium text-text-secondary">
                  Ghi chú
                </span>
                <textarea
                  rows={3}
                  value={bonusForm.note}
                  onChange={(e) =>
                    setBonusForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="Ghi chú thêm (nếu có)"
                  className="w-full resize-none rounded-md border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                />
              </label>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={closeAddBonusPopup}
                className="min-h-11 rounded-md border border-border-default bg-bg-surface px-4 py-2.5 text-sm font-medium text-text-primary transition hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:py-2"
                disabled={
                  createBonusMutation.isPending || updateBonusMutation.isPending
                }
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSubmitBonus}
                className="min-h-11 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-text-inverse transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:py-2 disabled:cursor-not-allowed disabled:opacity-60"
                disabled={
                  createBonusMutation.isPending || updateBonusMutation.isPending
                }
              >
                {createBonusMutation.isPending || updateBonusMutation.isPending
                  ? "Đang lưu…"
                  : bonusFormMode === "create"
                    ? "Thêm thưởng"
                    : "Lưu điều chỉnh"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {depositPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/55 backdrop-blur-[2px]"
            aria-hidden
            onClick={() => setDepositPopupOpen(false)}
          />
          <div className="fixed inset-0 z-50 p-2 sm:p-4">
            <div className="mx-auto flex h-full w-full max-w-2xl items-center">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="deposit-list-title"
                className="flex max-h-full w-full flex-col overflow-hidden rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3 border-b border-border-default/70 pb-4">
                  <div className="min-w-0">
                    <h2
                      id="deposit-list-title"
                      className="truncate text-lg font-semibold text-text-primary"
                    >
                      Buổi cọc theo lớp
                    </h2>
                    <p className="mt-1 text-sm text-text-muted">
                      Tổng cọc năm {selectedYear}:{" "}
                      <span className="font-semibold tabular-nums text-warning">
                        {formatCurrency(depositYearTotal)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setDepositPopupOpen(false)}
                    className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    aria-label="Đóng"
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

                <div className="min-h-0 flex-1 overflow-y-auto pr-1 sm:pr-2">
                  {depositByClass.length === 0 ? (
                    <div className="rounded-xl border border-border-default bg-bg-secondary/40 px-4 py-6 text-center">
                      <p className="text-sm font-medium text-text-primary">
                        Chưa có buổi cọc.
                      </p>
                      <p className="mt-1 text-sm text-text-muted">
                        Buổi cọc là session có trạng thái thanh toán là{" "}
                        <span className="font-medium">deposit</span>.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {depositByClass.map((group) => (
                        <section
                          key={group.classId}
                          className="overflow-hidden rounded-xl border border-border-default bg-bg-surface"
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2 border-b border-border-default bg-bg-secondary/50 px-4 py-3">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-text-primary">
                                {group.className}
                              </p>
                              <p className="mt-0.5 text-xs text-text-muted">
                                {group.sessions.length} buổi
                              </p>
                            </div>
                            <div className="shrink-0 text-right">
                              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                                Tổng cọc
                              </p>
                              <p className="text-sm font-semibold tabular-nums text-warning">
                                {formatCurrency(group.total)}
                              </p>
                            </div>
                          </div>

                          <div className="divide-y divide-border-subtle">
                            {group.sessions.map((session) => (
                              <div
                                key={session.id}
                                className="flex flex-wrap items-center justify-between gap-2 px-4 py-3"
                              >
                                <div className="min-w-0">
                                  <p className="text-sm font-medium text-text-primary">
                                    {formatDate(session.date)}
                                  </p>
                                  <p className="mt-0.5 text-xs text-text-muted">
                                    Trạng thái:{" "}
                                    <span className="font-medium">
                                      {String(
                                        session.teacherPaymentStatus ?? "deposit",
                                      )}
                                    </span>
                                  </p>
                                </div>
                                <p className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                                  {formatCurrency(session.teacherAllowanceTotal)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 flex justify-end border-t border-border-default pt-4">
                  <button
                    type="button"
                    onClick={() => setDepositPopupOpen(false)}
                    className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
