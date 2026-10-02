"use client";

import {
  ArrowPathIcon,
  PencilSquareIcon,
  UserMinusIcon,
} from "@heroicons/react/24/outline";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useState, useMemo, useCallback } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as classApi from "@/lib/apis/class.api";
import * as sessionApi from "@/lib/apis/session.api";
import * as surveysApi from "@/lib/apis/surveys.api";
import { formatCurrency } from "@/lib/class.helpers";
import {
  ClassCard,
  ClassStudentCaretakerCell,
  ClassStudentWalletBalance,
  ClassSurveyPanel,
  EditClassBasicInfoPopup,
  EditClassSchedulePopup,
  EditClassStudentsPopup,
  EditClassTeacherCompensationPopup,
  EditClassTeachersPopup,
  MakeupScheduleCard,
  MissedTeachingAlertsCard,
  PastMakeupEventsPopup,
  ScheduleTimeCard,
  SessionHistoryTableSkeleton,
  TutorCard,
} from "@/components/admin/class";
import AddSessionPopup from "@/components/admin/class/AddSessionPopup";
import SessionHistoryTable from "@/components/admin/session/SessionHistoryTable";
import { ClassSessionStatisticsButton } from "@/components/admin/session/SessionStatisticsPopup";
import StudentClassTuitionPopup from "@/components/admin/student/StudentClassTuitionPopup";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import ClassTimelineManager from "@/components/admin/ClassTimelineManager";
import {
  ClassStatus,
  ClassDetail,
  ClassStudent,
  UpdateClassStudentsPayload,
} from "@/dtos/class.dto";
import type {
  CreateClassSurveyPayload,
  UpdateClassSurveyPayload,
} from "@/dtos/class-survey.dto";
import { MissedTeachingAlert, SessionItem } from "@/dtos/session.dto";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { resolveClassStudentCaretakerHref } from "@/lib/class-student-caretaker";
import { standardBlockCountFromClassSchedule } from "@/lib/class-pricing-mode";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import { classKeys, classTimelineKeys } from "@/lib/query-keys";
import { cn } from "@/lib/utils";
import type { ClassScheduleGoogleCalendarResyncSummary } from "@/dtos/class-schedule.dto";

const STATUS_LABELS: Record<ClassStatus, string> = {
  running: "Đang chạy",
  ended: "Đã kết thúc",
};


function getStudentPackageSummary(
  student: ClassStudent,
): string | null {
  const effectivePackageTotal = student.effectiveTuitionPackageTotal;
  const effectivePackageSession = student.effectiveTuitionPackageSession;

  if (effectivePackageTotal == null && effectivePackageSession == null) {
    return null;
  }

  return `${formatCurrency(effectivePackageTotal)} / ${effectivePackageSession ?? "—"} buổi`;
}

function getStudentEffectiveTuitionPerSession(student: ClassStudent): number {
  return typeof student.effectiveTuitionPerSession === "number" &&
    Number.isFinite(student.effectiveTuitionPerSession)
    ? student.effectiveTuitionPerSession
    : 0;
}

function toClassStudentRosterPayload(
  student: ClassStudent,
): UpdateClassStudentsPayload["students"][number] {
  return {
    id: student.id,
    ...(student.customTuitionPerSession != null
      ? { custom_tuition_per_session: student.customTuitionPerSession }
      : {}),
    ...(student.customTuitionPackageTotal != null
      ? { custom_tuition_package_total: student.customTuitionPackageTotal }
      : {}),
    ...(student.customTuitionPackageSession != null
      ? { custom_tuition_package_session: student.customTuitionPackageSession }
      : {}),
  };
}

function isClassStudentActive(student: ClassStudent): boolean {
  return (student.status ?? "").toLowerCase() === "active";
}

function getScheduleResyncToastMessage(
  summary: ClassScheduleGoogleCalendarResyncSummary,
): string {
  if (summary.quotaLimited) {
    return "Google Calendar đang giới hạn lượt ghi; đã dừng đồng bộ phần còn lại.";
  }

  const syncedCount =
    summary.createdRecurringEvents + summary.updatedRecurringEvents;

  if (summary.failedRecurringEvents > 0) {
    return `Đã đồng bộ một phần: ${syncedCount} sự kiện, ${summary.failedRecurringEvents} lỗi.`;
  }

  if (summary.warnings.length > 0) {
    return `Đã đồng bộ Google Calendar, có ${summary.warnings.length} cảnh báo.`;
  }

  return "Đã đồng bộ Google Calendar.";
}

