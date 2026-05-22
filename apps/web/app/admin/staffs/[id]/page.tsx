"use client";

import { useParams, usePathname, useRouter } from "next/navigation";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as classApi from "@/lib/apis/class.api";
import * as bonusApi from "@/lib/apis/bonus.api";
import * as staffApi from "@/lib/apis/staff.api";
import * as deductionSettingsApi from "@/lib/apis/deduction-settings.api";
import {
  EditStaffPopup,
  StaffBonusCard,
  StaffCard,
  StaffIdentityOverview,
  QrLinkPopup,
  SessionHistoryTableSkeleton,
} from "@/components/admin/staff";
import { BonusListItem } from "@/dtos/bonus.dto";
import {
  StaffDepositPaymentPreview,
  StaffDetail,
  StaffIncomeSummary,
  StaffPayDepositSessionsResult,
  StaffPayAllPaymentsResult,
  StaffPaymentPreview,
  StaffStatus,
} from "@/dtos/staff.dto";
import { StaffRoleType } from "@/dtos/deduction-settings.dto";
import { formatCurrency } from "@/lib/class.helpers";
import { ROLE_LABELS } from "@/lib/staff.constants";
import {
  buildAdminLikePath,
  buildStaffRoleDetailHref,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import * as sessionApi from "@/lib/apis/session.api";
import SessionHistoryTable from "@/components/admin/session/SessionHistoryTable";
import MonthNav from "@/components/admin/MonthNav";
import { SessionItem } from "@/dtos/session.dto";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import UserAvatar from "@/components/ui/UserAvatar";
import { pickAvatarUrl } from "@/lib/avatar";
import { useAuth } from "@/context/AuthContext";

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

function RetiredTeachingLabel() {
  return (
    <span className="mt-1 inline-flex w-fit rounded-full border border-warning/25 bg-warning/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-warning">
      NGHỈ DẠY
    </span>
  );
}

function formatCompactDate(iso?: string | null): string {
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

function formatRatePercent(ratePercent?: number | null): string {
  const normalized =
    typeof ratePercent === "number" && Number.isFinite(ratePercent)
      ? ratePercent
      : 0;
  return `${normalized.toFixed(2)}%`;
}

function parseOperatingPercentInput(raw: string): number | null {
  const trimmed = raw.trim().replace(",", ".");
  if (trimmed === "") return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

function getPaymentStatusLabel(status?: string | null): string {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "paid") return "Đã thanh toán";
  if (normalized === "pending") return "Chờ thanh toán";
  if (normalized === "unpaid") return "Chưa thanh toán";
  if (normalized === "deposit") return "Ghi cọc";
  if (!normalized) return "—";
  return status ?? "—";
}

function getPaymentStatusBadgeClass(status?: string | null): string {
  const normalized = status?.trim().toLowerCase();

  if (normalized === "paid") {
    return "border-success/30 bg-success/10 text-success";
  }

  if (normalized === "deposit") {
    return "border-warning/30 bg-warning/10 text-warning";
  }

  return "border-error/30 bg-error/10 text-error";
}

function shouldShowPaymentOperatingColumn(role?: string | null): boolean {
  return role === "teacher";
}

function shouldShowPaymentTaxColumn(role?: string | null): boolean {
  return role != null;
}

const STATUS_LABELS: Record<StaffStatus, string> = {
  active: "Hoạt động",
  inactive: "Ngừng",
};
const STAFF_ROLE_WORK_TYPE_OPTIONS = Object.values(ROLE_LABELS);

type BonusFormState = {
  workTypeOption: string;
  amount: string;
  status: "pending" | "paid";
  note: string;
};

type BonusRecord = {
  id: string;
  workType: string;
  amount: number;
  status: "paid" | "pending";
  note: string;
};

type StaffRoleTaxItem = {
  role: StaffRoleType;
  label: string;
  ratePercent: number;
  source: "override" | "default";
  overrideId: string | null;
  effectiveFrom: string | null;
};

type TaxBulkDraftItem = {
  role: StaffRoleType;
  label: string;
  source: "override" | "default";
  overrideId: string | null;
  ratePercentInput: string;
  effectiveFrom: string;
};

const DEFAULT_ROLE_WORK_TYPE = "Giáo viên";
const DEFAULT_BONUS_FORM: BonusFormState = {
  workTypeOption: DEFAULT_ROLE_WORK_TYPE,
  amount: "",
  status: "pending",
  note: "",
};

const EMPTY_AMOUNT_SUMMARY = {
  total: 0,
  paid: 0,
  unpaid: 0,
};

const EMPTY_DEPOSIT_PREVIEW_SUMMARY = {
  preTaxTotal: 0,
  taxTotal: 0,
  netTotal: 0,
  itemCount: 0,
};

const EMPTY_DEPOSIT_PREVIEW_CLASSES: StaffDepositPaymentPreview["classes"] = [];

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

function getTodayDateString() {
  return new Date().toISOString().slice(0, 10);
}

function getApiErrorMessage(error: unknown, fallbackMessage: string) {
  const message = (
    error as { response?: { data?: { message?: string | string[] } } }
  )?.response?.data?.message;

  if (Array.isArray(message) && message.length > 0) {
    return message.join(", ");
  }

  if (typeof message === "string" && message.trim()) {
    return message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallbackMessage;
}

function parseRatePercentOrThrow(rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) {
    throw new Error("Vui lòng nhập tỷ lệ %.");
  }

  const numericValue = Number(normalized);
  if (
    !Number.isFinite(numericValue) ||
    numericValue < 0 ||
    numericValue > 100
  ) {
    throw new Error("Tỷ lệ % phải nằm trong khoảng 0-100.");
  }

  return Number(numericValue.toFixed(2));
}

export default function AdminStaffDetailPage({
  staffId: propStaffId,
}: { staffId?: string } = {}) {
  const params = useParams();
  const id = propStaffId ?? (typeof params?.id === "string" ? params.id : "");
  const { back, push } = useRouter();
  const { user: authUser } = useAuth();
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const [today] = useState(() => getTodayDateString());
  const [editPopupOpen, setEditPopupOpen] = useState(false);
  const [qrLink, setQrLink] = useState<string | null>(null);
  const [qrPopupOpen, setQrPopupOpen] = useState(false);
  const [addBonusPopupOpen, setAddBonusPopupOpen] = useState(false);
  const [bonusFormMode, setBonusFormMode] = useState<"create" | "edit">(
    "create",
  );
  const [editingBonusId, setEditingBonusId] = useState<string | null>(null);
  const [bonusForm, setBonusForm] =
    useState<BonusFormState>(DEFAULT_BONUS_FORM);
  const [workTypeMenuOpen, setWorkTypeMenuOpen] = useState(false);
  const [workTypeSearch, setWorkTypeSearch] = useState("");
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);
  const [depositPopupOpen, setDepositPopupOpen] = useState(false);
  const [selectedDepositSessionIds, setSelectedDepositSessionIds] = useState<
    string[]
  >([]);
  const [paymentPreviewPopupOpen, setPaymentPreviewPopupOpen] = useState(false);
  const [isTaxEditMode, setIsTaxEditMode] = useState(false);
  const [taxBulkDrafts, setTaxBulkDrafts] = useState<
    Partial<Record<StaffRoleType, TaxBulkDraftItem>>
  >({});
  const [classOperatingDraft, setClassOperatingDraft] = useState<
    Record<string, string>
  >({});
  const workTypeMenuRef = useRef<HTMLDivElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const { isAdmin, isAssistant, isAccountant } =
    resolveAdminShellAccess(fullProfile);
  const ownStaffId = fullProfile?.staffInfo?.id;
  const viewingOwnStaffRecordOnStaffShell =
    routeBase === "/staff" && Boolean(ownStaffId) && ownStaffId === id;
  const canViewBeforeDeduction = isAdmin || isAccountant;
  const canCreateBonus = isAdmin || isAssistant || isAccountant;
  const canDeleteBonus = !isAccountant;
  const canEditTaxSettings = isAdmin || isAssistant || isAccountant;
  const canPayAll = isAdmin || isAssistant || isAccountant;

  const {
    data: staff,
    isLoading,
    isError,
    refetch: refetchStaff,
  } = useQuery<StaffDetail>({
    queryKey: ["staff", "detail", id],
    queryFn: () => staffApi.getStaffById(id),
    enabled: !!id,
  });

  const [selectedMonth, setSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const [selectedYear, selectedMonthValue] = selectedMonth.split("-");

  const selectedMonthLabel = `Tháng ${Number.parseInt(selectedMonthValue, 10)}/${selectedYear}`;

  const queryClient = useQueryClient();
  const {
    data: sessionsInCurrentMonth = [],
    isLoading: isSessionsLoading,
    isError: isSessionsError,
  } = useQuery<SessionItem[]>({
    queryKey: ["sessions", "staff", id, selectedYear, selectedMonthValue],
    queryFn: () =>
      sessionApi.getSessionsByStaffId(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
  const {
    data: incomeSummary,
    isError: isIncomeSummaryError,
    isLoading: isIncomeSummaryLoading,
  } = useQuery<StaffIncomeSummary>({
    queryKey: ["staff", "income-summary", id, selectedYear, selectedMonthValue],
    queryFn: () =>
      staffApi.getStaffIncomeSummary(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
  const asOfDate = useMemo(() => {
    const selectedYearNumber = Number.parseInt(selectedYear, 10);
    const selectedMonthNumber = Number.parseInt(selectedMonthValue, 10);
    if (
      !Number.isFinite(selectedYearNumber) ||
      !Number.isFinite(selectedMonthNumber)
    ) {
      return `${selectedYear}-${selectedMonthValue}-01`;
    }

    const now = new Date();
    const currentMonthKey = `${now.getFullYear()}-${String(
      now.getMonth() + 1,
    ).padStart(2, "0")}`;
    if (selectedMonth === currentMonthKey) {
      return today;
    }

    const lastDayOfMonth = new Date(
      selectedYearNumber,
      selectedMonthNumber,
      0,
    ).getDate();
    return `${selectedYear}-${selectedMonthValue}-${String(
      lastDayOfMonth,
    ).padStart(2, "0")}`;
  }, [selectedMonth, selectedMonthValue, selectedYear, today]);
  const {
    data: taxSettings,
    isLoading: isTaxSettingsLoading,
    isError: isTaxSettingsError,
  } = useQuery({
    queryKey: ["staff", "tax-settings", id, asOfDate],
    queryFn: () =>
      deductionSettingsApi.getTaxDeductionSettings({
        staffId: id,
        asOfDate,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
  const {
    data: paymentPreview,
    isLoading: isPaymentPreviewLoading,
    isError: isPaymentPreviewError,
  } = useQuery<StaffPaymentPreview>({
    queryKey: [
      "staff",
      "payment-preview",
      id,
      selectedYear,
      selectedMonthValue,
    ],
    queryFn: () =>
      staffApi.getStaffPaymentPreview(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id && paymentPreviewPopupOpen && canPayAll,
  });
  const {
    data: depositPaymentPreview,
    isLoading: isDepositPaymentPreviewLoading,
    isError: isDepositPaymentPreviewError,
  } = useQuery<StaffDepositPaymentPreview>({
    queryKey: ["staff", "deposit-payment-preview", id, selectedYear],
    queryFn: () =>
      staffApi.getStaffDepositPaymentPreview(id, {
        year: selectedYear,
      }),
    enabled: !!id && depositPopupOpen && canPayAll,
  });

  const handleSessionUpdated = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["sessions", "staff", id, selectedYear, selectedMonthValue],
    });
    queryClient.invalidateQueries({
      queryKey: ["staff", "income-summary", id],
    });
    queryClient.invalidateQueries({
      queryKey: ["staff", "detail", id],
    });
  }, [queryClient, id, selectedYear, selectedMonthValue]);

  const handleStaffEditSuccess = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["staff", "detail", id] });
    queryClient.invalidateQueries({ queryKey: ["staff", "list"] });
  }, [queryClient, id]);

  const updateQrLinkMutation = useMutation({
    mutationFn: (link: string) =>
      staffApi.updateStaff({
        id,
        bank_qr_link: link,
      }),
    onSuccess: async (updatedStaff) => {
      const nextLink = updatedStaff.bankQrLink?.trim() || null;
      setQrLink(nextLink);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["staff", "detail", id] }),
        queryClient.invalidateQueries({ queryKey: ["staff", "list"] }),
      ]);
    },
    onError: (err: unknown) => {
      toast.error(
        getApiErrorMessage(err, "Không thể cập nhật link QR thanh toán."),
      );
    },
  });

  const getTeachersForClass = useCallback(async (classId: string) => {
    const detail = await classApi.getClassById(classId);
    return (detail.teachers ?? []).map((t) => ({
      id: t.id,
      fullName: t.fullName,
    }));
  }, []);

  const getClassStudents = useCallback(async (classId: string) => {
    const detail = await classApi.getClassById(classId);
    return (detail.students ?? []).map((s) => ({
      id: s.id,
      fullName: s.fullName,
      tuitionFee: s.effectiveTuitionPerSession ?? null,
    }));
  }, []);

  const {
    data: bonusListResponse,
    isError: isBonusError,
    isLoading: isBonusLoading,
  } = useQuery({
    queryKey: ["bonus", "list", "staff", id, selectedMonth],
    queryFn: () =>
      bonusApi.getBonuses({
        page: 1,
        limit: 100,
        staffId: id,
        month: selectedMonth,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

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

  const resolvedQrLink = useMemo(() => {
    const link =
      (staff as { qrPaymentLink?: string } | undefined)?.qrPaymentLink ||
      (staff as { qr_payment_link?: string } | undefined)?.qr_payment_link ||
      (staff as { bankQrLink?: string } | undefined)?.bankQrLink ||
      (staff as { bankQRLink?: string } | undefined)?.bankQRLink ||
      (staff as { bank_qr_link?: string } | undefined)?.bank_qr_link;
    const normalized = link?.trim();
    return normalized ? normalized : null;
  }, [staff]);

  const province = staff?.user?.province || "—";
  const classMonthlySummaries = useMemo(
    () => incomeSummary?.classMonthlySummaries ?? [],
    [incomeSummary?.classMonthlySummaries],
  );
  const showClassOperatingColumn = routeBase === "/admin";
  const canEditClassOperatingDeduction = isAdmin && routeBase === "/admin";
  const operatingPercentByClassId = useMemo(() => {
    const m = new Map<string, number>();
    for (const row of staff?.classTeachers ?? []) {
      const cid = row.class?.id;
      if (!cid) continue;
      const raw = row.operatingDeductionRatePercent;
      const n = typeof raw === "number" ? raw : Number(raw ?? 0);
      m.set(cid, Number.isFinite(n) ? Math.round(n * 100) / 100 : 0);
    }
    return m;
  }, [staff?.classTeachers]);

  const saveClassOperatingCardMutation = useMutation({
    mutationFn: async (draftSnapshot: Record<string, string>) => {
      if (!canEditClassOperatingDeduction || !id) return undefined;
      const detail = queryClient.getQueryData<StaffDetail>([
        "staff",
        "detail",
        id,
      ]);
      if (!detail) return undefined;

      const baselineForClass = (classId: string) => {
        const row = detail.classTeachers?.find(
          (ct) => ct.class?.id === classId,
        );
        const raw = row?.operatingDeductionRatePercent;
        const n = typeof raw === "number" ? raw : Number(raw ?? 0);
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
      };

      const toPatch: {
        classId: string;
        operating_deduction_rate_percent: number;
      }[] = [];

      for (const item of classMonthlySummaries) {
        const classId = item.classId;
        const hasRow = detail.classTeachers?.some(
          (ct) => ct.class?.id === classId,
        );
        if (!hasRow) continue;

        const baseline = baselineForClass(classId);
        const draft = draftSnapshot[classId];
        const inputStr =
          draft !== undefined
            ? draft
            : Number.isFinite(baseline)
              ? String(baseline.toFixed(2))
              : "0";
        const parsed = parseOperatingPercentInput(inputStr);
        if (parsed === null) {
          throw new Error("VALIDATION");
        }
        if (Math.abs(parsed - baseline) >= 0.0001) {
          toPatch.push({
            classId,
            operating_deduction_rate_percent: parsed,
          });
        }
      }

      if (toPatch.length === 0) return undefined;

      const results = await Promise.all(
        toPatch.map((row) =>
          staffApi.patchStaffClassTeacherOperatingDeduction(id, row.classId, {
            operating_deduction_rate_percent:
              row.operating_deduction_rate_percent,
          }),
        ),
      );
      return results.at(-1);
    },
    onSuccess: (data) => {
      if (!data) return;
      queryClient.setQueryData(["staff", "detail", id], data);
      setClassOperatingDraft({});
      toast.success("Đã cập nhật % khấu trừ vận hành theo lớp.");
    },
    onError: (err: unknown) => {
      if (err instanceof Error && err.message === "VALIDATION") {
        toast.error("Nhập % từ 0 đến 100.");
        return;
      }
      toast.error("Không lưu được tỷ lệ khấu trừ vận hành.");
    },
  });

  const isClassOperatingDirty = useMemo(() => {
    if (!canEditClassOperatingDeduction || !staff) return false;
    for (const item of classMonthlySummaries) {
      const classId = item.classId;
      const hasRow = staff.classTeachers?.some(
        (ct) => ct.class?.id === classId,
      );
      if (!hasRow) continue;
      const baseline = operatingPercentByClassId.get(classId) ?? 0;
      const draft = classOperatingDraft[classId];
      const inputStr =
        draft !== undefined
          ? draft
          : Number.isFinite(baseline)
            ? String(baseline.toFixed(2))
            : "0";
      const parsed = parseOperatingPercentInput(inputStr);
      if (parsed === null) return true;
      if (Math.abs(parsed - baseline) >= 0.0001) return true;
    }
    return false;
  }, [
    canEditClassOperatingDeduction,
    staff,
    classMonthlySummaries,
    operatingPercentByClassId,
    classOperatingDraft,
  ]);

  const handleClassOperatingDiscard = useCallback(async () => {
    setClassOperatingDraft({});
    try {
      await refetchStaff();
    } catch {
      toast.error("Không tải lại được dữ liệu nhân sự.");
    }
  }, [refetchStaff]);

  const monthlyIncomeTotals =
    incomeSummary?.monthlyIncomeTotals ?? EMPTY_AMOUNT_SUMMARY;
  const snapshotUnpaidNetTotal = incomeSummary?.snapshotUnpaidNetTotal ?? 0;
  const incomeStatsTotalNet =
    incomeSummary?.incomeStatsTotalNet ?? monthlyIncomeTotals.total;
  const yearIncomeTotal = incomeSummary?.yearIncomeTotal ?? 0;
  const depositYearTotal = incomeSummary?.depositYearTotal ?? 0;
  const depositByClass = incomeSummary?.depositYearByClass ?? [];
  const bonusTotals = incomeSummary?.bonusMonthlyTotals ?? EMPTY_AMOUNT_SUMMARY;
  const otherRoleSummaries = incomeSummary?.otherRoleSummaries ?? [];
  const beforeDeductionCards = useMemo(() => {
    if (!incomeSummary) {
      return [] as { key: string; label: string; value: number }[];
    }

    const monthlyGross =
      incomeSummary.monthlyGrossTotals ?? EMPTY_AMOUNT_SUMMARY;
    const monthlyTax = incomeSummary.monthlyTaxTotals ?? EMPTY_AMOUNT_SUMMARY;
    const monthlyOperatingDeductionTotals =
      incomeSummary.monthlyOperatingDeductionTotals;
    const monthlyTotalDeductionTotals =
      incomeSummary.monthlyTotalDeductionTotals;
    const yearTaxTotal = incomeSummary.yearTaxTotal ?? 0;
    const yearOperatingDeductionTotal =
      incomeSummary.yearOperatingDeductionTotal;
    const yearTotalDeductionTotal = incomeSummary.yearTotalDeductionTotal;

    const cards: { key: string; label: string; value: number }[] = [
      {
        key: "gross-total",
        label: "Tổng tháng trước khấu trừ",
        value: monthlyGross.total,
      },
      {
        key: "gross-unpaid",
        label: "Chưa nhận trước khấu trừ",
        value: monthlyGross.unpaid,
      },
      {
        key: "gross-paid",
        label: "Đã nhận trước khấu trừ",
        value: monthlyGross.paid,
      },
      {
        key: "tax-month",
        label: "Khấu trừ thuế tháng",
        value: monthlyTax.total,
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
  }, [incomeSummary]);
  const paymentPreviewSummary = paymentPreview?.summary ?? null;
  const paymentPreviewSections = paymentPreview?.sections ?? [];
  const paymentPreviewTaxAsOfDate = paymentPreview?.taxAsOfDate ?? today;
  const depositPreviewSummary =
    depositPaymentPreview?.summary ?? EMPTY_DEPOSIT_PREVIEW_SUMMARY;
  const depositPreviewClasses = useMemo(
    () => depositPaymentPreview?.classes ?? EMPTY_DEPOSIT_PREVIEW_CLASSES,
    [depositPaymentPreview],
  );
  const depositPaymentTaxAsOfDate = depositPaymentPreview?.taxAsOfDate ?? today;
  const allDepositSessionIds = useMemo(
    () =>
      depositPreviewClasses.flatMap((group) =>
        group.sessions.map((session) => session.id),
      ),
    [depositPreviewClasses],
  );
  const selectedDepositSessionIdSet = useMemo(
    () => new Set(selectedDepositSessionIds),
    [selectedDepositSessionIds],
  );
  const allDepositSessionsSelected =
    allDepositSessionIds.length > 0 &&
    allDepositSessionIds.every((sessionId) =>
      selectedDepositSessionIdSet.has(sessionId),
    );
  const selectedDepositSummary = useMemo(() => {
    return depositPreviewClasses.reduce(
      (summary, group) => {
        group.sessions.forEach((session) => {
          if (!selectedDepositSessionIdSet.has(session.id)) {
            return;
          }

          summary.preTaxTotal += session.preTaxAmount;
          summary.taxTotal += session.taxAmount;
          summary.netTotal += session.netAmount;
          summary.itemCount += 1;
        });

        return summary;
      },
      { ...EMPTY_DEPOSIT_PREVIEW_SUMMARY },
    );
  }, [depositPreviewClasses, selectedDepositSessionIdSet]);
  const staffRoles = staff?.roles ?? [];
  const roleDefaults = taxSettings?.roleDefaults.current ?? [];
  const overrideRates = taxSettings?.staffOverrides.current ?? [];
  const roleDefaultMap = new Map<StaffRoleType, (typeof roleDefaults)[number]>(
    roleDefaults.map((item) => [item.roleType, item]),
  );
  const overrideMap = new Map<StaffRoleType, (typeof overrideRates)[number]>(
    overrideRates.map((item) => [item.roleType, item]),
  );
  const staffRolesWithTax: StaffRoleTaxItem[] = staffRoles
    .filter(
      (role): role is StaffRoleType => role in ROLE_LABELS && role !== "admin",
    )
    .map((role) => {
      const overrideRate = overrideMap.get(role);
      const roleDefault = roleDefaultMap.get(role);
      const ratePercent =
        overrideRate?.ratePercent ?? roleDefault?.ratePercent ?? 0;
      return {
        role,
        label: ROLE_LABELS[role] ?? role,
        ratePercent,
        source: overrideRate ? "override" : "default",
        overrideId: overrideRate?.id ?? null,
        effectiveFrom:
          overrideRate?.effectiveFrom ?? roleDefault?.effectiveFrom ?? null,
      };
    });
  const createStaffTaxOverrideMutation = useMutation({
    mutationFn: deductionSettingsApi.bulkUpsertStaffTaxDeductionOverrides,
  });

  const openTaxBulkEditor = () => {
    if (!canEditTaxSettings || staffRolesWithTax.length === 0) return;
    const nextDrafts: Partial<Record<StaffRoleType, TaxBulkDraftItem>> = {};
    staffRolesWithTax.forEach((item) => {
      nextDrafts[item.role] = {
        role: item.role,
        label: item.label,
        source: item.source,
        overrideId: item.overrideId,
        ratePercentInput: String(item.ratePercent),
        effectiveFrom: item.overrideId ? (item.effectiveFrom ?? today) : today,
      };
    });
    setTaxBulkDrafts(nextDrafts);
    setIsTaxEditMode(true);
  };

  const closeTaxBulkEditor = () => {
    if (createStaffTaxOverrideMutation.isPending) {
      return;
    }
    setTaxBulkDrafts({});
    setIsTaxEditMode(false);
  };

  const updateTaxDraftRate = (role: StaffRoleType, value: string) => {
    setTaxBulkDrafts((prev) => {
      const current = prev[role];
      if (!current) return prev;
      return {
        ...prev,
        [role]: {
          ...current,
          ratePercentInput: value,
        },
      };
    });
  };

  const handleSubmitTaxBulkEditor = async () => {
    if (!isTaxEditMode || !canEditTaxSettings) return;

    const draftRows = staffRolesWithTax
      .map((item) => taxBulkDrafts[item.role])
      .filter((item): item is TaxBulkDraftItem => !!item);

    const payloadItems: Array<{
      overrideId?: string;
      roleType: StaffRoleType;
      ratePercent: number;
      effectiveFrom: string;
    }> = [];

    for (const row of draftRows) {
      let ratePercent: number;
      try {
        ratePercent = parseRatePercentOrThrow(row.ratePercentInput);
      } catch (error) {
        toast.error(`${row.label}: ${(error as Error).message}`);
        return;
      }
      payloadItems.push({
        ...(row.overrideId ? { overrideId: row.overrideId } : {}),
        roleType: row.role,
        ratePercent,
        effectiveFrom: row.effectiveFrom || today,
      });
    }

    try {
      await createStaffTaxOverrideMutation.mutateAsync({
        staffId: id,
        items: payloadItems,
      });
    } catch (error) {
      toast.error(
        getApiErrorMessage(error, "Không thể lưu mức thuế cho các role."),
      );
      return;
    }

    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: ["staff", "tax-settings", id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["staff", "income-summary", id],
      }),
      queryClient.invalidateQueries({
        queryKey: ["deduction-settings", "tax"],
      }),
    ]);

    toast.success("Đã lưu cấu hình thuế cho các role.");
    setTaxBulkDrafts({});
    setIsTaxEditMode(false);
  };

  const isSavingTaxSettings = createStaffTaxOverrideMutation.isPending;

  const payAllPaymentsMutation = useMutation<
    StaffPayAllPaymentsResult,
    unknown,
    void
  >({
    mutationFn: () =>
      staffApi.payAllStaffPayments(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    onSuccess: async (result) => {
      if (result.updatedCount > 0) {
        toast.success(
          `Đã chuyển ${result.updatedCount} khoản sang trạng thái đã thanh toán.`,
        );
      } else {
        toast.success("Không có khoản nào cần cập nhật trạng thái.");
      }

      setPaymentPreviewPopupOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["staff", "payment-preview", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "detail", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "list"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["sessions", "staff", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["bonus", "list", "staff", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["lesson", "output-stats", "staff", id],
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(error, "Không thể thanh toán tất cả các khoản."),
      );
    },
  });
  const payDepositSessionsMutation = useMutation<
    StaffPayDepositSessionsResult,
    unknown,
    string[]
  >({
    mutationFn: (sessionIds) =>
      staffApi.payStaffDepositSessions(id, {
        sessionIds,
      }),
    onSuccess: async (result) => {
      if (result.updatedCount > 0) {
        toast.success(
          `Đã thanh toán ${result.updatedCount} buổi cọc không áp vận hành, không áp thuế.`,
        );
      } else {
        toast.success("Không có buổi cọc nào cần cập nhật trạng thái.");
      }

      setSelectedDepositSessionIds([]);
      setDepositPopupOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["staff", "deposit-payment-preview", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "detail", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "list"],
        }),
        queryClient.invalidateQueries({
          queryKey: ["sessions", "staff", id],
        }),
      ]);
    },
    onError: (error) => {
      toast.error(
        getApiErrorMessage(error, "Không thể thanh toán các buổi cọc đã chọn."),
      );
    },
  });

  const closePaymentPreviewPopup = () => {
    if (payAllPaymentsMutation.isPending) return;
    setPaymentPreviewPopupOpen(false);
  };
  const closeDepositPopup = () => {
    if (payDepositSessionsMutation.isPending) return;
    setSelectedDepositSessionIds([]);
    setDepositPopupOpen(false);
  };
  const toggleDepositSession = (sessionId: string) => {
    setSelectedDepositSessionIds((prev) => {
      if (prev.includes(sessionId)) {
        return prev.filter((id) => id !== sessionId);
      }

      return [...prev, sessionId];
    });
  };
  const toggleAllDepositSessions = () => {
    setSelectedDepositSessionIds(
      allDepositSessionsSelected ? [] : allDepositSessionIds,
    );
  };
  const toggleDepositClassSessions = (sessionIds: string[]) => {
    setSelectedDepositSessionIds((prev) => {
      const next = new Set(prev);
      const allSelected = sessionIds.every((sessionId) => next.has(sessionId));

      sessionIds.forEach((sessionId) => {
        if (allSelected) {
          next.delete(sessionId);
          return;
        }

        next.add(sessionId);
      });

      return Array.from(next);
    });
  };
  const handlePaySelectedDepositSessions = () => {
    if (
      payDepositSessionsMutation.isPending ||
      selectedDepositSummary.itemCount === 0
    ) {
      return;
    }

    payDepositSessionsMutation.mutate(selectedDepositSessionIds);
  };

  const deleteBonusMutation = useMutation({
    mutationFn: (bonusId: string) => bonusApi.deleteBonusById(bonusId),
    onSuccess: async () => {
      toast.success("Đã xóa thưởng.");
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["bonus", "list", "staff", id, selectedMonth],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", id],
        }),
      ]);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Không thể xóa thưởng.";
      toast.error(msg);
    },
  });

  const createBonusMutation = useMutation({
    mutationFn: bonusApi.createBonus,
    onSuccess: async () => {
      toast.success("Đã thêm thưởng.");
      setAddBonusPopupOpen(false);
      setBonusForm(DEFAULT_BONUS_FORM);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["bonus", "list", "staff", id, selectedMonth],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "detail", id],
        }),
      ]);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Không thể thêm thưởng.";
      toast.error(msg);
    },
  });

  const updateBonusMutation = useMutation({
    mutationFn: bonusApi.updateBonus,
    onSuccess: async () => {
      toast.success("Đã cập nhật thưởng.");
      setAddBonusPopupOpen(false);
      setBonusFormMode("create");
      setEditingBonusId(null);
      setBonusForm(DEFAULT_BONUS_FORM);
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["bonus", "list", "staff", id, selectedMonth],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "income-summary", id],
        }),
        queryClient.invalidateQueries({
          queryKey: ["staff", "detail", id],
        }),
      ]);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Không thể cập nhật thưởng.";
      toast.error(msg);
    },
  });

  const openAddBonusPopup = () => {
    if (!canCreateBonus) return;
    setBonusFormMode("create");
    setEditingBonusId(null);
    setBonusForm(DEFAULT_BONUS_FORM);
    setWorkTypeMenuOpen(false);
    setWorkTypeSearch("");
    setStatusMenuOpen(false);
    setAddBonusPopupOpen(true);
  };

  const openEditBonusPopup = (bonusId: string) => {
    const target = bonusRecords.find((item) => item.id === bonusId);
    if (!target) {
      toast.error("Không tìm thấy thưởng để chỉnh sửa.");
      return;
    }

    const isExistingOption = workTypeOptions.includes(target.workType);
    setBonusFormMode("edit");
    setEditingBonusId(target.id);
    setBonusForm({
      workTypeOption: isExistingOption
        ? target.workType
        : DEFAULT_ROLE_WORK_TYPE,
      amount: String(target.amount),
      status: target.status,
      note: target.note,
    });
    setWorkTypeMenuOpen(false);
    setWorkTypeSearch("");
    setStatusMenuOpen(false);
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
    setStatusMenuOpen(false);
  };

  const resolveWorkType = () => {
    return bonusForm.workTypeOption.trim();
  };

  useEffect(() => {
    if (!addBonusPopupOpen || (!workTypeMenuOpen && !statusMenuOpen)) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (!workTypeMenuRef.current?.contains(event.target as Node)) {
        setWorkTypeMenuOpen(false);
      }
      if (!statusMenuRef.current?.contains(event.target as Node)) {
        setStatusMenuOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setWorkTypeMenuOpen(false);
        setStatusMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [addBonusPopupOpen, workTypeMenuOpen, statusMenuOpen]);

  const handleSubmitBonus = async () => {
    const workType = resolveWorkType();
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
      if (!canCreateBonus) {
        toast.error("Bạn không có quyền thêm thưởng mới.");
        return;
      }

      try {
        await createBonusMutation.mutateAsync({
          staffId: id,
          workType,
          month: selectedMonth,
          amount: Math.round(parsedAmount),
          status: bonusForm.status,
          note: bonusForm.note.trim() || undefined,
        });
      } catch {
        // toast lỗi đã xử lý trong onError
      }
      return;
    }

    if (!editingBonusId) {
      toast.error("Không tìm thấy thưởng để chỉnh sửa.");
      return;
    }

    try {
      await updateBonusMutation.mutateAsync({
        id: editingBonusId,
        workType,
        month: selectedMonth,
        amount: Math.round(parsedAmount),
        status: bonusForm.status,
        note: bonusForm.note.trim() || undefined,
      });
    } catch {
      // toast lỗi đã xử lý trong onError
    }
  };

  if (isLoading) {
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

  if (!id || isError || !staff) {
    const message = !id
      ? "Thiếu mã nhân sự."
      : "Không tìm thấy hoặc không tải được thông tin nhân sự.";

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
          <span className="hidden sm:inline">Quay lại danh sách nhân sự</span>
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

  const staffDisplayName = staff.fullName?.trim() || "Nhân sự";
  const staffAvatarFallback = (staffDisplayName || staff.user?.email || "?")
    .charAt(0)
    .toUpperCase();
  const staffAvatarUrl = pickAvatarUrl(
    staff.user?.avatarUrl,
    staff.id === ownStaffId ? fullProfile?.avatarUrl : null,
    staff.user?.id === authUser.id ? authUser.avatarUrl : null,
  );

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
        <span className="hidden sm:inline">Quay lại danh sách nhân sự</span>
      </button>

      <header className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <div className="relative flex shrink-0">
            <UserAvatar
              src={staffAvatarUrl}
              fallback={staffAvatarFallback}
              alt={`Avatar ${staffDisplayName}`}
              className="size-14 bg-bg-tertiary text-xl font-semibold text-text-primary ring-2 ring-border-default sm:size-16 sm:text-2xl"
            />
            <span
              className={`absolute bottom-0 right-0 block size-3 rounded-full border-2 border-bg-surface ${staff.status === "active" ? "bg-success" : "bg-error"}`}
              title={STATUS_LABELS[staff.status]}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h1 className="min-w-0 truncate text-lg font-semibold text-text-primary sm:text-xl">
                {staffDisplayName}
              </h1>
              {!viewingOwnStaffRecordOnStaffShell ? (
                <button
                  type="button"
                  onClick={() => setEditPopupOpen(true)}
                  className="flex size-9 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted transition hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:size-8"
                  aria-label="Chỉnh sửa thông tin nhân sự"
                  title="Chỉnh sửa thông tin nhân sự"
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
                      d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                    />
                  </svg>
                </button>
              ) : null}
            </div>
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
        {canPayAll ? (
          <div className="flex shrink-0 items-start sm:justify-end">
            <button
              type="button"
              onClick={() => setPaymentPreviewPopupOpen(true)}
              className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse shadow-sm transition hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
            >
              Thanh toán
            </button>
          </div>
        ) : null}
      </header>

      {!viewingOwnStaffRecordOnStaffShell ? (
        <EditStaffPopup
          key={`${staff.id}:${editPopupOpen ? "open" : "closed"}`}
          open={editPopupOpen}
          onClose={() => setEditPopupOpen(false)}
          staff={staff}
          onSuccess={handleStaffEditSuccess}
        />
      ) : null}

      <div className="flex flex-col gap-4">
        <StaffIdentityOverview
          birthDateLabel={formatDate(staff.birthDate)}
          province={province}
          ethnicity={staff.ethnicity}
          gender={staff.gender}
          currentAddress={staff.currentAddress}
          university={staff.university}
          specialization={staff.specialization}
          personalAchievementLink={staff.personalAchievementLink}
          googleMeetLink={staff.googleMeetLink}
          qrLink={qrLink ?? resolvedQrLink}
          onQrEdit={() => setQrPopupOpen(true)}
          allowQrEdit={!viewingOwnStaffRecordOnStaffShell}
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
            <div className="shrink-0 sm:pt-0.5">
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
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Tổng nhận
              </p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-primary">
                {formatCurrency(incomeStatsTotalNet)}
              </p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Chưa nhận
              </p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-error">
                {formatCurrency(snapshotUnpaidNetTotal)}
              </p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Đã nhận
              </p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-success">
                {formatCurrency(monthlyIncomeTotals.paid)}
              </p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Tổng năm
              </p>
              <p className="mt-1 tabular-nums text-lg font-semibold text-warning">
                {formatCurrency(yearIncomeTotal)}
              </p>
            </article>
            <article className="rounded-xl border border-border-default bg-bg-secondary/45 px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-text-muted">
                Ghi cọc
              </p>
              {depositYearTotal > 0 ? (
                <button
                  type="button"
                  onClick={() => setDepositPopupOpen(true)}
                  className="mt-1 tabular-nums text-lg font-semibold text-warning underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                  aria-label={
                    canPayAll
                      ? "Xem và thanh toán danh sách buổi cọc theo lớp"
                      : "Xem danh sách buổi cọc theo lớp"
                  }
                >
                  {formatCurrency(depositYearTotal)}
                </button>
              ) : (
                <p className="mt-1 tabular-nums text-lg font-semibold text-text-muted">
                  0
                </p>
              )}
            </article>
          </div>
          {canViewBeforeDeduction && beforeDeductionCards.length > 0 ? (
            <div className="mt-3 rounded-xl border border-border-default bg-bg-tertiary/70 px-4 py-3">
              <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                Trước khấu trừ
              </p>
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
                {saveClassOperatingCardMutation.isPending ? (
                  <div
                    className="space-y-4"
                    aria-busy="true"
                    aria-live="polite"
                  >
                    <p className="text-xs text-text-muted">
                      Đang lưu thay đổi…
                    </p>
                    <div className="space-y-3 md:hidden">
                      {Array.from({
                        length: Math.min(3, classMonthlySummaries.length),
                      }).map((_, i) => (
                        <div
                          key={i}
                          className="h-28 animate-pulse rounded-lg bg-bg-secondary"
                        />
                      ))}
                    </div>
                    <div className="hidden md:block">
                      <div className="h-48 animate-pulse rounded-lg bg-bg-secondary" />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="space-y-3 md:hidden">
                      {classMonthlySummaries.map((item) => {
                        const hasClassTeacherRow = staff?.classTeachers?.some(
                          (ct) => ct.class?.id === item.classId,
                        );
                        const isRetiredTeaching =
                          item.isCurrentTeacherAssignment === false;
                        const opValue = operatingPercentByClassId.get(
                          item.classId,
                        );
                        return (
                          <div
                            key={item.classId}
                            className={`rounded-lg border border-border-default bg-bg-secondary px-4 py-3 ${
                              isRetiredTeaching ? "opacity-60 cursor-not-allowed" : ""
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() =>
                                push(
                                  buildAdminLikePath(
                                    routeBase,
                                    `classes/${encodeURIComponent(item.classId)}`,
                                  ),
                                )
                              }
                              className="text-left font-medium text-text-primary underline-offset-4 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            >
                              {item.className}
                            </button>
                            {isRetiredTeaching ? (
                              <RetiredTeachingLabel />
                            ) : null}
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
                            {showClassOperatingColumn ? (
                              <div
                                className="mt-3 border-t border-border-default pt-3"
                                role="presentation"
                                onClick={(e) => e.stopPropagation()}
                                onKeyDown={(e) => e.stopPropagation()}
                              >
                                <p className="text-xs font-medium uppercase tracking-wide text-text-muted">
                                  KH vận hành (%)
                                </p>
                                {canEditClassOperatingDeduction &&
                                hasClassTeacherRow ? (
                                  <div className="mt-1 flex min-w-0 max-w-full items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0}
                                      max={100}
                                      step="0.01"
                                      disabled={
                                        saveClassOperatingCardMutation.isPending
                                      }
                                      value={
                                        classOperatingDraft[item.classId] ??
                                        (opValue !== undefined
                                          ? String(opValue.toFixed(2))
                                          : "")
                                      }
                                      onChange={(e) =>
                                        setClassOperatingDraft((p) => ({
                                          ...p,
                                          [item.classId]: e.target.value,
                                        }))
                                      }
                                      className="h-9 min-w-0 flex-1 rounded-md border border-border-default bg-bg-surface px-2 text-right tabular-nums text-sm font-semibold text-text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:max-w-28 sm:flex-none"
                                      aria-label={`Khấu trừ vận hành % cho lớp ${item.className}`}
                                    />
                                    <span
                                      className="shrink-0 text-sm font-semibold text-text-muted"
                                      aria-hidden
                                    >
                                      %
                                    </span>
                                  </div>
                                ) : (
                                  <p className="mt-1 tabular-nums text-sm font-semibold text-text-primary">
                                    {hasClassTeacherRow && opValue !== undefined
                                      ? formatRatePercent(opValue)
                                      : "—"}
                                  </p>
                                )}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                    <div className="hidden overflow-x-auto md:block">
                      <table
                        className={`w-full border-collapse text-left text-sm ${showClassOperatingColumn ? "min-w-[680px]" : "min-w-[480px]"}`}
                      >
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
                            {showClassOperatingColumn ? (
                              <th
                                scope="col"
                                className="px-4 py-3 font-medium text-text-primary tabular-nums"
                              >
                                KH vận hành
                              </th>
                            ) : null}
                          </tr>
                        </thead>
                        <tbody>
                          {classMonthlySummaries.map((item) => {
                            const hasClassTeacherRow =
                              staff?.classTeachers?.some(
                                (ct) => ct.class?.id === item.classId,
                              );
                            const isRetiredTeaching =
                              item.isCurrentTeacherAssignment === false;
                            const opValue = operatingPercentByClassId.get(
                              item.classId,
                            );
                            return (
                              <tr
                                key={item.classId}
                                role="button"
                                tabIndex={0}
                                onClick={() =>
                                  push(
                                    buildAdminLikePath(
                                      routeBase,
                                      `classes/${encodeURIComponent(item.classId)}`,
                                    ),
                                  )
                                }
                                onKeyDown={(e) => {
                                  if (e.key === "Enter" || e.key === " ") {
                                    e.preventDefault();
                                    push(
                                      buildAdminLikePath(
                                        routeBase,
                                        `classes/${encodeURIComponent(item.classId)}`,
                                      ),
                                    );
                                  }
                                }}
                                className={`border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus ${
                                  isRetiredTeaching ? "opacity-60 cursor-not-allowed" : "cursor-pointer"
                                }`}
                              >
                                <td className="px-4 py-3 text-text-primary">
                                  <div className="flex flex-col items-start">
                                    <span>{item.className}</span>
                                    {isRetiredTeaching ? (
                                      <RetiredTeachingLabel />
                                    ) : null}
                                  </div>
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
                                {showClassOperatingColumn ? (
                                  <td
                                    className="px-4 py-3 tabular-nums text-text-primary"
                                    onClick={(e) => e.stopPropagation()}
                                    onKeyDown={(e) => e.stopPropagation()}
                                  >
                                    {canEditClassOperatingDeduction &&
                                    hasClassTeacherRow ? (
                                      <div className="flex items-center justify-end gap-1.5">
                                        <input
                                          type="number"
                                          min={0}
                                          max={100}
                                          step="0.01"
                                          disabled={
                                            saveClassOperatingCardMutation.isPending
                                          }
                                          value={
                                            classOperatingDraft[item.classId] ??
                                            (opValue !== undefined
                                              ? String(opValue.toFixed(2))
                                              : "")
                                          }
                                          onChange={(e) =>
                                            setClassOperatingDraft((p) => ({
                                              ...p,
                                              [item.classId]: e.target.value,
                                            }))
                                          }
                                          className="h-9 w-24 shrink-0 rounded-md border border-border-default bg-bg-surface px-2 text-right text-sm font-semibold focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                          aria-label={`Khấu trừ vận hành % cho lớp ${item.className}`}
                                        />
                                        <span
                                          className="shrink-0 text-sm font-semibold text-text-muted"
                                          aria-hidden
                                        >
                                          %
                                        </span>
                                      </div>
                                    ) : (
                                      <span className="font-semibold">
                                        {hasClassTeacherRow &&
                                        opValue !== undefined
                                          ? formatRatePercent(opValue)
                                          : "—"}
                                      </span>
                                    )}
                                  </td>
                                ) : null}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
                {showClassOperatingColumn &&
                canEditClassOperatingDeduction &&
                isClassOperatingDirty ? (
                  <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-border-default pt-4">
                    <button
                      type="button"
                      onClick={() => void handleClassOperatingDiscard()}
                      disabled={saveClassOperatingCardMutation.isPending}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      Huỷ bỏ
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        saveClassOperatingCardMutation.mutate(
                          classOperatingDraft,
                        )
                      }
                      disabled={saveClassOperatingCardMutation.isPending}
                      className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saveClassOperatingCardMutation.isPending
                        ? "Đang lưu…"
                        : "Lưu"}
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </StaffCard>
          <div className="space-y-2">
            <StaffBonusCard
              bonuses={bonuses}
              totalMonth={bonusTotals.total}
              paid={bonusTotals.paid}
              unpaid={bonusTotals.unpaid}
              onAddBonus={canCreateBonus ? openAddBonusPopup : undefined}
              onEditBonus={(bonus) => openEditBonusPopup(bonus.id)}
              onDeleteBonus={
                canDeleteBonus
                  ? (bid) => deleteBonusMutation.mutate(bid)
                  : undefined
              }
              canEdit
              allowCreate={canCreateBonus}
              allowDelete={canDeleteBonus}
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
                    const detailHref = buildStaffRoleDetailHref(
                      routeBase,
                      item.role,
                      id,
                    );
                    const isInteractive = detailHref !== null;
                    return (
                      <div
                        key={item.role}
                        role="button"
                        tabIndex={isInteractive ? 0 : -1}
                        aria-disabled={!isInteractive}
                        onClick={
                          isInteractive ? () => push(detailHref) : undefined
                        }
                        onKeyDown={
                          isInteractive
                            ? (e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  push(detailHref);
                                }
                              }
                            : undefined
                        }
                        className={`rounded-lg border border-border-default bg-bg-secondary px-4 py-3 ${isInteractive ? "cursor-pointer transition-colors hover:bg-bg-elevated focus:outline-none focus:ring-2 focus:ring-primary" : ""}`}
                      >
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
                        const detailHref = buildStaffRoleDetailHref(
                          routeBase,
                          item.role,
                          id,
                        );
                        const isInteractive = detailHref !== null;
                        return (
                          <tr
                            key={item.role}
                            role={isInteractive ? "button" : undefined}
                            tabIndex={isInteractive ? 0 : undefined}
                            onClick={
                              isInteractive ? () => push(detailHref) : undefined
                            }
                            onKeyDown={
                              isInteractive
                                ? (e) => {
                                    if (e.key === "Enter" || e.key === " ") {
                                      e.preventDefault();
                                      push(detailHref);
                                    }
                                  }
                                : undefined
                            }
                            className={`border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary ${isInteractive ? "cursor-pointer" : ""}`}
                          >
                            <td className="px-4 py-3 text-text-primary">
                              {item.label}
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
            );
          })()}
        </StaffCard>
        <StaffCard title="Thống kê thuế theo role">
          {canEditTaxSettings ? (
            <div className="mb-4 flex justify-end">
              {isTaxEditMode ? (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={closeTaxBulkEditor}
                    disabled={isSavingTaxSettings}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmitTaxBulkEditor}
                    disabled={isSavingTaxSettings}
                    className="inline-flex min-h-10 items-center justify-center rounded-lg bg-primary px-3 py-2 text-sm font-medium text-text-inverse transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingTaxSettings ? "Đang lưu…" : "Lưu thay đổi"}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={openTaxBulkEditor}
                  className="inline-flex min-h-10 items-center justify-center rounded-lg border border-border-default px-3 py-2 text-sm text-text-secondary transition-colors hover:bg-bg-secondary"
                >
                  Chỉnh sửa
                </button>
              )}
            </div>
          ) : null}
          {isTaxSettingsLoading && !taxSettings ? (
            <p className="text-text-muted" aria-live="polite">
              Đang tải cấu hình khấu trừ thuế…
            </p>
          ) : null}
          {isTaxSettingsError ? (
            <p className="text-error" role="alert">
              Không tải được cấu hình khấu trừ thuế theo role.
            </p>
          ) : null}
          {!isTaxSettingsLoading && !isTaxSettingsError ? (
            staffRolesWithTax.length > 0 ? (
              <>
                <div className="space-y-3 md:hidden">
                  {staffRolesWithTax.map((item) => (
                    <article
                      key={item.role}
                      className="rounded-lg border border-border-default bg-bg-secondary px-4 py-3"
                    >
                      <p className="font-medium text-text-primary">
                        {item.label}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
                        <span>
                          Thuế hiện hành:{" "}
                          {isTaxEditMode ? (
                            <input
                              type="number"
                              min={0}
                              max={100}
                              step="0.01"
                              value={
                                taxBulkDrafts[item.role]?.ratePercentInput ??
                                String(item.ratePercent)
                              }
                              onChange={(event) =>
                                updateTaxDraftRate(
                                  item.role,
                                  event.target.value,
                                )
                              }
                              className="h-9 w-28 rounded-md border border-border-default bg-bg-surface px-2 text-right font-semibold text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                            />
                          ) : (
                            <span className="font-semibold text-primary">
                              {item.ratePercent.toFixed(2)}%
                            </span>
                          )}
                        </span>
                        <span>
                          Hiệu lực:{" "}
                          <span className="font-medium text-text-primary">
                            {item.effectiveFrom ?? "Chưa cấu hình"}
                          </span>
                        </span>
                        <span className="inline-flex rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-muted">
                          {item.source === "override"
                            ? "Override theo nhân sự"
                            : "Theo mặc định role"}
                        </span>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="hidden overflow-x-auto md:block">
                  <table className="w-full min-w-[560px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-border-default bg-bg-secondary">
                        <th className="px-4 py-3 font-medium text-text-primary">
                          Role
                        </th>
                        <th className="px-4 py-3 font-medium text-text-primary tabular-nums">
                          Thuế hiện hành
                        </th>
                        <th className="px-4 py-3 font-medium text-text-primary">
                          Hiệu lực
                        </th>
                        <th className="px-4 py-3 font-medium text-text-primary">
                          Nguồn cấu hình
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffRolesWithTax.map((item) => (
                        <tr
                          key={item.role}
                          className="border-b border-border-default bg-bg-surface"
                        >
                          <td className="px-4 py-3 text-text-primary">
                            {item.label}
                          </td>
                          <td className="px-4 py-3 tabular-nums font-semibold text-primary">
                            {isTaxEditMode ? (
                              <input
                                type="number"
                                min={0}
                                max={100}
                                step="0.01"
                                value={
                                  taxBulkDrafts[item.role]?.ratePercentInput ??
                                  String(item.ratePercent)
                                }
                                onChange={(event) =>
                                  updateTaxDraftRate(
                                    item.role,
                                    event.target.value,
                                  )
                                }
                                className="h-9 w-28 rounded-md border border-border-default bg-bg-surface px-2 text-right font-semibold text-primary focus:border-border-focus focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              />
                            ) : (
                              `${item.ratePercent.toFixed(2)}%`
                            )}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {item.effectiveFrom ?? "Chưa cấu hình"}
                          </td>
                          <td className="px-4 py-3 text-text-secondary">
                            {item.source === "override"
                              ? "Override theo nhân sự"
                              : "Theo mặc định role"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-text-muted">
                  Cấu hình thuế được lấy theo tháng đang xem (
                  {selectedMonthLabel}) với mốc tra cứu hiện tại là {asOfDate}{" "}
                  (cuối kỳ, riêng tháng hiện tại dùng ngày hôm nay). Ở chế độ
                  chỉnh sửa, bạn có thể cập nhật nhiều role cùng lúc; role chưa
                  có override riêng sẽ được tạo override cho nhân sự khi lưu.
                </p>
              </>
            ) : (
              <p className="text-text-muted">
                Nhân sự hiện chưa có role hỗ trợ khấu trừ thuế.
              </p>
            )
          ) : null}
        </StaffCard>

        <StaffCard title="Lịch sử buổi học">
          <div className="min-w-0 overflow-x-auto">
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
                enableBulkPaymentStatusEdit
                onSessionUpdated={handleSessionUpdated}
                getTeachersForClass={getTeachersForClass}
                getClassStudents={getClassStudents}
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

      {!viewingOwnStaffRecordOnStaffShell ? (
        <QrLinkPopup
          open={qrPopupOpen}
          onClose={() => setQrPopupOpen(false)}
          currentLink={qrLink ?? resolvedQrLink ?? ""}
          onSave={async (link) => {
            await updateQrLinkMutation.mutateAsync(link);
          }}
        />
      ) : null}

      {paymentPreviewPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[1px]"
            aria-hidden
            onClick={closePaymentPreviewPopup}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="staff-payment-preview-title"
            className="fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[calc(100%-1rem)] max-w-6xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-2xl border border-border-default bg-bg-surface shadow-2xl"
          >
            <div className="border-b border-border-default bg-bg-secondary/65 px-4 py-4 sm:px-6">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-text-muted">
                    Thanh Toán Tất Cả
                  </p>
                  <h2
                    id="staff-payment-preview-title"
                    className="mt-1 text-lg font-semibold text-text-primary sm:text-xl"
                  >
                    {staff.fullName?.trim() || "Nhân sự"} · Thanh toán hàng loạt
                  </h2>
                  <p className="mt-1 text-sm text-text-muted">
                    <span className="font-medium text-text-secondary">
                      Buổi dạy (GV):
                    </span>{" "}
                    tất cả buổi chưa thanh toán, mọi tháng.{" "}
                    <span className="font-medium text-text-secondary">
                      Các khoản khác
                    </span>{" "}
                    (thưởng, trợ cấp, bài giáo án, hoa hồng CSKH, chia trợ lí…)
                    theo {selectedMonthLabel}. Thuế trong popup theo mức hiện
                    hành tại {paymentPreviewTaxAsOfDate}. Buổi ghi cọc không nằm
                    trong đợt này.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closePaymentPreviewPopup}
                  disabled={payAllPaymentsMutation.isPending}
                  className="inline-flex size-10 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted transition hover:bg-bg-tertiary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-60"
                  aria-label="Đóng popup thanh toán"
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
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 sm:px-6 sm:py-5">
              {isPaymentPreviewLoading ? (
                <div className="space-y-4" aria-live="polite">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    {Array.from({ length: 5 }).map((_, index) => (
                      <div
                        key={`payment-preview-skeleton-${index}`}
                        className="h-24 animate-pulse rounded-xl border border-border-default bg-bg-secondary/55"
                      />
                    ))}
                  </div>
                  <div className="space-y-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                      <div
                        key={`payment-preview-section-${index}`}
                        className="h-40 animate-pulse rounded-2xl border border-border-default bg-bg-secondary/45"
                      />
                    ))}
                  </div>
                </div>
              ) : isPaymentPreviewError ? (
                <div
                  className="rounded-xl border border-error/30 bg-error/10 px-4 py-5 text-sm text-error"
                  role="alert"
                >
                  Không tải được danh sách khoản cần thanh toán.
                </div>
              ) : paymentPreviewSummary?.itemCount ? (
                <div className="space-y-5">
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                    <article className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Số Khoản
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-text-primary">
                        {paymentPreviewSummary.itemCount}
                      </p>
                    </article>
                    <article className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Trước Thuế
                      </p>
                      <p className="mt-2 text-xl font-semibold text-primary">
                        {formatCurrency(paymentPreviewSummary.grossTotal)}
                      </p>
                    </article>
                    <article className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Vận Hành
                      </p>
                      <p className="mt-2 text-xl font-semibold text-warning">
                        {formatCurrency(paymentPreviewSummary.operatingTotal)}
                      </p>
                    </article>
                    <article className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Thuế
                      </p>
                      <p className="mt-2 text-xl font-semibold text-error">
                        {formatCurrency(paymentPreviewSummary.taxTotal)}
                      </p>
                    </article>
                    <article className="rounded-xl border border-border-default bg-primary/8 px-4 py-3">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                        Sau Thuế
                      </p>
                      <p className="mt-2 text-xl font-semibold text-success">
                        {formatCurrency(paymentPreviewSummary.netTotal)}
                      </p>
                    </article>
                  </div>

                  <div className="space-y-4">
                    {paymentPreviewSections.map((section) => {
                      const showSectionOperating =
                        shouldShowPaymentOperatingColumn(section.role);
                      const showSectionTax = shouldShowPaymentTaxColumn(
                        section.role,
                      );
                      const showSectionMeta =
                        !!section.role ||
                        showSectionOperating ||
                        showSectionTax;

                      return (
                        <section
                          key={section.role ?? "bonus"}
                          className="rounded-2xl border border-border-default bg-bg-primary/70"
                        >
                          <div className="flex flex-col gap-3 border-b border-border-default px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
                            <div className="min-w-0">
                              <h3 className="text-base font-semibold text-text-primary">
                                {section.label}
                              </h3>
                              <p className="mt-1 text-sm text-text-muted">
                                {section.itemCount} khoản · Trước thuế{" "}
                                {formatCurrency(section.grossTotal)} · Sau thuế{" "}
                                {formatCurrency(section.netTotal)}
                              </p>
                            </div>
                            {showSectionMeta ? (
                              <div className="flex flex-wrap gap-2 text-xs font-medium">
                                {section.role ? (
                                  <span className="rounded-full bg-bg-secondary px-3 py-1 text-text-secondary">
                                    Thuế hiện hành{" "}
                                    {formatRatePercent(
                                      section.sources[0]?.items[0]
                                        ?.taxRatePercent ?? 0,
                                    )}
                                  </span>
                                ) : null}
                                {showSectionOperating ? (
                                  <span className="rounded-full bg-bg-secondary px-3 py-1 text-text-secondary">
                                    Vận hành{" "}
                                    {formatCurrency(section.operatingTotal)}
                                  </span>
                                ) : null}
                                {showSectionTax ? (
                                  <span className="rounded-full bg-error/10 px-3 py-1 text-error">
                                    Thuế {formatCurrency(section.taxTotal)}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>

                          <div className="space-y-4 px-4 py-4 sm:px-5">
                            {section.sources.map((source) => {
                              const showSourceOperating =
                                shouldShowPaymentOperatingColumn(section.role);
                              const showSourceTax = shouldShowPaymentTaxColumn(
                                section.role,
                              );
                              const showSourceMeta =
                                showSourceOperating || showSourceTax;

                              return (
                                <div
                                  key={`${section.role ?? "bonus"}:${source.sourceType}`}
                                  className="rounded-xl border border-border-default bg-bg-secondary/35"
                                >
                                  <div className="flex flex-col gap-2 border-b border-border-default px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div className="min-w-0">
                                      <h4 className="text-sm font-semibold text-text-primary">
                                        {source.sourceLabel}
                                      </h4>
                                      <p className="text-xs text-text-muted">
                                        {source.itemCount} khoản · Trước thuế{" "}
                                        {formatCurrency(source.grossTotal)} ·
                                        Sau thuế{" "}
                                        {formatCurrency(source.netTotal)}
                                      </p>
                                    </div>
                                    {showSourceMeta ? (
                                      <div className="flex flex-wrap gap-2 text-xs font-medium">
                                        {showSourceOperating ? (
                                          <span className="rounded-full bg-warning/10 px-3 py-1 text-warning">
                                            Vận hành{" "}
                                            {formatCurrency(
                                              source.operatingTotal,
                                            )}
                                          </span>
                                        ) : null}
                                        {showSourceTax ? (
                                          <span className="rounded-full bg-error/10 px-3 py-1 text-error">
                                            Thuế{" "}
                                            {formatCurrency(source.taxTotal)}
                                          </span>
                                        ) : null}
                                      </div>
                                    ) : null}
                                  </div>

                                  <div className="space-y-3 p-3 md:hidden">
                                    {source.items.map((item) => (
                                      <article
                                        key={item.id}
                                        className="rounded-xl border border-border-default bg-bg-surface px-4 py-3"
                                      >
                                        <div className="flex items-start justify-between gap-3">
                                          <div className="min-w-0">
                                            <p className="font-medium text-text-primary">
                                              {item.label}
                                            </p>
                                            {item.secondaryLabel ? (
                                              <p className="mt-1 text-sm text-text-secondary">
                                                {item.secondaryLabel}
                                              </p>
                                            ) : null}
                                            {item.date ? (
                                              <p className="mt-1 text-xs text-text-muted">
                                                {formatCompactDate(item.date)}
                                              </p>
                                            ) : null}
                                          </div>
                                          <span
                                            className={`inline-flex shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPaymentStatusBadgeClass(
                                              item.currentStatus,
                                            )}`}
                                          >
                                            {getPaymentStatusLabel(
                                              item.currentStatus,
                                            )}
                                          </span>
                                        </div>
                                        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                                          <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
                                            <p className="text-[11px] uppercase tracking-wide text-text-muted">
                                              Trước thuế
                                            </p>
                                            <p className="mt-1 font-semibold text-primary">
                                              {formatCurrency(item.grossAmount)}
                                            </p>
                                          </div>
                                          <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
                                            <p className="text-[11px] uppercase tracking-wide text-text-muted">
                                              Sau thuế
                                            </p>
                                            <p className="mt-1 font-semibold text-success">
                                              {formatCurrency(item.netAmount)}
                                            </p>
                                          </div>
                                          {showSourceOperating ? (
                                            <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
                                              <p className="text-[11px] uppercase tracking-wide text-text-muted">
                                                Vận hành
                                              </p>
                                              <p className="mt-1 font-semibold text-warning">
                                                {formatCurrency(
                                                  item.operatingAmount,
                                                )}
                                              </p>
                                            </div>
                                          ) : null}
                                          {showSourceTax ? (
                                            <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
                                              <p className="text-[11px] uppercase tracking-wide text-text-muted">
                                                Thuế
                                              </p>
                                              <p className="mt-1 font-semibold text-error">
                                                {formatCurrency(item.taxAmount)}
                                              </p>
                                            </div>
                                          ) : null}
                                        </div>
                                      </article>
                                    ))}
                                  </div>

                                  <div className="hidden overflow-x-auto md:block">
                                    <table className="w-full min-w-[760px] border-collapse text-left text-sm">
                                      <thead>
                                        <tr className="border-b border-border-default bg-bg-secondary/55">
                                          <th className="px-4 py-3 font-medium text-text-primary">
                                            Khoản
                                          </th>
                                          <th className="px-4 py-3 font-medium text-text-primary">
                                            Ghi chú
                                          </th>
                                          <th className="px-4 py-3 font-medium text-text-primary">
                                            Ngày
                                          </th>
                                          <th className="px-4 py-3 text-center font-medium text-text-primary">
                                            Trạng thái
                                          </th>
                                          <th className="px-4 py-3 font-medium text-text-primary tabular-nums">
                                            Trước thuế
                                          </th>
                                          {showSourceOperating ? (
                                            <th className="px-4 py-3 font-medium text-text-primary tabular-nums">
                                              Vận hành
                                            </th>
                                          ) : null}
                                          {showSourceTax ? (
                                            <th className="px-4 py-3 font-medium text-text-primary tabular-nums">
                                              Thuế
                                            </th>
                                          ) : null}
                                          <th className="px-4 py-3 font-medium text-text-primary tabular-nums">
                                            Sau thuế
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {source.items.map((item) => (
                                          <tr
                                            key={item.id}
                                            className="border-b border-border-default bg-bg-surface"
                                          >
                                            <td className="px-4 py-3 text-text-primary">
                                              <div className="font-medium">
                                                {item.label}
                                              </div>
                                            </td>
                                            <td className="px-4 py-3 text-text-secondary">
                                              {item.secondaryLabel || "—"}
                                            </td>
                                            <td className="px-4 py-3 text-text-secondary">
                                              {formatCompactDate(item.date)}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                              <span
                                                className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPaymentStatusBadgeClass(
                                                  item.currentStatus,
                                                )}`}
                                              >
                                                {getPaymentStatusLabel(
                                                  item.currentStatus,
                                                )}
                                              </span>
                                            </td>
                                            <td className="px-4 py-3 tabular-nums font-semibold text-primary">
                                              {formatCurrency(item.grossAmount)}
                                            </td>
                                            {showSourceOperating ? (
                                              <td className="px-4 py-3 tabular-nums font-semibold text-warning">
                                                {formatCurrency(
                                                  item.operatingAmount,
                                                )}
                                              </td>
                                            ) : null}
                                            {showSourceTax ? (
                                              <td className="px-4 py-3 tabular-nums font-semibold text-error">
                                                {formatCurrency(item.taxAmount)}
                                              </td>
                                            ) : null}
                                            <td className="px-4 py-3 tabular-nums font-semibold text-success">
                                              {formatCurrency(item.netAmount)}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-border-default bg-bg-secondary/40 px-4 py-6 text-sm text-text-secondary">
                  Không có buổi dạy chưa thanh toán và không có khoản pending
                  nào trong {selectedMonthLabel}.
                </div>
              )}
            </div>

            <div className="border-t border-border-default bg-bg-surface px-4 py-4 sm:px-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-text-muted">
                  {paymentPreviewSummary?.itemCount
                    ? `Sẽ chuyển ${paymentPreviewSummary.itemCount} khoản được liệt kê sang trạng thái đã thanh toán (gồm mọi buổi GV chưa thanh toán và các khoản pending của ${selectedMonthLabel}).`
                    : `Chưa có khoản nào: mọi buổi GV đã thanh toán hoặc không có pending trong ${selectedMonthLabel}.`}
                </p>
                <div className="flex flex-col-reverse gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={closePaymentPreviewPopup}
                    disabled={payAllPaymentsMutation.isPending}
                    className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border-default px-4 py-2.5 text-sm font-medium text-text-secondary transition hover:bg-bg-secondary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    onClick={() => payAllPaymentsMutation.mutate()}
                    disabled={
                      payAllPaymentsMutation.isPending ||
                      isPaymentPreviewLoading ||
                      isPaymentPreviewError ||
                      !paymentPreviewSummary?.itemCount
                    }
                    className="inline-flex min-h-11 items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-text-inverse transition hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {payAllPaymentsMutation.isPending
                      ? "Đang xử lý…"
                      : `Thanh toán ${paymentPreviewSummary?.itemCount ?? 0} khoản`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}

      {addBonusPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75"
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
              {bonusFormMode === "create" ? "Thêm thưởng" : "Chỉnh sửa thưởng"}
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              Áp dụng cho {selectedMonthLabel}
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
                    onClick={() => setWorkTypeMenuOpen((prev) => !prev)}
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
                              className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition-colors duration-150 ${
                                isSelected
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
                  Trạng thái
                </span>
                <div className="relative" ref={statusMenuRef}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between rounded-md border border-border-default bg-bg-surface px-3 py-2 text-left text-sm text-text-primary transition-colors duration-200 hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                    onClick={() => setStatusMenuOpen((prev) => !prev)}
                    aria-haspopup="listbox"
                    aria-expanded={statusMenuOpen}
                    aria-label="Chọn trạng thái thanh toán"
                  >
                    <span className="inline-flex items-center gap-2">
                      <span
                        className={`size-2 rounded-full ${bonusForm.status === "paid" ? "bg-success" : "bg-warning"}`}
                        aria-hidden
                      />
                      {bonusForm.status === "paid"
                        ? "Đã thanh toán"
                        : "Chờ thanh toán"}
                    </span>
                    <svg
                      className={`ml-2 size-4 shrink-0 text-text-muted transition-transform duration-200 ${statusMenuOpen ? "rotate-180" : ""}`}
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

                  {statusMenuOpen ? (
                    <div
                      role="listbox"
                      aria-label="Danh sách trạng thái thanh toán"
                      className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border-default bg-bg-surface p-1 shadow-lg"
                    >
                      {[
                        {
                          value: "pending" as const,
                          label: "Chờ thanh toán",
                          dot: "bg-warning",
                        },
                        {
                          value: "paid" as const,
                          label: "Đã thanh toán",
                          dot: "bg-success",
                        },
                      ].map((option) => {
                        const isSelected = bonusForm.status === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            className={`flex w-full items-center justify-between rounded px-2 py-2 text-left text-sm transition-colors duration-150 ${
                              isSelected
                                ? "bg-primary/10 font-medium text-text-primary"
                                : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                            }`}
                            onClick={() => {
                              setBonusForm((prev) => ({
                                ...prev,
                                status: option.value,
                              }));
                              setStatusMenuOpen(false);
                            }}
                          >
                            <span className="inline-flex items-center gap-2">
                              <span
                                className={`size-2 rounded-full ${option.dot}`}
                                aria-hidden
                              />
                              {option.label}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  ) : null}
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
                    : "Lưu thay đổi"}
              </button>
            </div>
          </div>
        </>
      ) : null}

      {depositPopupOpen ? (
        <>
          <div
            className="fixed inset-0 z-40 bg-bg-primary/75 backdrop-blur-[2px]"
            aria-hidden
            onClick={closeDepositPopup}
          />
          <div className="fixed inset-0 z-50 p-2 sm:p-4">
            <div className="mx-auto flex h-full w-full items-center max-w-4xl">
              <div
                role="dialog"
                aria-modal="true"
                aria-labelledby="deposit-list-title"
                className="flex max-h-full w-full flex-col overflow-hidden overscroll-contain rounded-[1.25rem] border border-border-default bg-bg-surface p-4 shadow-2xl sm:p-5"
              >
                <div className="mb-4 flex items-start justify-between gap-3 border-b border-border-default/70 pb-4">
                  <div className="min-w-0">
                    <h2
                      id="deposit-list-title"
                      className="truncate text-lg font-semibold text-text-primary"
                    >
                      {canPayAll
                        ? "Thanh toán cọc theo lớp"
                        : "Buổi cọc theo lớp"}
                    </h2>
                    <p className="mt-1 text-sm text-text-muted">
                      {canPayAll
                        ? `Chọn các buổi cọc cần thanh toán. Buổi cọc không áp chi phí vận hành và không áp thuế; preview được chốt theo quy tắc hiện hành tại ${depositPaymentTaxAsOfDate}.`
                        : `Tổng cọc năm ${selectedYear}: ${formatCurrency(depositYearTotal)}`}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={closeDepositPopup}
                    disabled={payDepositSessionsMutation.isPending}
                    className="rounded-xl p-2 text-text-muted transition-colors hover:bg-bg-tertiary hover:text-text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
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

                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1 sm:pr-2">
                  {canPayAll ? (
                    isDepositPaymentPreviewLoading ? (
                      <div className="space-y-4" aria-live="polite">
                        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                          {Array.from({ length: 4 }).map((_, index) => (
                            <div
                              key={`deposit-preview-skeleton-${index}`}
                              className="h-24 animate-pulse rounded-xl border border-border-default bg-bg-secondary/55"
                            />
                          ))}
                        </div>
                        <div className="space-y-3">
                          {Array.from({ length: 3 }).map((_, index) => (
                            <div
                              key={`deposit-preview-group-${index}`}
                              className="h-36 animate-pulse rounded-2xl border border-border-default bg-bg-secondary/45"
                            />
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-5">
                        {isDepositPaymentPreviewError ? (
                          <div
                            className="rounded-xl border border-error/30 bg-error/10 px-4 py-4 text-sm text-error"
                            role="alert"
                          >
                            Không tải được preview thanh toán cọc. Danh sách bên
                            dưới vẫn hiển thị theo tổng hợp hiện có, nhưng bạn
                            cần tải lại popup để thanh toán.
                          </div>
                        ) : null}

                        {depositPreviewSummary.itemCount > 0 ? (
                          <>
                            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                              <article className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                  Buổi Cọc
                                </p>
                                <p className="mt-2 text-2xl font-semibold text-text-primary">
                                  {depositPreviewSummary.itemCount}
                                </p>
                              </article>
                              <article className="rounded-xl border border-border-default bg-bg-secondary/60 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                  Giá Trị Cọc
                                </p>
                                <p className="mt-2 text-xl font-semibold text-warning">
                                  {formatCurrency(
                                    depositPreviewSummary.preTaxTotal,
                                  )}
                                </p>
                              </article>
                              <article className="rounded-xl border border-border-default bg-primary/8 px-4 py-3">
                                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                                  Thực Nhận
                                </p>
                                <p className="mt-2 text-xl font-semibold text-success">
                                  {formatCurrency(
                                    depositPreviewSummary.netTotal,
                                  )}
                                </p>
                              </article>
                            </div>

                            <div className="flex flex-col gap-2 rounded-xl border border-border-default bg-bg-secondary/35 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-sm font-medium text-text-primary">
                                  Tổng cọc năm {selectedYear}
                                </p>
                                <p className="mt-0.5 text-xs text-text-muted">
                                  Chọn theo từng buổi hoặc chọn cả lớp. Mọi buổi
                                  cọc được thanh toán sẽ được chốt về trạng thái
                                  không vận hành, không thuế.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={toggleAllDepositSessions}
                                className="inline-flex min-h-10 items-center justify-center rounded-xl border border-border-default bg-bg-surface px-3 py-2 text-sm font-medium text-text-primary transition hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                              >
                                {allDepositSessionsSelected
                                  ? "Bỏ chọn tất cả"
                                  : "Chọn tất cả"}
                              </button>
                            </div>

                            <div className="space-y-4">
                              {depositPreviewClasses.map((group) => {
                                const groupSessionIds = group.sessions.map(
                                  (session) => session.id,
                                );
                                const selectedCount = groupSessionIds.filter(
                                  (id) => selectedDepositSessionIdSet.has(id),
                                ).length;
                                const allGroupSelected =
                                  groupSessionIds.length > 0 &&
                                  selectedCount === groupSessionIds.length;

                                return (
                                  <section
                                    key={group.classId}
                                    className="overflow-hidden rounded-xl border border-border-default bg-bg-surface"
                                  >
                                    <div className="flex flex-col gap-3 border-b border-border-default bg-bg-secondary/50 px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
                                      <label className="flex min-w-0 cursor-pointer items-start gap-3">
                                        <input
                                          type="checkbox"
                                          checked={allGroupSelected}
                                          onChange={() =>
                                            toggleDepositClassSessions(
                                              groupSessionIds,
                                            )
                                          }
                                          className="mt-1 size-4 rounded border-border-default text-primary focus:ring-border-focus"
                                          aria-label={`Chọn tất cả buổi cọc của lớp ${group.className}`}
                                        />
                                        <div className="min-w-0">
                                          <p className="truncate text-sm font-semibold text-text-primary">
                                            {group.className}
                                          </p>
                                          <p className="mt-0.5 text-xs text-text-muted">
                                            {group.sessions.length} buổi · Đã
                                            chọn {selectedCount}
                                          </p>
                                        </div>
                                      </label>
                                      <div className="grid grid-cols-2 gap-2 text-right sm:min-w-[220px]">
                                        <div>
                                          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                                            Giá trị cọc
                                          </p>
                                          <p className="mt-1 text-sm font-semibold tabular-nums text-warning">
                                            {formatCurrency(group.preTaxTotal)}
                                          </p>
                                        </div>
                                        <div>
                                          <p className="text-[11px] font-medium uppercase tracking-wide text-text-muted">
                                            Thực nhận
                                          </p>
                                          <p className="mt-1 text-sm font-semibold tabular-nums text-success">
                                            {formatCurrency(group.netTotal)}
                                          </p>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="divide-y divide-border-subtle">
                                      {group.sessions.map((session) => {
                                        const isSelected =
                                          selectedDepositSessionIdSet.has(
                                            session.id,
                                          );

                                        return (
                                          <label
                                            key={session.id}
                                            className={`flex cursor-pointer gap-3 px-4 py-3 transition-colors ${
                                              isSelected
                                                ? "bg-primary/5"
                                                : "hover:bg-bg-secondary/35"
                                            }`}
                                          >
                                            <input
                                              type="checkbox"
                                              checked={isSelected}
                                              onChange={() =>
                                                toggleDepositSession(session.id)
                                              }
                                              className="mt-1 size-4 shrink-0 rounded border-border-default text-primary focus:ring-border-focus"
                                              aria-label={`Chọn buổi cọc ngày ${formatDate(session.date)}`}
                                            />
                                            <div className="min-w-0 flex-1">
                                              <div className="flex flex-wrap items-center gap-2">
                                                <p className="text-sm font-medium text-text-primary">
                                                  {formatDate(session.date)}
                                                </p>
                                                <span
                                                  className={`inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getPaymentStatusBadgeClass(
                                                    session.currentStatus,
                                                  )}`}
                                                >
                                                  {getPaymentStatusLabel(
                                                    session.currentStatus,
                                                  )}
                                                </span>
                                                <span className="inline-flex rounded-full bg-bg-secondary px-2.5 py-1 text-[11px] font-medium text-text-secondary">
                                                  Không thuế · Không vận hành
                                                </span>
                                              </div>
                                              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                                <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
                                                  <p className="text-[11px] uppercase tracking-wide text-text-muted">
                                                    Giá trị cọc
                                                  </p>
                                                  <p className="mt-1 text-sm font-semibold tabular-nums text-warning">
                                                    {formatCurrency(
                                                      session.preTaxAmount,
                                                    )}
                                                  </p>
                                                </div>
                                                <div className="rounded-lg bg-bg-secondary/60 px-3 py-2">
                                                  <p className="text-[11px] uppercase tracking-wide text-text-muted">
                                                    Thực nhận
                                                  </p>
                                                  <p className="mt-1 text-sm font-semibold tabular-nums text-success">
                                                    {formatCurrency(
                                                      session.netAmount,
                                                    )}
                                                  </p>
                                                </div>
                                              </div>
                                            </div>
                                          </label>
                                        );
                                      })}
                                    </div>
                                  </section>
                                );
                              })}
                            </div>
                          </>
                        ) : depositByClass.length === 0 ? (
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
                          <div className="rounded-xl border border-border-default bg-bg-secondary/40 px-4 py-5 text-sm text-text-secondary">
                            Danh sách buổi cọc đã có nhưng preview thanh toán
                            hiện chưa trả dữ liệu. Vui lòng đóng popup và mở lại
                            để tải lại phần chốt cọc.
                          </div>
                        )}

                        {isDepositPaymentPreviewError &&
                        depositByClass.length > 0 ? (
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
                                              session.teacherPaymentStatus ??
                                                "deposit",
                                            )}
                                          </span>
                                        </p>
                                      </div>
                                      <p className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                                        {formatCurrency(
                                          session.teacherAllowanceTotal,
                                        )}
                                      </p>
                                    </div>
                                  ))}
                                </div>
                              </section>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    )
                  ) : depositByClass.length === 0 ? (
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
                                        session.teacherPaymentStatus ??
                                          "deposit",
                                      )}
                                    </span>
                                  </p>
                                </div>
                                <p className="shrink-0 text-sm font-semibold tabular-nums text-text-primary">
                                  {formatCurrency(
                                    session.teacherAllowanceTotal,
                                  )}
                                </p>
                              </div>
                            ))}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-border-default pt-4">
                  {canPayAll ? (
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <p className="text-sm text-text-muted">
                        {selectedDepositSummary.itemCount > 0
                          ? `Đã chọn ${selectedDepositSummary.itemCount} buổi · Giá trị cọc ${formatCurrency(
                              selectedDepositSummary.preTaxTotal,
                            )} · Thực nhận ${formatCurrency(
                              selectedDepositSummary.netTotal,
                            )}`
                          : "Chọn ít nhất một buổi cọc để thanh toán."}
                      </p>
                      <div className="flex flex-col-reverse gap-2 sm:flex-row">
                        <button
                          type="button"
                          onClick={closeDepositPopup}
                          disabled={payDepositSessionsMutation.isPending}
                          className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          Đóng
                        </button>
                        <button
                          type="button"
                          onClick={handlePaySelectedDepositSessions}
                          disabled={
                            payDepositSessionsMutation.isPending ||
                            isDepositPaymentPreviewLoading ||
                            isDepositPaymentPreviewError ||
                            selectedDepositSummary.itemCount === 0
                          }
                          className="min-h-11 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {payDepositSessionsMutation.isPending
                            ? "Đang xử lý…"
                            : `Thanh toán ${selectedDepositSummary.itemCount} buổi cọc`}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={closeDepositPopup}
                        className="min-h-11 rounded-xl border border-border-default bg-bg-surface px-4 py-2 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                      >
                        Đóng
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
