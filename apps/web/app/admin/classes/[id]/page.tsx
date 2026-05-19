"use client";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
  type Transition,
} from "framer-motion";
import { ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
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
import { formatCurrency } from "@/lib/class.helpers";
import {
  ClassCard,
  EditClassBasicInfoPopup,
  EditClassSchedulePopup,
  EditClassStudentsPopup,
  EditClassTeachersPopup,
  ClassSurveyPanel,
  MakeupScheduleCard,
  ScheduleTimeCard,
  SessionHistoryTableSkeleton,
  TutorCard,
} from "@/components/admin/class";
import AddSessionPopup from "@/components/admin/class/AddSessionPopup";
import SessionHistoryTable from "@/components/admin/session/SessionHistoryTable";
import MonthNav from "@/components/admin/MonthNav";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import { ClassStatus, ClassType, ClassDetail, ClassStudent } from "@/dtos/class.dto";
import type {
  CreateClassSurveyPayload,
  UpdateClassSurveyPayload,
} from "@/dtos/class-survey.dto";
import { SessionItem } from "@/dtos/session.dto";
import {
  buildAdminLikePath,
  resolveAdminLikeRouteBase,
} from "@/lib/admin-shell-paths";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";
import type { ClassScheduleGoogleCalendarResyncSummary } from "@/dtos/class-schedule.dto";

const STATUS_LABELS: Record<ClassStatus, string> = {
  running: "Đang chạy",
  ended: "Đã kết thúc",
};

const TYPE_LABELS: Record<ClassType, string> = {
  basic: "Basic",
  vip: "VIP",
  advance: "Advance",
  hardcore: "Hardcore",
};

type TabId = "sessions" | "surveys";
const TAB_INDICATOR_TRANSITION: Transition = {
  type: "spring",
  stiffness: 420,
  damping: 34,
  mass: 0.8,
};
const TAB_PANEL_TRANSITION: Transition = {
  duration: 0.24,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
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
  const prefersReducedMotion = useReducedMotion();
  const [basicInfoPopupOpen, setBasicInfoPopupOpen] = useState(false);
  const [teachersPopupOpen, setTeachersPopupOpen] = useState(false);
  const [schedulePopupOpen, setSchedulePopupOpen] = useState(false);
  const [studentsPopupOpen, setStudentsPopupOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<TabId>("sessions");
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const [addSessionPopupOpen, setAddSessionPopupOpen] = useState(false);
  const [addSurveyPopupOpen, setAddSurveyPopupOpen] = useState(false);
  const { data: fullProfile } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });
  const adminAccess = resolveAdminShellAccess(fullProfile);
  const { isAdmin, isAccountant } = adminAccess;
  const showClassOperationalMeta =
    adminAccess.isAdmin ||
    adminAccess.isAssistant ||
    adminAccess.isAccountant ||
    adminAccess.isCustomerCare;
  const showTeacherCompensation =
    adminAccess.isAdmin || adminAccess.isAssistant || adminAccess.isAccountant;
  /** POST /sessions is admin-only; keep the CTA aligned with backend. */
  const canCreateSession = isAdmin;
  const canManageSurveys = adminAccess.isAdmin || adminAccess.isAssistant;
  const canManageClassStudents = isAdmin;
  const canOpenStudentDetails = true;
  const canManageMakeupSchedule = adminAccess.isAdmin || adminAccess.isAssistant;

  const [selectedYear, selectedMonthValue] = selectedMonth.split("-");
  const indicatorTransition = prefersReducedMotion
    ? { duration: 0 }
    : TAB_INDICATOR_TRANSITION;
  const panelMotionProps = prefersReducedMotion
    ? {
        initial: { opacity: 1, y: 0 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 1, y: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 14 },
        animate: { opacity: 1, y: 0 },
        exit: { opacity: 0, y: -10 },
        transition: TAB_PANEL_TRANSITION,
      };

  const {
    data: classDetail,
    isLoading,
    isFetching: isClassDetailFetching,
    isError,
  } = useQuery<ClassDetail>({
    queryKey: ["class", "detail", id],
    queryFn: () => classApi.getClassById(id),
    enabled: !!id,
  });

  const queryClient = useQueryClient();
  const surveysQueryKey = useMemo(
    () => ["class", "surveys", id, selectedYear, selectedMonthValue] as const,
    [id, selectedMonthValue, selectedYear],
  );
  const {
    data: sessionsInMonth = [],
    isLoading: isSessionsLoading,
    isFetching: isSessionsFetching,
    isError: isSessionsError,
  } = useQuery<SessionItem[]>({
    queryKey: ["sessions", "class", id, selectedYear, selectedMonthValue],
    queryFn: () =>
      sessionApi.getSessionsByClassId(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });
  const {
    data: surveysInMonth = [],
    isLoading: isSurveysLoading,
    isFetching: isSurveysFetching,
    isError: isSurveysError,
  } = useQuery({
    queryKey: surveysQueryKey,
    queryFn: () =>
      classApi.getClassSurveys(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id,
    placeholderData: keepPreviousData,
  });

  const handleSessionUpdated = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ["sessions", "class", id, selectedYear, selectedMonthValue],
    });
  }, [queryClient, id, selectedYear, selectedMonthValue]);

  const handleCreateSurvey = useCallback(
    async (payload: CreateClassSurveyPayload) => {
      await classApi.createClassSurvey(id, payload);
      await queryClient.invalidateQueries({ queryKey: surveysQueryKey });
    },
    [id, queryClient, surveysQueryKey],
  );

  const handleUpdateSurvey = useCallback(
    async (surveyId: string, payload: UpdateClassSurveyPayload) => {
      await classApi.updateClassSurvey(id, surveyId, payload);
      await queryClient.invalidateQueries({ queryKey: surveysQueryKey });
    },
    [id, queryClient, surveysQueryKey],
  );

  const handleDeleteSurvey = useCallback(
    async (surveyId: string) => {
      await classApi.deleteClassSurvey(id, surveyId);
      await queryClient.invalidateQueries({ queryKey: surveysQueryKey });
    },
    [id, queryClient, surveysQueryKey],
  );

  const scheduleItems = (classDetail?.schedule ?? []).filter(
    (item) => item?.from && item?.to,
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

  const handleOpenAddSessionPopup = useCallback(() => {
    if (!isAdmin) return;

    if (popupTeachers.length === 0) {
      toast.error("Lớp chưa có gia sư phụ trách. Hãy phân công gia sư trước khi thêm buổi học.");
      return;
    }

    if (activeClassStudents.length === 0) {
      toast.error("Lớp chưa có học sinh đang học nên chưa thể tạo buổi học.");
      return;
    }

    setAddSessionPopupOpen(true);
  }, [activeClassStudents.length, isAdmin, popupTeachers.length]);

  const resyncScheduleMutation = useMutation({
    mutationFn: () => classApi.resyncClassScheduleGoogleCalendar(id),
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["class", "detail", id] }),
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
          <SessionHistoryTableSkeleton rows={1} entityMode="none" variant="classDetail" showActionsColumn />
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
            </div>
            {showClassOperationalMeta ? (
              <div
                className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-text-secondary"
                role="group"
                aria-label="Thông tin lớp học"
              >
                <span
                  className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${statusChipClass}`}
                >
                  {STATUS_LABELS[classDetail.status]}
                </span>
                <span className="text-text-muted/80" aria-hidden>
                  ·
                </span>
                <span className="inline-flex shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">
                  {TYPE_LABELS[classDetail.type] ?? classDetail.type}
                </span>
                <span className="text-text-muted/80" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="text-text-muted">Gói </span>
                  {tuitionPackageLabel}
                </span>
                <span className="text-text-muted/80" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="text-text-muted">Trợ cấp </span>
                  <span className="font-medium text-primary tabular-nums">
                    {formatCurrency(classDetail.allowancePerSessionPerStudent)}
                  </span>
                </span>
                <span className="text-text-muted/80" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="text-text-muted">Sĩ số </span>
                  <span className="tabular-nums text-text-primary">{classDetail.maxStudents ?? "—"}</span>
                </span>
                <span className="text-text-muted/80" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="text-text-muted">Scales </span>
                  <span className="tabular-nums text-text-primary">{classDetail.scaleAmount ?? "—"}</span>
                </span>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <EditClassBasicInfoPopup
        open={basicInfoPopupOpen}
        onClose={() => setBasicInfoPopupOpen(false)}
        classDetail={classDetail}
      />
      <EditClassTeachersPopup
        open={teachersPopupOpen}
        onClose={() => setTeachersPopupOpen(false)}
        classDetail={classDetail}
      />
      <EditClassSchedulePopup
        open={schedulePopupOpen}
        onClose={() => setSchedulePopupOpen(false)}
        classDetail={classDetail}
        teachers={popupTeachers}
        defaultTeacherId={currentClassTeacherId}
      />
      {canManageClassStudents ? (
        <EditClassStudentsPopup
          open={studentsPopupOpen}
          onClose={() => setStudentsPopupOpen(false)}
          classDetail={classDetail}
        />
      ) : null}

      {canCreateSession && addSessionPopupOpen ? (
        <AddSessionPopup
          open={addSessionPopupOpen}
          classId={id}
          defaultTeacherId={currentClassTeacherId}
          teachers={popupTeachers}
          students={popupStudents}
          sessionTuitionTotal={totalSessionTuition}
          classPricing={{
            allowancePerSessionPerStudent: classDetail.allowancePerSessionPerStudent,
            maxAllowancePerSession: classDetail.maxAllowancePerSession ?? null,
            scaleAmount: classDetail.scaleAmount ?? null,
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
            defaultAllowancePerStudent={classDetail.allowancePerSessionPerStudent}
            showTeacherCompensation={showTeacherCompensation}
            className="flex-1"
            action={
              <button
                type="button"
                onClick={() => setTeachersPopupOpen(true)}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
              >
                Chỉnh sửa
              </button>
            }
          />
          <ClassCard
            className="flex-1"
            title="Khung giờ học"
            action={
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
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
                <button
                  type="button"
                  onClick={() => setSchedulePopupOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                >
                  Chỉnh sửa
                </button>
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
            canManageClassStudents ? (
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
                      key={student.id}
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
                          {packageSummary ? (
                            <p className="mt-1 text-xs font-medium text-primary">
                              {packageSummary}
                            </p>
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
                    Gói học phí
                  </th>
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeClassStudents.length === 0 ? (
                  <tr className="border-b border-border-default bg-bg-surface">
                    <td className="px-3 py-4 text-center text-xs text-text-muted" colSpan={3}>
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
                        key={student.id}
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
                        <td className="px-3 py-2 text-text-secondary">
                          {packageSummary ? (
                            <span className="font-medium text-primary">{packageSummary}</span>
                          ) : (
                            "—"
                          )}
                        </td>
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
          disabledCreateMessage={makeupScheduleDisabledMessage}
          queryKeyPrefix={["class", "detail", id]}
          listFn={classApi.getClassMakeupEvents}
          createFn={classApi.createClassMakeupEvent}
          updateFn={classApi.updateClassMakeupEvent}
          deleteFn={classApi.deleteClassMakeupEvent}
          resyncFn={classApi.resyncClassMakeupGoogleCalendar}
        />

        {/* Row 3: Lịch sử buổi học và khảo sát – 2 tab */}
        <ClassCard title="Lịch sử & Khảo sát" className="w-full">
          <div className="mb-3 flex flex-col gap-3">
            <div
              className="inline-flex w-fit items-center border-b border-border-default"
              role="tablist"
              aria-label="Lịch sử hoặc khảo sát"
            >
              <button
                id="class-detail-tab-sessions"
                type="button"
                role="tab"
                aria-selected={activeTab === "sessions"}
                aria-controls="class-detail-panel-sessions"
                onClick={() => setActiveTab("sessions")}
                className={`relative -mb-px px-3 py-1.5 text-xs font-semibold touch-manipulation transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:text-sm ${
                  activeTab === "sessions"
                    ? "text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {activeTab === "sessions" ? (
                  <motion.span
                    layoutId="class-detail-tab-underline"
                    aria-hidden
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary"
                    transition={indicatorTransition}
                  />
                ) : null}
                Lịch sử buổi học
              </button>
              <button
                id="class-detail-tab-surveys"
                type="button"
                role="tab"
                aria-selected={activeTab === "surveys"}
                aria-controls="class-detail-panel-surveys"
                onClick={() => setActiveTab("surveys")}
                className={`relative -mb-px px-3 py-1.5 text-xs font-semibold touch-manipulation transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:text-sm ${
                  activeTab === "surveys"
                    ? "text-primary"
                    : "text-text-muted hover:text-text-primary"
                }`}
              >
                {activeTab === "surveys" ? (
                  <motion.span
                    layoutId="class-detail-tab-underline"
                    aria-hidden
                    className="absolute inset-x-3 bottom-0 h-0.5 rounded-full bg-primary"
                    transition={indicatorTransition}
                  />
                ) : null}
                Khảo sát
              </button>
            </div>

            <div className="flex flex-col gap-1.5 rounded-lg border border-border-default bg-bg-secondary/55 px-2.5 py-1.5 sm:flex-row sm:items-center sm:justify-between">
              <MonthNav
                value={selectedMonth}
                onChange={setSelectedMonth}
                monthPopupOpen={monthPopupOpen}
                setMonthPopupOpen={setMonthPopupOpen}
                countLabel={
                  activeTab === "sessions"
                    ? `Tổng số buổi: ${sessionsInMonth.length}`
                    : `Tổng khảo sát: ${surveysInMonth.length}`
                }
                actionButton={
                  (activeTab === "sessions" ? canCreateSession : canManageSurveys) ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTab === "sessions") {
                          handleOpenAddSessionPopup();
                          return;
                        }
                        setAddSurveyPopupOpen(true);
                      }}
                      aria-label={activeTab === "sessions" ? "Thêm buổi học" : "Thêm khảo sát"}
                      title={activeTab === "sessions" ? "Thêm buổi học" : "Thêm khảo sát"}
                      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-text-inverse transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface"
                    >
                      <PlusIcon className="size-4" aria-hidden />
                      <span className="sr-only">
                        {activeTab === "sessions" ? "Thêm buổi học" : "Thêm khảo sát"}
                      </span>
                    </button>
                  ) : null
                }
              />
            </div>
          </div>
          <QueryRefreshStrip
            active={
              activeTab === "sessions"
                ? isSessionsFetching && !isSessionsLoading
                : isSurveysFetching && !isSurveysLoading
            }
            label={
              activeTab === "sessions"
                ? "Đang tải lại lịch sử buổi học…"
                : "Đang tải lại khảo sát…"
            }
            className="mb-3"
          />

          {activeTab === "sessions" &&
          canCreateSession &&
          (popupTeachers.length === 0 || activeClassStudents.length === 0) ? (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              {popupTeachers.length === 0
                ? "Lớp chưa có gia sư phụ trách. Phân công gia sư trước khi thêm buổi học."
                : "Lớp chưa có học sinh đang học nên chưa thể tạo buổi học."}
            </div>
          ) : null}

          <AnimatePresence mode="wait" initial={false}>
            {activeTab === "sessions" ? (
            <motion.section
              key="sessions"
              id="class-detail-panel-sessions"
              role="tabpanel"
              aria-labelledby="class-detail-tab-sessions"
              className="min-w-0"
              {...panelMotionProps}
            >
              {isSessionsLoading ? (
                <SessionHistoryTableSkeleton rows={5} entityMode="none" variant="classDetail" showActionsColumn />
              ) : (
                <SessionHistoryTable
                  sessions={sessionsInMonth}
                  entityMode="teacher"
                  hideTeacherDisplay
                  variant="classDetail"
                  emptyText="Không có buổi học trong tháng này."
                  editorLayout="wide"
                  enableBulkPaymentStatusEdit
                  allowDeleteSession={!isAccountant}
                  onSessionUpdated={handleSessionUpdated}
                  teachers={popupTeachers}
                  getClassStudents={getClassStudents}
                  sessionTuitionTotal={totalSessionTuition}
                />
              )}
              {isSessionsError ? (
                <p className="mt-3 text-sm text-error" role="alert">
                  Không tải được lịch sử buổi học.
                </p>
              ) : null}
            </motion.section>
          ) : (
            <motion.section
              key="surveys"
              id="class-detail-panel-surveys"
              role="tabpanel"
              aria-labelledby="class-detail-tab-surveys"
              className="min-w-0"
              {...panelMotionProps}
            >
              <ClassSurveyPanel
                surveys={surveysInMonth}
                teachers={popupTeachers}
                loading={isSurveysLoading}
                fetching={isSurveysFetching}
                error={isSurveysError}
                canManage={canManageSurveys}
                createOpen={addSurveyPopupOpen}
                onCreateOpenChange={setAddSurveyPopupOpen}
                defaultTeacherId={currentClassTeacherId}
                onCreate={handleCreateSurvey}
                onUpdate={handleUpdateSurvey}
                onDelete={handleDeleteSurvey}
              />
            </motion.section>
          )}
          </AnimatePresence>

        </ClassCard>
      </div>
    </div>
  );
}