export default function AdminClassDetailPage() {
  const params = useParams();
  const id = typeof params?.id === "string" ? params.id : "";
  const { back, push } = useRouter();
  const pathname = usePathname();
  const routeBase = resolveAdminLikeRouteBase(pathname);
  const [basicInfoPopupOpen, setBasicInfoPopupOpen] = useState(false);
  const [teachersPopupOpen, setTeachersPopupOpen] = useState(false);
  const [schedulePopupOpen, setSchedulePopupOpen] = useState(false);
  const [studentsPopupOpen, setStudentsPopupOpen] = useState(false);
  const [selectedTuitionStudent, setSelectedTuitionStudent] =
    useState<ClassStudent | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [addSessionPopupOpen, setAddSessionPopupOpen] = useState(false);
  const [pastMakeupPopupOpen, setPastMakeupPopupOpen] = useState(false);
  const [stopTeachingPendingTeacherId, setStopTeachingPendingTeacherId] = useState<string | null>(null);
  const [stopLearningPendingStudentId, setStopLearningPendingStudentId] = useState<string | null>(null);
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const adminAccess = resolveAdminShellAccess(fullProfile);
  const { isAdmin, isAccountant } = adminAccess;
  const isAssistant = adminAccess.isAssistant;
  const isIncomeAccountantOnly =
    adminAccess.isAccountantIncome &&
    !adminAccess.isAccountantExpense &&
    !isAdmin &&
    !isAssistant;
  const isExpenseAccountantOnly =
    adminAccess.isAccountantExpense &&
    !adminAccess.isAccountantIncome &&
    !isAdmin &&
    !isAssistant;
  const showClassOperationalMeta =
    adminAccess.isAdmin ||
    adminAccess.isAssistant ||
    adminAccess.isAccountant ||
    adminAccess.isCustomerCare;
  const showClassTuitionMeta = !isExpenseAccountantOnly;
  const showStudentTuitionColumn = showClassTuitionMeta;
  /** Admin / assistant / both accountants see wallet balance; training/teacher never use this page. */
  const showStudentBalanceColumn = isAdmin || isAssistant || isAccountant;
  const showClassCompensationMeta = !isIncomeAccountantOnly;
  const showTeacherCompensation =
    adminAccess.isAdmin || adminAccess.isAssistant || adminAccess.isAccountantExpense;
  const canEditClassBasicInfo = isAdmin || isAssistant;
  const canEditTeacherRoster = isAdmin || isAssistant;
  const canEditTeacherCompensation =
    canEditTeacherRoster || adminAccess.isAccountantExpense;
  /** POST /sessions allows admin + assistant on admin routes; keep CTA aligned with backend. */
  const canCreateSession = isAdmin || isAssistant;
  const canManageSurveys = adminAccess.isAdmin || adminAccess.isAssistant;
  /** PATCH /class/:id/students allows admin + assistant; keep roster CTA aligned with backend. */
  const canManageClassStudents = isAdmin || isAssistant;
  const canManageStudentTuition =
    showStudentTuitionColumn &&
    (isAdmin || isAssistant || adminAccess.isAccountantIncome);
  const showStudentActionColumn =
    canManageStudentTuition || canManageClassStudents;
  const canOpenClassStudentsPopup =
    canManageClassStudents || canManageStudentTuition;
  const canOpenStudentDetails = true;
  const viewerStaffId = fullProfile?.staffInfo?.id ?? null;
  const resolveCaretakerHref = useCallback(
    (student: ClassStudent) =>
      resolveClassStudentCaretakerHref({
        routeBase,
        caretaker: student.customerCareStaff,
        access: adminAccess,
        viewerStaffId,
      }),
    [adminAccess, routeBase, viewerStaffId],
  );
  const canManageMakeupSchedule = adminAccess.isAdmin || adminAccess.isAssistant;
  const canEditSessionPaymentStatus =
    isAdmin || isAssistant || adminAccess.isAccountantExpense || adminAccess.isAccountantIncome;
  const canEditSessions = isAdmin || isAssistant;
  const canManageClassStatus = isAdmin || isAssistant;

  const [selectedYear, selectedMonthValue] = selectedMonth.split("-");
  const classDetailQueryKey = useMemo(() => classKeys.detail(id), [id]);

  const {
    data: classDetail,
    isLoading,
    isFetching: isClassDetailFetching,
    isError,
  } = useQuery<ClassDetail>({
    queryKey: classDetailQueryKey,
    queryFn: () => classApi.getClassById(id),
    enabled: !!id,
  });
  const canEndClass = classDetail?.endClassEligibility?.canEnd ?? false;
  const endClassBlockReason =
    classDetail?.endClassEligibility?.blockReason ??
    "Thanh toán hết trợ cấp gia sư cho mọi buổi để kết thúc lớp.";

  const queryClient = useQueryClient();
  const missedAlertsQueryKey = useMemo(
    () => ["sessions", "class", id, "missed-teaching-alerts"] as const,
    [id],
  );
  const { data: missedTeachingAlerts = [] } = useQuery<MissedTeachingAlert[]>({
    queryKey: missedAlertsQueryKey,
    queryFn: () => sessionApi.getMissedTeachingAlertsByClassId(id, { days: 31 }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

  const { data: availableSurveysResponse } = useQuery({
    queryKey: ["surveys", "picker"],
    queryFn: () => surveysApi.getSurveys({ limit: 100 }),
    enabled: !!id,
    staleTime: 60_000,
  });
  const availableSurveys = availableSurveysResponse?.data ?? [];

  const handleSessionUpdated = useCallback(
    (createdSession?: SessionItem) => {
      if (createdSession?.date) {
        const sessionMonth = createdSession.date.slice(0, 7);
        if (/^\d{4}-\d{2}$/.test(sessionMonth) && sessionMonth !== selectedMonth) {
          setSelectedMonth(sessionMonth);
        }
      }

      queryClient.invalidateQueries({ queryKey: ["sessions", "class", id] });
      queryClient.invalidateQueries({ queryKey: ["class-timeline-sessions", id] });
      queryClient.invalidateQueries({ queryKey: missedAlertsQueryKey });
      queryClient.invalidateQueries({ queryKey: classTimelineKeys.list(id) });
    },
    [queryClient, id, selectedMonth, missedAlertsQueryKey],
  );

  const handleMakeupScheduleChanged = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: classDetailQueryKey }),
      queryClient.invalidateQueries({ queryKey: missedAlertsQueryKey }),
      queryClient.invalidateQueries({
        queryKey: ["sessions", "class", id, selectedYear, selectedMonthValue],
      }),
      invalidateCalendarScopedQueries(queryClient),
    ]);
  }, [
    queryClient,
    classDetailQueryKey,
    missedAlertsQueryKey,
    id,
    selectedYear,
    selectedMonthValue,
  ]);

  const handleCreateSurvey = useCallback(
    async (payload: CreateClassSurveyPayload) => {
      await classApi.createClassSurvey(id, payload);
      await queryClient.invalidateQueries({ queryKey: ["class", "surveys", id] });
      await queryClient.invalidateQueries({ queryKey: classTimelineKeys.list(id) });
    },
    [id, queryClient],
  );

  const endClassMutation = useMutation({
    mutationFn: (reason?: string) => classApi.endClass(id, { reason }),
    onSuccess: async () => {
      toast.success("Đã kết thúc lớp.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classDetailQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
        invalidateCalendarScopedQueries(queryClient),
      ]);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Không thể kết thúc lớp.";
      toast.error(msg);
    },
  });

  const stopTeachingMutation = useMutation({
    mutationFn: async (payload: { teacherId: string; reason?: string }) => {
      setStopTeachingPendingTeacherId(payload.teacherId);
      return classApi.stopClassTeacher(id, payload.teacherId, {
        reason: payload.reason,
      });
    },
    onSuccess: async () => {
      toast.success("Đã chuyển gia sư sang nghỉ dạy lớp này.");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classDetailQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
        invalidateCalendarScopedQueries(queryClient),
      ]);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Không thể chuyển gia sư sang nghỉ dạy.";
      toast.error(msg);
    },
    onSettled: () => setStopTeachingPendingTeacherId(null),
  });

  const handleUpdateSurvey = useCallback(
    async (surveyId: string, payload: UpdateClassSurveyPayload) => {
      await classApi.updateClassSurvey(id, surveyId, payload);
      await queryClient.invalidateQueries({ queryKey: ["class", "surveys", id] });
      await queryClient.invalidateQueries({ queryKey: classTimelineKeys.list(id) });
    },
    [id, queryClient],
  );

  const handleDeleteSurvey = useCallback(
    async (surveyId: string) => {
      await classApi.deleteClassSurvey(id, surveyId);
      await queryClient.invalidateQueries({ queryKey: ["class", "surveys", id] });
      await queryClient.invalidateQueries({ queryKey: classTimelineKeys.list(id) });
    },
    [id, queryClient],
  );

  const scheduleItems = (classDetail?.schedule ?? []).filter(
    (item) => item?.from && item?.to && !item?.deletedAt,
  );

  const classStudents = useMemo(() => classDetail?.students ?? [], [classDetail?.students]);
  const activeClassStudents = useMemo(
    () => classStudents.filter((student) => isClassStudentActive(student)),
    [classStudents],
  );
  const inactiveClassStudents = useMemo(
    () => classStudents.filter((student) => !isClassStudentActive(student)),
    [classStudents],
  );
  const totalSessionTuition = classDetail?.sessionTuitionTotal ?? 0;

  const activeSurveyStudents = useMemo(
    () =>
      (classDetail?.students ?? [])
        .filter((student) => (student.status ?? "active") === "active")
        .map((student) => ({ id: student.id, fullName: student.fullName })),
    [classDetail?.students],
  );

  const popupTeachers = useMemo(
    () =>
      (classDetail?.teachers ?? []).map((teacher) => ({
        id: teacher.id,
        fullName: teacher.fullName,
      })),
    [classDetail?.teachers],
  );
  const teacherNameById = useMemo(
    () =>
      new Map(
        (classDetail?.teachers ?? []).map((teacher) => [teacher.id, teacher.fullName]),
      ),
    [classDetail?.teachers],
  );
  const currentClassTeacherId = popupTeachers.length === 1 ? popupTeachers[0]?.id : undefined;
  const addSessionTeacherMode = popupTeachers.length === 1 ? "readOnly" : "select";
  const canCreateMakeupSchedule =
    canManageMakeupSchedule && popupTeachers.length > 0;
  const makeupScheduleDisabledMessage =
    canManageMakeupSchedule && popupTeachers.length === 0
      ? "Lop chua co gia su phu trach nen chua the tao buoi bu."
      : undefined;

  const popupStudents = useMemo(
    () =>
      activeClassStudents.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        tuitionFee: getStudentEffectiveTuitionPerSession(student),
        tuitionPerBlock: student.customTuitionPerBlock ?? null,
      })),
    [activeClassStudents],
  );

  const getClassStudents = useCallback(
    async (classId: string) => {
      if (classId !== id) return [];
      return activeClassStudents.map((student) => ({
        id: student.id,
        fullName: student.fullName,
        tuitionFee: getStudentEffectiveTuitionPerSession(student),
      }));
    },
    [id, activeClassStudents],
  );

  const stopStudentLearningMutation = useMutation({
    mutationFn: async (student: ClassStudent) => {
      setStopLearningPendingStudentId(student.id);
      return classApi.updateClassStudents(id, {
        students: activeClassStudents
          .filter((item) => item.id !== student.id)
          .map(toClassStudentRosterPayload),
      });
    },
    onSuccess: async (_data, student) => {
      toast.success(`Đã chuyển ${student.fullName} sang nghỉ học lớp này.`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classDetailQueryKey }),
        queryClient.invalidateQueries({ queryKey: ["class", "list"] }),
      ]);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ??
        (err as Error)?.message ??
        "Không thể chuyển học sinh sang nghỉ học.";
      toast.error(msg);
    },
    onSettled: () => setStopLearningPendingStudentId(null),
  });

  const handleOpenAddSessionPopup = useCallback(() => {
    if (!canCreateSession) return;

    if (popupTeachers.length === 0) {
      toast.error("Lớp chưa có gia sư phụ trách. Hãy phân công gia sư trước khi thêm buổi học.");
      return;
    }

    if (activeClassStudents.length === 0) {
      toast.error("Lớp chưa có học sinh đang học nên chưa thể tạo buổi học.");
      return;
    }

    setAddSessionPopupOpen(true);
  }, [activeClassStudents.length, canCreateSession, popupTeachers.length]);

  const resyncScheduleMutation = useMutation({
    mutationFn: () => classApi.resyncClassScheduleGoogleCalendar(id),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: classDetailQueryKey }),
        invalidateCalendarScopedQueries(queryClient),
      ]);
      toast.success(getScheduleResyncToastMessage(result.data));
    },
    onError: (mutationError: Error) => {
      toast.error(
        mutationError.message || "Không đồng bộ được Google Calendar.",
      );
    },
  });

  if (isLoading) {
    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 sm:p-6" aria-busy="true" aria-live="polite">
        <div className="mb-4 h-8 w-48 animate-pulse rounded bg-bg-tertiary" />
        <div className="mb-6 h-8 w-72 animate-pulse rounded bg-bg-tertiary" />

        <div className="mb-2 h-5 max-w-xl animate-pulse rounded bg-bg-tertiary" />

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-border-default bg-bg-surface p-4">
            <div className="mb-4 h-5 w-32 animate-pulse rounded bg-bg-tertiary" />
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
            </div>
          </div>
          <div className="rounded-lg border border-border-default bg-bg-surface p-4">
            <div className="mb-4 h-5 w-28 animate-pulse rounded bg-bg-tertiary" />
            <div className="space-y-3">
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
              <div className="h-10 w-full animate-pulse rounded bg-bg-tertiary" />
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-lg border border-border-default bg-bg-surface p-4">
          <div className="mb-4 h-5 w-56 animate-pulse rounded bg-bg-tertiary" />
          <SessionHistoryTableSkeleton
            rows={1}
            entityMode="none"
            variant="classDetail"
            showBulkSelectionColumn
            showActionsColumn
          />
        </div>
      </div>
    );
  }

  if (!id || isError || !classDetail) {
    const message = !id ? "Thiếu mã lớp học." : "Không tìm thấy lớp học.";

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 sm:p-6">
        <button
          type="button"
          onClick={() => back()}
          className="mb-4 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:min-w-0 sm:px-0"
        >
          <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">Quay lại danh sách lớp</span>
        </button>
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-6 text-error" role="alert">
          <p>{message}</p>
        </div>
      </div>
    );
  }

  const tuitionPackageLabel =
    classDetail.tuitionPackageTotal != null || classDetail.tuitionPackageSession != null
      ? `${formatCurrency(classDetail.tuitionPackageTotal)} / ${classDetail.tuitionPackageSession ?? "—"} buổi`
      : "—";

  const statusChipClass =
    classDetail.status === "running"
      ? "bg-warning/15 text-warning"
      : "bg-text-muted/15 text-text-muted";
  const classMetaItems = [
    {
      key: "status",
      node: (
        <span
          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusChipClass}`}
        >
          {STATUS_LABELS[classDetail.status]}
        </span>
      ),
    },
    {
      key: "type",
      node: (
        <span className="inline-flex shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
          {classDetail.course?.name ?? "—"}
        </span>
      ),
    },
    ...(showClassTuitionMeta
      ? [
          {
            key: "tuition",
            node: (
              <span>
                <span className="text-text-muted">Gói </span>
                {tuitionPackageLabel}
              </span>
            ),
          },
        ]
      : []),
    ...(showClassCompensationMeta
      ? [
          {
            key: "allowance",
            node: (
              <span>
                <span className="text-text-muted">Trợ cấp </span>
                <span className="font-medium text-primary tabular-nums">
                  {formatCurrency(classDetail.allowancePerSessionPerStudent)}/hs
                </span>
                <span className="text-text-muted"> + </span>
                <span className="font-medium text-primary tabular-nums">
                  {formatCurrency(classDetail.scaleAmount ?? 0)}
                </span>
                <span className="text-text-muted"> scale</span>
              </span>
            ),
          },
        ]
      : []),
    {
      key: "capacity",
      node: (
        <span>
          <span className="text-text-muted">Sĩ số </span>
          <span className="tabular-nums text-text-primary">{classDetail.maxStudents ?? "—"}</span>
        </span>
      ),
    },
  ];
  const handleEndClass = () => {
    if (!canEndClass) {
      toast.error(endClassBlockReason);
      return;
    }

    const confirmed = window.confirm(
      "Kết thúc lớp? Điều kiện: mọi buổi đã thanh toán trợ cấp gia sư. Hệ thống sẽ gỡ gia sư khỏi lớp, đóng roster học sinh, xóa lịch cố định và lịch bù tương lai.",
    );
    if (!confirmed) return;

    const reason = window.prompt("Lý do (không bắt buộc)") ?? undefined;
    endClassMutation.mutate(reason);
  };
  const handleStopTeaching = (teacherId: string) => {
    const confirmed = window.confirm(
      "Chuyển gia sư sang nghỉ dạy lớp này? Lịch tương lai liên quan sẽ được xoá.",
    );
    if (!confirmed) return;

    const reason = window.prompt("Lý do (không bắt buộc)") ?? undefined;
    stopTeachingMutation.mutate({ teacherId, reason });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 sm:p-5">
      <button
        type="button"
        onClick={() => back()}
        className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:min-w-0 sm:px-0"
      >
        <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="hidden sm:inline">Quay lại danh sách lớp</span>
      </button>

      <header className="mb-4 flex flex-col gap-3 sm:mb-5">
        <div className="flex min-w-0 items-start gap-2.5 sm:gap-3">
          <div className="relative flex shrink-0">
            <div
              className="flex size-12 items-center justify-center overflow-hidden rounded-xl bg-bg-tertiary text-lg font-semibold text-text-primary ring-2 ring-border-default sm:size-14 sm:text-xl"
              aria-hidden
            >
              {(classDetail.name?.trim() || "L").charAt(0).toUpperCase()}
            </div>
            <span
              className={`absolute bottom-0 right-0 block size-3 rounded-full border-2 border-bg-surface ${classDetail.status === "running" ? "bg-success" : "bg-error"}`}
              title={STATUS_LABELS[classDetail.status]}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <h1 className="min-w-0 truncate text-base font-semibold leading-tight text-text-primary sm:text-lg">
                {classDetail.name?.trim() || "Lớp học"}
              </h1>
              {canEditClassBasicInfo ? (
                <button
                  type="button"
                  onClick={() => setBasicInfoPopupOpen(true)}
                  className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted transition hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                  aria-label="Chỉnh sửa thông tin cơ bản lớp học"
                  title="Chỉnh sửa thông tin cơ bản"
                >
                  <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                </button>
              ) : null}
              {canManageClassStatus && classDetail.status === "running" ? (
                <button
                  type="button"
                  onClick={handleEndClass}
                  disabled={endClassMutation.isPending || !canEndClass}
                  title={!canEndClass ? endClassBlockReason : undefined}
                  className="inline-flex min-h-8 shrink-0 items-center rounded-full border border-border-default bg-bg-surface px-3 text-xs font-semibold text-text-secondary transition hover:bg-bg-tertiary hover:text-primary disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
                >
                  {endClassMutation.isPending ? "Đang lưu..." : "Kết thúc lớp"}
                </button>
              ) : null}
            </div>
            {showClassOperationalMeta ? (
              <div
                className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-secondary"
                role="group"
                aria-label="Thông tin lớp học"
              >
                {classMetaItems.map((item, index) => (
                  <span key={item.key} className="inline-flex items-center gap-1.5">
                    {index > 0 ? (
                      <span className="text-text-muted/80" aria-hidden>
                        ·
                      </span>
                    ) : null}
                    {item.node}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      {canEditClassBasicInfo ? (
        <EditClassBasicInfoPopup
          open={basicInfoPopupOpen}
          onClose={() => setBasicInfoPopupOpen(false)}
          classDetail={classDetail}
        />
      ) : null}
      {canEditTeacherRoster ? (
        <EditClassTeachersPopup
          open={teachersPopupOpen}
          onClose={() => setTeachersPopupOpen(false)}
          classDetail={classDetail}
        />
      ) : (
        <EditClassTeacherCompensationPopup
          open={teachersPopupOpen && adminAccess.isAccountantExpense}
          onClose={() => setTeachersPopupOpen(false)}
          classDetail={classDetail}
        />
      )}
      {isAdmin || isAssistant ? (
        <EditClassSchedulePopup
          open={schedulePopupOpen}
          onClose={() => setSchedulePopupOpen(false)}
          classDetail={classDetail}
          teachers={popupTeachers}
          defaultTeacherId={currentClassTeacherId}
        />
      ) : null}
      {canOpenClassStudentsPopup ? (
        <EditClassStudentsPopup
          open={studentsPopupOpen}
          onClose={() => setStudentsPopupOpen(false)}
          classDetail={classDetail}
          mode={canManageClassStudents ? "roster" : "tuition"}
        />
      ) : null}
      {canManageStudentTuition && selectedTuitionStudent ? (
        <StudentClassTuitionPopup
          open
          onClose={() => setSelectedTuitionStudent(null)}
          classId={id}
          className={classDetail.name}
          studentId={selectedTuitionStudent.id}
          initialPackageTotal={selectedTuitionStudent.customTuitionPackageTotal ?? null}
          initialPackageSession={selectedTuitionStudent.customTuitionPackageSession ?? null}
        />
      ) : null}

      {addSessionPopupOpen ? (
        <AddSessionPopup
          open={addSessionPopupOpen}
          classId={id}
          className={classDetail.name}
          defaultTeacherId={currentClassTeacherId}
          teachers={popupTeachers}
          students={popupStudents}
          sessionTuitionTotal={totalSessionTuition}
          noAttendance={classDetail.noAttendance}
          classPricing={{
            allowancePerSessionPerStudent: classDetail.allowancePerSessionPerStudent,
            allowancePerBlockPerStudent: classDetail.allowancePerBlockPerStudent ?? null,
            maxAllowancePerSession: classDetail.maxAllowancePerSession ?? null,
            maxAllowancePerBlock: classDetail.maxAllowancePerBlock ?? null,
            scaleAmount: classDetail.scaleAmount ?? null,
            pricingMode: classDetail.pricingMode ?? "per_session",
            studentTuitionPerBlock: classDetail.studentTuitionPerBlock ?? null,
            standardBlockCount: standardBlockCountFromClassSchedule(
              classDetail.schedule,
            ),
            teacherCustomAllowanceByTeacherId: Object.fromEntries(
              (classDetail.teachers ?? []).map((t) => [t.id, t.customAllowance ?? null]),
            ),
          }}
          teacherMode={addSessionTeacherMode}
          onClose={() => setAddSessionPopupOpen(false)}
          onCreated={handleSessionUpdated}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <QueryRefreshStrip
          active={isClassDetailFetching}
          label="Đang cập nhật dữ liệu lớp..."
        />
        {/* Row 1: Gia sư phụ trách (trái) | Khung giờ học (phải) */}
        <div
          className={cn(
            "grid gap-3 transition-opacity lg:grid-cols-2",
            isClassDetailFetching && "opacity-70",
          )}
        >
          <TutorCard
            teachers={classDetail.teachers}
            trainingManager={classDetail.trainingManager}
            trainingManagerRatePercent={classDetail.trainingManagerRatePercent}
            defaultAllowancePerStudent={classDetail.allowancePerSessionPerStudent}
            showTeacherCompensation={showTeacherCompensation}
            className="flex-1"
            canStopTeaching={canManageClassStatus && classDetail.status === "running"}
            onStopTeaching={handleStopTeaching}
            stopTeachingPendingTeacherId={stopTeachingPendingTeacherId}
            action={
              canEditTeacherCompensation ? (
                <button
                  type="button"
                  onClick={() => setTeachersPopupOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                >
                  Chỉnh sửa
                </button>
              ) : null
            }
          />
          <ClassCard
            className="flex-1"
            title="Khung giờ học"
            action={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                {isAdmin ? (
                  <button
                    type="button"
                    onClick={() => resyncScheduleMutation.mutate()}
                    disabled={resyncScheduleMutation.isPending}
                    title="Đồng bộ Google Calendar"
                    className="inline-flex min-h-11 w-full items-center justify-center gap-1.5 rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                  >
                    <ArrowPathIcon
                      className={`size-3.5 ${
                        resyncScheduleMutation.isPending ? "animate-spin" : ""
                      }`}
                      aria-hidden
                    />
                    Đồng bộ Google
                  </button>
                ) : null}
                {isAdmin || isAssistant ? (
                  <button
                    type="button"
                    onClick={() => setSchedulePopupOpen(true)}
                    className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                  >
                    Chỉnh sửa
                  </button>
                ) : null}
              </div>
            }
          >
            {scheduleItems.length > 0 ? (
              <div className="space-y-2">
                {scheduleItems.map((item, index) => (
                  <ScheduleTimeCard
                    key={`${item.dayOfWeek}-${item.from}-${item.to}`}
                    index={index + 1}
                    from={item.from}
                    to={item.to}
                    dayOfWeek={item.dayOfWeek}
                    teacherName={item.teacherId ? teacherNameById.get(item.teacherId) : null}
                  />
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border-default bg-bg-secondary/50 px-3 py-4 text-center text-xs text-text-muted">
                Chưa có khung giờ học.
              </div>
            )}
          </ClassCard>
        </div>

        {/* Row 2: Danh sách học sinh */}
        <ClassCard
          title="Danh sách học sinh"
          className="w-full"
          action={
            canOpenClassStudentsPopup ? (
              <button
                type="button"
                onClick={() => setStudentsPopupOpen(true)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
              >
                Chỉnh sửa
              </button>
            ) : null
          }
        >
          <div className="overflow-x-auto">
            {/* Mobile: danh sách học sinh dạng thẻ */}
            <div className="space-y-2 md:hidden">
              {activeClassStudents.length === 0 ? (
                <p className="py-3 text-center text-xs text-text-muted">
                  Lớp chưa có học sinh đang học.
                </p>
              ) : (
                activeClassStudents.map((student) => {
                  const studentStatus = student.status ?? "active";
                  const isActive = studentStatus === "active";
                  const statusLabel = isActive ? "Đang học" : "Ngưng học";
                  const packageSummary = getStudentPackageSummary(
                    student,
                  );

                  return (
                    <article
                      key={`mobile-${student.id}`}
                      role={canOpenStudentDetails ? "button" : undefined}
                      tabIndex={canOpenStudentDetails ? 0 : undefined}
                      onClick={
                        canOpenStudentDetails
                          ? () =>
                              push(
                                buildAdminLikePath(
                                  routeBase,
                                  `students/${encodeURIComponent(student.id)}`,
                                ),
                              )
                          : undefined
                      }
                      onKeyDown={
                        canOpenStudentDetails
                          ? (event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                push(
                                  buildAdminLikePath(
                                    routeBase,
                                    `students/${encodeURIComponent(student.id)}`,
                                  ),
                                );
                              }
                            }
                          : undefined
                      }
                      className={`rounded-lg border border-border-default bg-bg-surface p-2.5 shadow-sm transition-colors ${canOpenStudentDetails ? "cursor-pointer hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus" : ""}`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">
                            {student.fullName}
                          </p>
                          <ClassStudentCaretakerCell
                            caretaker={student.customerCareStaff}
                            href={resolveCaretakerHref(student)}
                            layout="mobile"
                          />
                          {showStudentTuitionColumn && packageSummary ? (
                            <p className="mt-1 text-xs font-medium text-primary">
                              {packageSummary}
                            </p>
                          ) : null}
                          {showStudentBalanceColumn ? (
                            <p className="mt-1 text-xs">
                              <ClassStudentWalletBalance
                                balance={student.accountBalance}
                              />
                            </p>
                          ) : null}
                          {showStudentActionColumn ? (
                            <div className="mt-2 flex flex-wrap gap-2">
                              {canManageStudentTuition ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedTuitionStudent(student);
                                  }}
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border-default bg-bg-surface px-2.5 py-1 text-xs font-medium text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                >
                                  <PencilSquareIcon className="size-3.5" aria-hidden />
                                  Điều chỉnh gói
                                </button>
                              ) : null}
                              {canManageClassStudents ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (
                                      window.confirm(
                                        `Chuyển ${student.fullName} sang danh sách học sinh đã nghỉ?`,
                                      )
                                    ) {
                                      stopStudentLearningMutation.mutate(student);
                                    }
                                  }}
                                  disabled={stopLearningPendingStudentId !== null}
                                  className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-error/30 bg-error/5 px-2.5 py-1 text-xs font-medium text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                >
                                  <UserMinusIcon className="size-3.5" aria-hidden />
                                  {stopLearningPendingStudentId === student.id
                                    ? "Đang lưu…"
                                    : "Nghỉ học"}
                                </button>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${isActive
                              ? "bg-success/15 text-success"
                              : "bg-error/15 text-error"
                            }`}
                        >
                          {statusLabel}
                        </span>
                      </div>
                    </article>
                  );
                })
              )}
            </div>

            {/* Desktop / tablet: bảng học sinh */}
            <table className="hidden w-full min-w-[520px] border-collapse text-left text-sm md:table">
              <caption className="sr-only">Danh sách học sinh trong lớp</caption>
              <thead>
                <tr className="border-b border-border-default bg-bg-secondary">
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                    Họ tên
                  </th>
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                    Người chăm sóc
                  </th>
                  {showStudentTuitionColumn ? (
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                      Gói học phí
                    </th>
                  ) : null}
                  {showStudentBalanceColumn ? (
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                      Số dư
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                    Trạng thái
                  </th>
                  {showStudentActionColumn ? (
                    <th scope="col" className="px-3 py-2 text-right text-xs font-medium text-text-primary">
                      Thao tác
                    </th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {activeClassStudents.length === 0 ? (
                  <tr className="border-b border-border-default bg-bg-surface">
                    <td
                      className="px-3 py-4 text-center text-xs text-text-muted"
                      colSpan={
                        3 +
                        (showStudentTuitionColumn ? 1 : 0) +
                        (showStudentBalanceColumn ? 1 : 0) +
                        (showStudentActionColumn ? 1 : 0)
                      }
                    >
                      Lớp chưa có học sinh đang học.
                    </td>
                  </tr>
                ) : (
                  activeClassStudents.map((student) => {
                    const studentStatus = student.status ?? "active";
                    const isActive = studentStatus === "active";
                    const statusLabel = isActive ? "Đang học" : "Ngưng học";
                    const packageSummary = getStudentPackageSummary(
                      student,
                    );

                    return (
                      <tr
                        key={`desktop-${student.id}`}
                        role={canOpenStudentDetails ? "button" : undefined}
                        tabIndex={canOpenStudentDetails ? 0 : undefined}
                        onClick={
                          canOpenStudentDetails
                            ? () =>
                                push(
                                  buildAdminLikePath(
                                    routeBase,
                                    `students/${encodeURIComponent(student.id)}`,
                                  ),
                                )
                            : undefined
                        }
                        onKeyDown={
                          canOpenStudentDetails
                            ? (event) => {
                                if (event.key === "Enter" || event.key === " ") {
                                  event.preventDefault();
                                  push(
                                    buildAdminLikePath(
                                      routeBase,
                                      `students/${encodeURIComponent(student.id)}`,
                                    ),
                                  );
                                }
                              }
                            : undefined
                        }
                        className={`border-b border-border-default bg-bg-surface transition-colors duration-200 ${canOpenStudentDetails ? "cursor-pointer hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus" : ""}`}
                      >
                        <td className="px-3 py-2 text-text-primary">{student.fullName}</td>
                        <td className="px-3 py-2">
                          <ClassStudentCaretakerCell
                            caretaker={student.customerCareStaff}
                            href={resolveCaretakerHref(student)}
                          />
                        </td>
                        {showStudentTuitionColumn ? (
                          <td className="px-3 py-2 text-text-secondary">
                            {packageSummary ? (
                              <span className="font-medium text-primary">{packageSummary}</span>
                            ) : (
                              "—"
                            )}
                          </td>
                        ) : null}
                        {showStudentBalanceColumn ? (
                          <td className="px-3 py-2 text-sm">
                            <ClassStudentWalletBalance
                              balance={student.accountBalance}
                            />
                          </td>
                        ) : null}
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isActive
                                ? "bg-success/15 text-success"
                                : "bg-error/15 text-error"
                              }`}
                          >
                            {statusLabel}
                          </span>
                        </td>
                        {showStudentActionColumn ? (
                          <td className="px-3 py-2">
                            <div className="flex justify-end gap-1.5">
                              {canManageStudentTuition ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setSelectedTuitionStudent(student);
                                  }}
                                  className="inline-flex size-8 items-center justify-center rounded-md border border-border-default bg-bg-surface text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                  aria-label={`Điều chỉnh gói học phí của ${student.fullName}`}
                                  title="Điều chỉnh gói học phí"
                                >
                                  <PencilSquareIcon className="size-3.5" aria-hidden />
                                </button>
                              ) : null}
                              {canManageClassStudents ? (
                                <button
                                  type="button"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    if (
                                      window.confirm(
                                        `Chuyển ${student.fullName} sang danh sách học sinh đã nghỉ?`,
                                      )
                                    ) {
                                      stopStudentLearningMutation.mutate(student);
                                    }
                                  }}
                                  disabled={stopLearningPendingStudentId !== null}
                                  className="inline-flex size-8 items-center justify-center rounded-md border border-error/30 bg-error/5 text-error transition-colors hover:bg-error/10 disabled:cursor-not-allowed disabled:opacity-60 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                                  aria-label={`Chuyển ${student.fullName} sang nghỉ học lớp này`}
                                  title="Nghỉ học"
                                >
                                  <UserMinusIcon className="size-3.5" aria-hidden />
                                </button>
                              ) : null}
                            </div>
                          </td>
                        ) : null}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>

            {inactiveClassStudents.length > 0 ? (
              <div className="mt-3 rounded-lg border border-border-default bg-bg-secondary/40 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">
                  Học sinh đã nghỉ ({inactiveClassStudents.length})
                </p>
                <div className="space-y-1.5 md:hidden">
                  {inactiveClassStudents.map((student) => (
                    <button
                      key={`inactive-${student.id}`}
                      type="button"
                      onClick={
                        canOpenStudentDetails
                          ? () =>
                              push(
                                buildAdminLikePath(
                                  routeBase,
                                  `students/${encodeURIComponent(student.id)}`,
                                ),
                              )
                          : undefined
                      }
                      className={`w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-left text-sm ${canOpenStudentDetails ? "transition hover:bg-bg-secondary" : ""}`}
                    >
                      <span className="font-medium text-text-primary">{student.fullName}</span>
                      <span className="ml-2 rounded-full bg-error/15 px-2 py-0.5 text-[11px] font-medium text-error">
                        Đã nghỉ
                      </span>
                    </button>
                  ))}
                </div>
                <div className="hidden flex-wrap gap-2 md:flex">
                  {inactiveClassStudents.map((student) => (
                    <button
                      key={`inactive-chip-${student.id}`}
                      type="button"
                      onClick={
                        canOpenStudentDetails
                          ? () =>
                              push(
                                buildAdminLikePath(
                                  routeBase,
                                  `students/${encodeURIComponent(student.id)}`,
                                ),
                              )
                          : undefined
                      }
                      className={`inline-flex items-center rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary ${canOpenStudentDetails ? "transition hover:bg-bg-secondary" : ""}`}
                    >
                      {student.fullName}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ClassCard>

        <MakeupScheduleCard
          classId={id}
          teachers={popupTeachers}
          defaultTeacherId={currentClassTeacherId}
          teacherMode="select"
          canCreate={canCreateMakeupSchedule}
          canEdit={canManageMakeupSchedule}
          canDelete={canManageMakeupSchedule}
          canResync={isAdmin}
          onOpenPastEvents={() => setPastMakeupPopupOpen(true)}
          disabledCreateMessage={makeupScheduleDisabledMessage}
          month={selectedMonth}
          missedTeachingAlerts={missedTeachingAlerts}
          queryKeyPrefix={classDetailQueryKey}
          listFn={classApi.getClassMakeupEvents}
          createFn={classApi.createClassMakeupEvent}
          updateFn={classApi.updateClassMakeupEvent}
          deleteFn={classApi.deleteClassMakeupEvent}
          resyncFn={classApi.resyncClassMakeupGoogleCalendar}
          saveExplanationFn={sessionApi.createMissedTeachingExplanation}
          updateExplanationFn={sessionApi.updateMissedTeachingExplanation}
          onChanged={handleMakeupScheduleChanged}
        />

        <PastMakeupEventsPopup
          open={pastMakeupPopupOpen}
          onClose={() => setPastMakeupPopupOpen(false)}
          classId={id}
          queryKeyPrefix={classDetailQueryKey}
          listFn={classApi.getClassMakeupEvents}
        />

        <MissedTeachingAlertsCard
          alerts={missedTeachingAlerts}
          canCreateMakeup={canCreateMakeupSchedule}
          createMakeupFn={classApi.createClassMakeupEvent}
          saveExplanationFn={sessionApi.createMissedTeachingExplanation}
          updateExplanationFn={sessionApi.updateMissedTeachingExplanation}
          onChanged={handleMakeupScheduleChanged}
        />

        {/* Row 3: Timeline lớp */}
        <ClassCard title="Lịch sử & Nội dung" className="w-full">
          {(isAdmin || isAssistant || adminAccess.isCustomerCare) && (
            <ClassSessionStatisticsButton classDetail={classDetail} scope="admin" />
          )}
          <ClassTimelineManager
            classId={id}
            lessonVisibility="opt-in"
            canCreateSession={canCreateSession}
            canManageSurveys={canManageSurveys}
            canManageContent={canCreateSession}
            onCreateSession={handleOpenAddSessionPopup}
            sessionTable={({ sessions, autoOpenSessionId, autoOpenToken }) => (
              <SessionHistoryTable
                sessions={sessions}
                hideList
                autoOpenSessionId={autoOpenSessionId}
                autoOpenToken={autoOpenToken}
                entityMode="teacher"
                hideTeacherDisplay
                variant="classDetail"
                editorLayout="wide"
                enableBulkPaymentStatusEdit={canEditSessionPaymentStatus}
                allowTeacherSelection={canEditSessions}
                allowFinancialEdits={canEditSessions}
                allowAllowanceEdit={canEditSessions}
                allowAttendanceTuitionEdits={canEditSessions}
                allowPaymentStatusEdit={canEditSessionPaymentStatus}
                readOnlySessionDetails={!canEditSessions && !canEditSessionPaymentStatus}
                allowDeleteSession={canEditSessions && !isAccountant}
                onSessionUpdated={handleSessionUpdated}
                teachers={popupTeachers}
                getClassStudents={getClassStudents}
                sessionTuitionTotal={totalSessionTuition}
                showTrainingManagerAllowance={showTeacherCompensation}
              />
            )}
            surveyPanel={({
              surveys,
              autoOpenSurveyId,
              autoOpenToken,
              createOpen,
              onCreateOpenChange,
            }) => (
              <ClassSurveyPanel
                className={classDetail.name}
                surveys={surveys}
                availableSurveys={availableSurveys}
                teachers={popupTeachers}
                students={activeSurveyStudents}
                hideList
                autoOpenSurveyId={autoOpenSurveyId}
                autoOpenToken={autoOpenToken}
                canManage={canManageSurveys}
                createOpen={createOpen}
                onCreateOpenChange={onCreateOpenChange}
                defaultTeacherId={currentClassTeacherId}
                onCreate={handleCreateSurvey}
                onUpdate={handleUpdateSurvey}
                onDelete={handleDeleteSurvey}
              />
            )}
          />
        </ClassCard>
      </div>
    </div>
  );
}
