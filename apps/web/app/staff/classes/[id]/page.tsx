"use client";

import { useParams, useRouter } from "next/navigation";
import { ArrowPathIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useCallback, useMemo, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ClassCard,
  ClassSurveyPanel,
  EditClassSchedulePopup,
  MakeupScheduleCard,
  MissedTeachingAlertsCard,
  PastMakeupEventsPopup,
  ScheduleTimeCard,
  SessionHistoryTableSkeleton,
  TutorCard,
} from "@/components/admin/class";
import AdminClassDetailPage from "@/app/admin/classes/[id]/page";
import AddSessionPopup from "@/components/admin/class/AddSessionPopup";
import SessionHistoryTable from "@/components/admin/session/SessionHistoryTable";
import MonthNav from "@/components/admin/MonthNav";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import type {
  ClassDetail,
  ClassScheduleItem,
  ClassStatus,
  ClassType,
} from "@/dtos/class.dto";
import type {
  CreateClassSurveyPayload,
  UpdateClassSurveyPayload,
} from "@/dtos/class-survey.dto";
import type {
  ClassScheduleGoogleCalendarResyncSummary,
  MakeupScheduleEventRecord,
} from "@/dtos/class-schedule.dto";
import type {
  MissedTeachingAlert,
  SessionCreatePayload,
  SessionItem,
  SessionUpdatePayload,
} from "@/dtos/session.dto";
import { getFullProfile } from "@/lib/apis/auth.api";
import * as staffOpsApi from "@/lib/apis/staff-ops.api";
import { formatCurrency } from "@/lib/class.helpers";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import { cn } from "@/lib/utils";

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

function isClassStudentActive(status?: string | null): boolean {
  return (status ?? "").toLowerCase() === "active";
}

function getCurrentMonthValue() {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

function getTeacherRole(profile?: Awaited<ReturnType<typeof getFullProfile>> | null) {
  return (profile?.staffInfo?.roles ?? []).includes("teacher");
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

const staffOpsKeys = {
  classList: () => ["staff-ops", "class", "list"] as const,
  classDetail: (classId: string) => ["staff-ops", "class", "detail", classId] as const,
  classSessions: (classId: string, year: string, month: string) =>
    ["staff-ops", "sessions", "class", classId, year, month] as const,
  classSurveys: (classId: string, year: string, month: string) =>
    ["staff-ops", "surveys", "class", classId, year, month] as const,
  updateSchedule: (classId: string) => ["staff-ops", "class", "schedule", "update", classId] as const,
  resyncSchedule: (classId: string) => ["staff-ops", "class", "schedule", "resync", classId] as const,
  createSession: (classId: string) => ["staff-ops", "sessions", "create", classId] as const,
  updateSession: (classId: string) => ["staff-ops", "sessions", "update", classId] as const,
};

function StudentListSkeleton() {
  return (
    <ClassCard title="Danh sách học sinh" className="w-full">
      <div className="space-y-2 md:hidden">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="rounded-lg border border-border-default bg-bg-surface p-2.5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="h-4 w-32 animate-pulse rounded bg-bg-tertiary" />
              <div className="h-5 w-16 animate-pulse rounded-full bg-bg-tertiary" />
            </div>
          </div>
        ))}
      </div>

      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[400px] border-collapse text-left text-sm">
          <caption className="sr-only">Đang tải danh sách học sinh</caption>
          <thead>
            <tr className="border-b border-border-default bg-bg-secondary">
              <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                Họ tên
              </th>
              <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                Trạng thái
              </th>
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 4 }).map((_, index) => (
              <tr key={index} className="border-b border-border-default bg-bg-surface">
                <td className="px-3 py-2">
                  <div className="h-4 w-40 animate-pulse rounded bg-bg-tertiary" />
                </td>
                <td className="px-3 py-2">
                  <div className="h-5 w-16 animate-pulse rounded-full bg-bg-tertiary" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 rounded-lg border border-border-default bg-bg-secondary/40 p-3">
        <div className="mb-2 h-3.5 w-32 animate-pulse rounded bg-bg-tertiary" />
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: 3 }).map((_, index) => (
            <div
              key={index}
              className="h-7 w-24 animate-pulse rounded-full border border-border-default bg-bg-surface"
            />
          ))}
        </div>
      </div>
    </ClassCard>
  );
}

function MakeupScheduleSkeleton() {
  return (
    <ClassCard title="Lịch học bù" className="w-full">
      <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="h-5 w-40 animate-pulse rounded bg-bg-tertiary" />
        <div className="h-9 w-32 animate-pulse rounded-md bg-bg-tertiary" />
      </div>
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, index) => (
          <div
            key={index}
            className="h-24 animate-pulse rounded-xl border border-border-default bg-bg-secondary/60"
          />
        ))}
      </div>
    </ClassCard>
  );
}

function ClassSurveyRegionSkeleton() {
  return (
    <div className="rounded-lg border border-border-default bg-bg-surface">
      <div className="border-b border-border-default bg-bg-secondary px-4 py-3">
        <div className="h-4 w-36 animate-pulse rounded bg-bg-tertiary" />
      </div>
      <div className="divide-y divide-border-default">
        {Array.from({ length: 3 }).map((_, index) => (
          <div key={index} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_120px]">
            <div>
              <div className="h-4 w-36 animate-pulse rounded bg-bg-tertiary" />
              <div className="mt-2 h-3 w-full animate-pulse rounded bg-bg-tertiary" />
              <div className="mt-2 h-3 w-2/3 animate-pulse rounded bg-bg-tertiary" />
            </div>
            <div className="h-6 w-20 animate-pulse rounded-full bg-bg-tertiary" />
          </div>
        ))}
      </div>
    </div>
  );
}

function StaffClassDetailLoadingSkeleton({
  showActionsColumn,
}: {
  showActionsColumn: boolean;
}) {
  return (
    <div
      className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 sm:p-6"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="mb-4 h-8 w-48 animate-pulse rounded bg-bg-tertiary" />
      <div className="mb-6 h-8 w-72 animate-pulse rounded bg-bg-tertiary" />
      <div className="mb-2 h-5 max-w-xl animate-pulse rounded bg-bg-tertiary" />

      <div className="flex flex-col gap-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <ClassCard title="Gia sư phụ trách" className="flex-1">
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, index) => (
                <div
                  key={index}
                  className="rounded-lg border border-border-default bg-bg-secondary/50 p-3"
                >
                  <div className="h-4 w-36 animate-pulse rounded bg-bg-tertiary" />
                  <div className="mt-2 h-3 w-48 animate-pulse rounded bg-bg-tertiary" />
                </div>
              ))}
            </div>
          </ClassCard>

          <ClassCard title="Khung giờ học" className="flex-1">
            <div className="space-y-2">
              {Array.from({ length: 2 }).map((_, index) => (
                <div key={index} className="h-16 animate-pulse rounded-lg bg-bg-tertiary" />
              ))}
            </div>
          </ClassCard>
        </div>

        <StudentListSkeleton />
        <MakeupScheduleSkeleton />

        <ClassCard title="Lịch sử & Khảo sát" className="w-full">
          <div className="mb-3 inline-flex w-fit items-center border-b border-border-default">
            <div className="h-9 w-20 animate-pulse border-b-2 border-primary bg-bg-tertiary" />
            <div className="h-9 w-20 animate-pulse bg-bg-tertiary/70" />
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <SessionHistoryTableSkeleton
              rows={5}
              entityMode="teacher"
              variant="classDetail"
              showActionsColumn={showActionsColumn}
            />
            <ClassSurveyRegionSkeleton />
          </div>
        </ClassCard>
      </div>
    </div>
  );
}

function toStaffCreateSessionPayload(payload: SessionCreatePayload) {
  return {
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    notes: payload.notes ?? null,
    coefficient: payload.coefficient,
    attendance: (payload.attendance ?? []).map((item) => ({
      studentId: item.studentId,
      status: item.status,
      notes: item.notes ?? null,
    })),
  };
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

export default function StaffClassDetailPage() {
  const params = useParams();
  const { back } = useRouter();
  const queryClient = useQueryClient();
  const id = typeof params?.id === "string" ? params.id : "";

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [activeTab, setActiveTab] = useState<TabId>("sessions");
  const [schedulePopupOpen, setSchedulePopupOpen] = useState(false);
  const [addSessionPopupOpen, setAddSessionPopupOpen] = useState(false);
  const [pastMakeupPopupOpen, setPastMakeupPopupOpen] = useState(false);
  const [addSurveyPopupOpen, setAddSurveyPopupOpen] = useState(false);
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);

  const [selectedYear, selectedMonthValue] = selectedMonth.split("-");
  const classDetailQueryKey = useMemo(() => staffOpsKeys.classDetail(id), [id]);
  const sessionsQueryKey = useMemo(
    () => staffOpsKeys.classSessions(id, selectedYear, selectedMonthValue),
    [id, selectedMonthValue, selectedYear],
  );
  const missedAlertsQueryKey = useMemo(
    () => ["staff-ops", "class", id, "missed-teaching-alerts"] as const,
    [id],
  );
  const surveysQueryKey = useMemo(
    () => staffOpsKeys.classSurveys(id, selectedYear, selectedMonthValue),
    [id, selectedMonthValue, selectedYear],
  );

  const { data: profile, isLoading: isProfileLoading } = useQuery({
    queryKey: ["auth", "full-profile"],
    queryFn: getFullProfile,
    retry: false,
    staleTime: 60_000,
  });

  const isAdmin = profile?.roleType === "admin";
  const isTeacher = getTeacherRole(profile);
  const isAccountant =
    profile?.roleType === "staff" &&
    (profile.staffInfo?.roles ?? []).some((role) =>
      ["accountant", "accountant_income", "accountant_expense"].includes(role),
    );
  const isAssistant =
    profile?.roleType === "staff" &&
    (profile.staffInfo?.roles ?? []).includes("assistant");
  const isCustomerCare =
    profile?.roleType === "staff" &&
    (profile.staffInfo?.roles ?? []).includes("customer_care");
  const shouldUseAdminClassDetailPage = isAssistant || isAccountant;
  /** Dải meta trạng thái/gói/trợ cấp/sĩ số/… — chỉ cho admin, kế toán, CSKH (trợ lí dùng AdminClassDetailPage). */
  const showClassOperationalMeta = isAdmin || isAccountant || isCustomerCare;
  const canAccessClassWorkspace =
    !shouldUseAdminClassDetailPage && (isAdmin || isTeacher || isCustomerCare);
  const actorStaffId = profile?.staffInfo?.id ?? "";

  const {
    data: classDetail,
    isLoading,
    isFetching: isClassDetailFetching,
    isError,
  } = useQuery<ClassDetail>({
    queryKey: classDetailQueryKey,
    queryFn: () => staffOpsApi.getClassById(id),
    enabled: !!id && canAccessClassWorkspace,
    retry: false,
    staleTime: 30_000,
  });

  const {
    data: sessions = [],
    isLoading: isSessionsLoading,
    isFetching: isSessionsFetching,
    isError: isSessionsError,
  } = useQuery<SessionItem[]>({
    queryKey: sessionsQueryKey,
    queryFn: () =>
      staffOpsApi.getSessionsByClassId(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id && canAccessClassWorkspace && activeTab === "sessions",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const { data: missedTeachingAlerts = [] } = useQuery<MissedTeachingAlert[]>({
    queryKey: missedAlertsQueryKey,
    queryFn: () => staffOpsApi.getMissedTeachingAlertsByClassId(id, { days: 31 }),
    enabled: !!id && canAccessClassWorkspace,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const {
    data: surveys = [],
    isLoading: isSurveysLoading,
    isFetching: isSurveysFetching,
    isError: isSurveysError,
  } = useQuery({
    queryKey: surveysQueryKey,
    queryFn: () =>
      staffOpsApi.getClassSurveys(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id && canAccessClassWorkspace && activeTab === "surveys",
    placeholderData: keepPreviousData,
    retry: false,
  });

  const scheduleItems = Array.isArray(classDetail?.schedule)
    ? classDetail.schedule.filter((item) => item?.from && item?.to)
    : [];

  const classStudents = classDetail?.students ?? [];
  const activeClassStudents = classStudents.filter((student) =>
    isClassStudentActive(student.status),
  );
  const inactiveClassStudents = classStudents.filter(
    (student) => !isClassStudentActive(student.status),
  );
  const popupTeachers = (classDetail?.teachers ?? []).map((teacher) => ({
    id: teacher.id,
    fullName: teacher.fullName,
  }));
  const teacherNameById = useMemo(
    () =>
      new Map(
        (classDetail?.teachers ?? []).map((teacher) => [teacher.id, teacher.fullName]),
      ),
    [classDetail?.teachers],
  );
  const popupStudents = activeClassStudents.map((student) => ({
    id: student.id,
    fullName: student.fullName,
    tuitionFee: student.effectiveTuitionPerSession ?? null,
  }));

  const hasTeacherSelfServiceAccess = isTeacher && Boolean(actorStaffId);
  const isTeacherWorkspaceActor = isAdmin || hasTeacherSelfServiceAccess;
  const teacherAssignedToClass =
    Boolean(actorStaffId) &&
    (classDetail?.teachers ?? []).some((teacher) => teacher.id === actorStaffId);
  const isCustomerCareView = isCustomerCare && !isTeacherWorkspaceActor;
  const usesTeacherScope =
    !isAdmin && (teacherAssignedToClass || hasTeacherSelfServiceAccess);
  const teacherCount = classDetail?.teachers?.length ?? 0;
  const canManageSchedule = isTeacherWorkspaceActor;
  const canManageSessions = isTeacherWorkspaceActor;
  const teacherScopedSessionLabel = usesTeacherScope ? "Buổi bạn dạy trong tháng" : "Buổi trong tháng";
  const teacherScopedHistorySummary = usesTeacherScope ? "Tổng số buổi bạn dạy" : "Tổng số buổi";
  const teacherScopedEmptyText = usesTeacherScope
    ? "Bạn chưa dạy buổi nào trong tháng này."
    : "Không có buổi học trong tháng này.";
  const canCreateSession =
    canManageSessions &&
    activeClassStudents.length > 0 &&
    (hasTeacherSelfServiceAccess ? true : teacherCount === 1);
  const canManageSurveys = canManageSessions && popupTeachers.length > 0;
  const defaultTeacherId = hasTeacherSelfServiceAccess
    ? actorStaffId
    : teacherCount === 1
      ? classDetail?.teachers?.[0]?.id ?? ""
      : "";
  const defaultScheduleTeacherId = hasTeacherSelfServiceAccess
    ? actorStaffId
    : teacherCount === 1
      ? classDetail?.teachers?.[0]?.id ?? ""
      : "";
  const canManageMakeupSchedule = isAdmin || hasTeacherSelfServiceAccess;
  const canCreateMakeupSchedule =
    (isAdmin && teacherCount > 0) || (hasTeacherSelfServiceAccess && teacherAssignedToClass);
  const canResyncSchedule =
    isAdmin ||
    (hasTeacherSelfServiceAccess &&
      scheduleItems.some((item) => item.teacherId === actorStaffId));
  const canResyncMakeupSchedule = isAdmin || hasTeacherSelfServiceAccess;
  const makeupTeacherMode = hasTeacherSelfServiceAccess ? "readOnly" : "select";
  const defaultMakeupTeacherId = hasTeacherSelfServiceAccess
    ? actorStaffId
    : teacherCount === 1
      ? classDetail?.teachers?.[0]?.id ?? ""
      : "";
  const canManageOwnUnlinkedMakeupEvent = (event: MakeupScheduleEventRecord) =>
    isAdmin ||
    (Boolean(actorStaffId) &&
      event.teacherId === actorStaffId &&
      !event.linkedSessionId);
  const makeupScheduleDisabledMessage =
    isAdmin && teacherCount === 0
      ? "Lop chua co gia su phu trach nen chua the tao buoi bu."
      : !isAdmin && !hasTeacherSelfServiceAccess
        ? "Tai khoan hien tai chi co quyen xem lich day bu cua lop."
        : undefined;

  const invalidateClassOpsQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: classDetailQueryKey }),
      queryClient.invalidateQueries({ queryKey: staffOpsKeys.classList() }),
      queryClient.invalidateQueries({ queryKey: missedAlertsQueryKey }),
    ]);
  }, [classDetailQueryKey, missedAlertsQueryKey, queryClient]);

  const invalidateSessionQueries = useCallback(async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: sessionsQueryKey }),
      queryClient.invalidateQueries({ queryKey: missedAlertsQueryKey }),
    ]);
  }, [missedAlertsQueryKey, queryClient, sessionsQueryKey]);

  const getClassStudentsForEditor = async (classId: string) => {
    if (classId !== id) return [];
    return popupStudents;
  };

  const getClassDetailForEdit = useCallback(
    async (classId: string) => {
      if (classDetail && classId === id) {
        return classDetail;
      }

      return queryClient.ensureQueryData({
        queryKey: ["staff-ops", "class", "detail", "session-editor", classId],
        queryFn: () => staffOpsApi.getClassById(classId),
      });
    },
    [classDetail, id, queryClient],
  );

  const updateScheduleMutation = useMutation({
    mutationKey: staffOpsKeys.updateSchedule(id),
    mutationFn: (payload: { schedule: ClassScheduleItem[] }) =>
      staffOpsApi.updateClassSchedule(id, payload),
    onSuccess: invalidateClassOpsQueries,
  });

  const resyncScheduleMutation = useMutation({
    mutationKey: staffOpsKeys.resyncSchedule(id),
    mutationFn: () => staffOpsApi.resyncClassScheduleGoogleCalendar(id),
    onSuccess: async (result) => {
      await Promise.all([
        invalidateClassOpsQueries(),
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

  const createSessionMutation = useMutation({
    mutationKey: staffOpsKeys.createSession(id),
    mutationFn: (payload: SessionCreatePayload) =>
      staffOpsApi.createSession(id, toStaffCreateSessionPayload(payload)),
    onSuccess: invalidateSessionQueries,
  });

  const updateSessionMutation = useMutation({
    mutationKey: staffOpsKeys.updateSession(id),
    mutationFn: ({
      sessionId,
      payload,
    }: {
      sessionId: string;
      payload: SessionUpdatePayload;
    }) => staffOpsApi.updateSession(sessionId, toStaffUpdateSessionPayload(payload)),
    onSuccess: invalidateSessionQueries,
  });

  const handleScheduleSubmit = useCallback(
    (payload: { schedule: ClassScheduleItem[] }) => updateScheduleMutation.mutateAsync(payload),
    [updateScheduleMutation],
  );

  const handleCreateSession = useCallback(
    (payload: SessionCreatePayload) => createSessionMutation.mutateAsync(payload),
    [createSessionMutation],
  );

  const handleUpdateSession = useCallback(
    (sessionId: string, payload: SessionUpdatePayload) =>
      updateSessionMutation.mutateAsync({ sessionId, payload }),
    [updateSessionMutation],
  );

  const handleCreateSurvey = useCallback(
    async (payload: CreateClassSurveyPayload) => {
      await staffOpsApi.createClassSurvey(id, payload);
      await queryClient.invalidateQueries({ queryKey: surveysQueryKey });
    },
    [id, queryClient, surveysQueryKey],
  );

  const handleUpdateSurvey = useCallback(
    async (surveyId: string, payload: UpdateClassSurveyPayload) => {
      await staffOpsApi.updateClassSurvey(id, surveyId, payload);
      await queryClient.invalidateQueries({ queryKey: surveysQueryKey });
    },
    [id, queryClient, surveysQueryKey],
  );

  const handleDeleteSurvey = useCallback(
    async (surveyId: string) => {
      await staffOpsApi.deleteClassSurvey(id, surveyId);
      await queryClient.invalidateQueries({ queryKey: surveysQueryKey });
    },
    [id, queryClient, surveysQueryKey],
  );

  const backLabel = "Quay lại";
  const handleBack = () => {
    back();
  };

  if (isProfileLoading) {
    return <StaffClassDetailLoadingSkeleton showActionsColumn={false} />;
  }

  if (shouldUseAdminClassDetailPage) {
    return <AdminClassDetailPage />;
  }

  if (isLoading) {
    return <StaffClassDetailLoadingSkeleton showActionsColumn={canManageSessions} />;
  }

  if (!id || !canAccessClassWorkspace || isError || !classDetail) {
    const message = !id
      ? "Thiếu mã lớp học."
      : !canAccessClassWorkspace
        ? "Tài khoản hiện tại không có quyền mở chi tiết lớp trong staff shell."
        : isCustomerCareView
          ? "Không tìm thấy lớp học này trong danh sách học sinh bạn đang chăm sóc."
          : "Không tìm thấy lớp học hoặc bạn chưa được phân công lớp này.";

    return (
      <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-4 sm:p-6">
        <button
          type="button"
          onClick={handleBack}
          className="mb-4 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:min-w-0 sm:px-0"
        >
          <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          <span className="hidden sm:inline">{backLabel}</span>
        </button>
        <div className="rounded-lg border border-error/30 bg-error/10 px-4 py-6 text-error" role="alert">
          <p>{message}</p>
        </div>
      </div>
    );
  }

  const statusChipClass =
    classDetail.status === "running"
      ? "bg-warning/15 text-warning"
      : "bg-text-muted/15 text-text-muted";

  const tuitionPackageLabel =
    classDetail.tuitionPackageTotal != null || classDetail.tuitionPackageSession != null
      ? `${formatCurrency(classDetail.tuitionPackageTotal)} / ${classDetail.tuitionPackageSession ?? "—"} buổi`
      : "—";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-bg-primary p-3 sm:p-5">
      <button
        type="button"
        onClick={handleBack}
        className="mb-3 inline-flex min-h-11 min-w-11 items-center gap-2 rounded-md px-2 py-2.5 text-sm font-medium text-primary hover:text-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary sm:min-h-0 sm:min-w-0 sm:px-0"
      >
        <svg className="size-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
        </svg>
        <span className="hidden sm:inline">{backLabel}</span>
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
              className={`absolute bottom-0 right-0 block size-3 rounded-full border-2 border-bg-surface ${classDetail.status === "running" ? "bg-warning" : "bg-text-muted"
                }`}
              title={STATUS_LABELS[classDetail.status]}
              aria-hidden
            />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <h1 className="min-w-0 truncate text-base font-semibold leading-tight text-text-primary sm:text-lg">
                {classDetail.name?.trim() || "Lớp học"}
              </h1>
              <span className="inline-flex rounded-full border border-primary/20 bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                {isCustomerCareView
                  ? "Customer Care View"
                  : isAdmin
                    ? "Staff Workspace"
                    : "Teacher Workspace"}
              </span>
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
                  <span className="text-text-muted">Học sinh </span>
                  <span className="tabular-nums text-text-primary">{classStudents.length}</span>
                </span>
                <span className="text-text-muted/80" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="text-text-muted">Gia sư </span>
                  <span className="tabular-nums text-text-primary">{teacherCount}</span>
                </span>
                <span className="text-text-muted/80" aria-hidden>
                  ·
                </span>
                <span>
                  <span className="text-text-muted">{teacherScopedSessionLabel} </span>
                  <span className="tabular-nums text-text-primary">{sessions.length}</span>
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

      <EditClassSchedulePopup
        open={schedulePopupOpen}
        onClose={() => setSchedulePopupOpen(false)}
        classDetail={classDetail}
        teachers={popupTeachers}
        allowTeacherSelection={false}
        defaultTeacherId={defaultScheduleTeacherId}
        onSubmitSchedule={handleScheduleSubmit}
      />

      {addSessionPopupOpen ? (
        <AddSessionPopup
          open={addSessionPopupOpen}
          classId={id}
          defaultTeacherId={defaultTeacherId}
          teachers={popupTeachers}
          students={popupStudents}
          classPricing={{
            allowancePerSessionPerStudent: classDetail.allowancePerSessionPerStudent,
            maxAllowancePerSession: classDetail.maxAllowancePerSession ?? null,
            scaleAmount: classDetail.scaleAmount ?? null,
            teacherCustomAllowanceByTeacherId: Object.fromEntries(
              (classDetail.teachers ?? []).map((t) => [t.id, t.customAllowance ?? null]),
            ),
          }}
          teacherMode="readOnly"
          allowFinancialFields={false}
          allowCoefficientField
          createSessionFn={handleCreateSession}
          onClose={() => setAddSessionPopupOpen(false)}
        />
      ) : null}

      <div className="flex flex-col gap-3">
        <QueryRefreshStrip
          active={isClassDetailFetching}
          label="Đang cập nhật dữ liệu lớp..."
        />
        <div className="grid gap-3 lg:grid-cols-2">
          <TutorCard
            teachers={classDetail.teachers}
            defaultAllowancePerStudent={classDetail.allowancePerSessionPerStudent}
            className="flex-1"
            enableTeacherNavigation={false}
            action={
              <div className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary sm:min-h-0 sm:w-auto">
                Chỉ xem
              </div>
            }
          />
          <ClassCard
            className="flex-1"
            title="Khung giờ học"
            action={
              canManageSchedule || canResyncSchedule ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  {canResyncSchedule ? (
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
                  {canManageSchedule ? (
                    <button
                      type="button"
                      onClick={() => setSchedulePopupOpen(true)}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                    >
                      Chỉnh sửa
                    </button>
                  ) : null}
                </div>
              ) : null
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
                    teacherName={
                      item.teacherId
                        ? teacherNameById.get(item.teacherId)
                        : defaultScheduleTeacherId
                          ? teacherNameById.get(defaultScheduleTeacherId)
                          : null
                    }
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

        <ClassCard title="Danh sách học sinh" className="w-full">
          <div className="overflow-x-auto">
            <div className="space-y-2 md:hidden">
              {activeClassStudents.length === 0 ? (
                <p className="py-3 text-center text-xs text-text-muted">Lớp chưa có học sinh đang học.</p>
              ) : (
                activeClassStudents.map((student) => {
                  const studentStatus = student.status ?? "active";
                  const isActive = studentStatus === "active";
                  const statusLabel = isActive ? "Đang học" : "Ngưng học";

                  return (
                    <article
                      key={`mobile-${student.id}`}
                      className="rounded-lg border border-border-default bg-bg-surface p-2.5 shadow-sm"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-text-primary">{student.fullName}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${isActive
                              ? "bg-success/15 text-success"
                              : "bg-text-muted/15 text-text-muted"
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

            <table className="hidden w-full min-w-[400px] border-collapse text-left text-sm md:table">
              <caption className="sr-only">Danh sách học sinh trong lớp</caption>
              <thead>
                <tr className="border-b border-border-default bg-bg-secondary">
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                    Họ tên
                  </th>
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeClassStudents.length === 0 ? (
                  <tr className="border-b border-border-default bg-bg-surface">
                    <td className="px-3 py-4 text-center text-xs text-text-muted" colSpan={2}>
                      Lớp chưa có học sinh đang học.
                    </td>
                  </tr>
                ) : (
                  activeClassStudents.map((student) => {
                    const studentStatus = student.status ?? "active";
                    const isActive = studentStatus === "active";
                    const statusLabel = isActive ? "Đang học" : "Ngưng học";

                    return (
                      <tr
                        key={`desktop-${student.id}`}
                        className="border-b border-border-default bg-bg-surface transition-colors duration-200 hover:bg-bg-secondary"
                      >
                        <td className="px-3 py-2 text-text-primary">{student.fullName}</td>
                        <td className="px-3 py-2">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${isActive
                                ? "bg-success/15 text-success"
                                : "bg-text-muted/15 text-text-muted"
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
                <div className="flex flex-wrap gap-2">
                  {inactiveClassStudents.map((student) => (
                    <span
                      key={`inactive-${student.id}`}
                      className="inline-flex items-center rounded-full border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary"
                    >
                      {student.fullName}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </ClassCard>

        <MakeupScheduleCard
          classId={id}
          teachers={popupTeachers}
          defaultTeacherId={defaultMakeupTeacherId}
          teacherMode={makeupTeacherMode}
          canCreate={canCreateMakeupSchedule}
          canEdit={canManageMakeupSchedule}
          canDelete={canManageMakeupSchedule}
          canEditEvent={canManageOwnUnlinkedMakeupEvent}
          canDeleteEvent={canManageOwnUnlinkedMakeupEvent}
          canResync={canResyncMakeupSchedule}
          canResyncEvent={(event) =>
            isAdmin || (Boolean(actorStaffId) && event.teacherId === actorStaffId)
          }
          onOpenPastEvents={() => setPastMakeupPopupOpen(true)}
          disabledCreateMessage={makeupScheduleDisabledMessage}
          month={selectedMonth}
          missedTeachingAlerts={missedTeachingAlerts}
          queryKeyPrefix={["staff-ops", "class", "detail", id]}
          listFn={staffOpsApi.getClassMakeupEvents}
          createFn={staffOpsApi.createClassMakeupEvent}
          updateFn={staffOpsApi.updateClassMakeupEvent}
          deleteFn={staffOpsApi.deleteClassMakeupEvent}
          resyncFn={staffOpsApi.resyncClassMakeupGoogleCalendar}
          saveExplanationFn={staffOpsApi.createMissedTeachingExplanation}
          updateExplanationFn={staffOpsApi.updateMissedTeachingExplanation}
          onChanged={async () => {
            await Promise.all([
              invalidateClassOpsQueries(),
              invalidateSessionQueries(),
              invalidateCalendarScopedQueries(queryClient),
            ]);
          }}
        />

        <PastMakeupEventsPopup
          open={pastMakeupPopupOpen}
          onClose={() => setPastMakeupPopupOpen(false)}
          classId={id}
          queryKeyPrefix={["staff-ops", "class", "detail", id]}
          listFn={staffOpsApi.getClassMakeupEvents}
        />

        <MissedTeachingAlertsCard
          alerts={missedTeachingAlerts}
          canCreateMakeup={canCreateMakeupSchedule}
          createMakeupFn={staffOpsApi.createClassMakeupEvent}
          saveExplanationFn={staffOpsApi.createMissedTeachingExplanation}
          updateExplanationFn={staffOpsApi.updateMissedTeachingExplanation}
          onChanged={async () => {
            await Promise.all([
              invalidateClassOpsQueries(),
              invalidateSessionQueries(),
              invalidateCalendarScopedQueries(queryClient),
            ]);
          }}
        />

        <ClassCard
          title={usesTeacherScope ? "Lịch sử & Khảo sát của bạn" : "Lịch sử & Khảo sát"}
          className="w-full"
        >
          <div className="mb-3 flex flex-col gap-3">
            <div
              className="inline-flex w-fit items-center border-b border-border-default"
              role="tablist"
              aria-label="Buổi học hoặc khảo sát"
            >
              {[
                { id: "sessions" as const, label: "Buổi học" },
                { id: "surveys" as const, label: "Khảo sát" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  id={`staff-class-detail-tab-${tab.id}`}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === tab.id}
                  aria-controls={`staff-class-detail-panel-${tab.id}`}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "relative -mb-px px-3 py-1.5 text-xs font-semibold transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-surface sm:text-sm",
                    activeTab === tab.id
                      ? "border-b-2 border-primary text-primary"
                      : "text-text-muted hover:text-text-primary",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="rounded-lg border border-border-default bg-bg-secondary/55 px-2.5 py-1.5">
              <MonthNav
                value={selectedMonth}
                onChange={setSelectedMonth}
                monthPopupOpen={monthPopupOpen}
                setMonthPopupOpen={setMonthPopupOpen}
                countLabel={
                  activeTab === "sessions"
                    ? `${teacherScopedHistorySummary}: ${sessions.length}`
                    : `Tổng khảo sát: ${surveys.length}`
                }
                actionButton={
                  (activeTab === "sessions" ? canCreateSession : canManageSurveys) ? (
                    <button
                      type="button"
                      onClick={() => {
                        if (activeTab === "sessions") {
                          setAddSessionPopupOpen(true);
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

          {activeTab === "sessions" && !canCreateSession && canManageSessions ? (
            <div className="mb-4 rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-warning">
              {classStudents.length === 0
                ? "Lớp chưa có học sinh nên chưa thể tạo buổi học."
                : hasTeacherSelfServiceAccess
                  ? "Không xác định được hồ sơ staff hiện tại để gán buổi học cho gia sư này."
                  : "Cần đúng 1 gia sư được phân công để admin tạo buổi học từ route này."}
            </div>
          ) : null}

          {activeTab === "sessions" ? (
            <section
              id="staff-class-detail-panel-sessions"
              role="tabpanel"
              aria-labelledby="staff-class-detail-tab-sessions"
            >
              {isSessionsLoading ? (
                <SessionHistoryTableSkeleton rows={5} entityMode="teacher" variant="classDetail" showActionsColumn={canManageSessions} />
              ) : (
                <div className={cn("transition-opacity", isSessionsFetching && "opacity-70")}>
                  <SessionHistoryTable
                    sessions={sessions}
                    entityMode="teacher"
                    variant="classDetail"
                    statusMode="payment"
                    emptyText={teacherScopedEmptyText}
                    editorLayout="wide"
                    showActionsColumn={canManageSessions}
                    teachers={popupTeachers}
                    getClassStudents={getClassStudentsForEditor}
                    getClassDetailForEdit={getClassDetailForEdit}
                    allowTeacherSelection={false}
                    allowFinancialEdits={false}
                    allowCoefficientEdit
                    allowPaymentStatusEdit={false}
                    allowDeleteSession={false}
                    updateSessionFn={handleUpdateSession}
                  />
                </div>
              )}
              {isSessionsError ? (
                <p className="mt-3 text-sm text-error">Không tải được lịch sử buổi học.</p>
              ) : null}
            </section>
          ) : (
            <section
              id="staff-class-detail-panel-surveys"
              role="tabpanel"
              aria-labelledby="staff-class-detail-tab-surveys"
            >
              <ClassSurveyPanel
                surveys={surveys}
                teachers={popupTeachers}
                loading={isSurveysLoading}
                fetching={isSurveysFetching}
                error={isSurveysError}
                canManage={canManageSurveys}
                createOpen={addSurveyPopupOpen}
                onCreateOpenChange={setAddSurveyPopupOpen}
                defaultTeacherId={defaultTeacherId}
                onCreate={handleCreateSurvey}
                onUpdate={handleUpdateSurvey}
                onDelete={handleDeleteSurvey}
              />
            </section>
          )}
        </ClassCard>
      </div>
    </div>
  );
}
