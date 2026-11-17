"use client";

import { hasSaleCsHeadAccess } from "@/lib/sale-cs-head-access";
import { hasTrainingAccess } from "@/lib/training-access";
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
  ClassStudentCaretakerCell,
  ClassStudentWalletBalance,
  ClassSurveyPanel,
  EditClassBasicInfoPopup,
  EditClassSchedulePopup,
  MakeupScheduleCard,
  MissedTeachingAlertsCard,
  PastMakeupEventsPopup,
  ScheduleTimeCard,
  SessionHistoryTableSkeleton,
  TutorCard,
} from "@/components/admin/class";
import AdminClassDetailPage from "@/app/admin/classes/[id]/page";
import {
  canDeleteSessionsAsHead,
  canHeadDeleteSession,
} from "@/lib/session-delete-access";
import AddSessionPopup from "@/components/admin/class/AddSessionPopup";
import ManagedClassTeachersPopup from "@/components/admin/class/ManagedClassTeachersPopup";
import EditClassTeachersPopup from "@/components/admin/class/EditClassTeachersPopup";
import ClassTrainingManagerAssignDialog from "@/components/admin/class/ClassTrainingManagerAssignDialog";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import SessionHistoryTable from "@/components/admin/session/SessionHistoryTable";
import { ClassSessionStatisticsButton } from "@/components/admin/session/SessionStatisticsPopup";
import QueryRefreshStrip from "@/components/ui/query-refresh-strip";
import MonthNav from "@/components/admin/MonthNav";
import ClassModulesTab from "@/components/admin/class/ClassModulesTab";
import ClassTabList from "@/components/class-timeline/ClassTabList";
import {
  ClassDetailHero,
  ClassStatusBadge,
  classHeroChipClassName,
} from "@/components/shared/class/ClassDetailHero";
import type {
  ClassDetail,
  ClassScheduleItem,
  ClassStatus,
  ClassStudent,
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
import * as surveysApi from "@/lib/apis/surveys.api";
import { trainingTutorKeys } from "@/lib/apis/training-tutor.api";
import { resolveAdminShellAccess } from "@/lib/admin-shell-access";
import { resolveClassWriteAccess, TRAINING_HEAD_ROLE } from "@/lib/class-write-access";
import { resolveClassStudentCaretakerHref } from "@/lib/class-student-caretaker";
import { standardBlockCountFromClassSchedule } from "@/lib/class-pricing-mode";
import { toastWarnings } from "@/lib/mutation-feedback";
import { invalidateCalendarScopedQueries } from "@/lib/query-invalidation";
import {
  CLASS_DETAIL_TAB_LABELS,
  CLASS_DETAIL_TABS,
} from "@/lib/class-detail-tabs";
import { useClassDetailTab } from "@/hooks/use-class-detail-tab";
import {
  pickAttendanceReviewFields,
  pickSessionReviewFields,
} from "@/lib/session-review-form";
import { cn } from "@/lib/utils";
import ClassRosterCard from "@/components/shared/class/ClassRosterCard";

const STATUS_LABELS: Record<ClassStatus, string> = {
  running: "Đang chạy",
  ended: "Đã kết thúc",
};


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

function toStaffCreateSessionPayload(
  payload: SessionCreatePayload,
  options: { includeTeacherId: boolean },
) {
  return {
    // #275: Admin / Quản lý lớp chọn gia sư; gia sư thuần để BE gán chính mình.
    ...(options.includeTeacherId && payload.teacherId
      ? { teacherId: payload.teacherId }
      : {}),
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    lessonContent: payload.lessonContent,
    homework: payload.homework,
    tutorial: payload.tutorial,
    recordingUrl: payload.recordingUrl ?? null,
    notes: payload.notes ?? null,
    ...pickSessionReviewFields(payload),
    coefficient: payload.coefficient,
    attendance: (payload.attendance ?? []).map((item) => ({
      studentId: item.studentId,
      status: item.status,
      notes: item.notes ?? null,
      ...pickAttendanceReviewFields(item),
    })),
  };
}

function toStaffUpdateSessionPayload(payload: SessionUpdatePayload) {
  return {
    date: payload.date,
    startTime: payload.startTime,
    endTime: payload.endTime,
    lessonContent: payload.lessonContent,
    homework: payload.homework,
    tutorial: payload.tutorial,
    recordingUrl: payload.recordingUrl ?? null,
    notes: payload.notes ?? null,
    ...pickSessionReviewFields(payload),
    coefficient: payload.coefficient,
    attendance: payload.attendance?.map((item) => ({
      studentId: item.studentId,
      status: item.status,
      notes: item.notes ?? null,
      ...pickAttendanceReviewFields(item),
    })),
  };
}

export default function StaffClassDetailPage() {
  const params = useParams();
  const { back } = useRouter();
  const queryClient = useQueryClient();
  const id = typeof params?.id === "string" ? params.id : "";

  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonthValue);
  const [schedulePopupOpen, setSchedulePopupOpen] = useState(false);
  const [basicInfoPopupOpen, setBasicInfoPopupOpen] = useState(false);
  const [addSessionPopupOpen, setAddSessionPopupOpen] = useState(false);
  const [pastMakeupPopupOpen, setPastMakeupPopupOpen] = useState(false);
  const [monthPopupOpen, setMonthPopupOpen] = useState(false);
  const [addSurveyPopupOpen, setAddSurveyPopupOpen] = useState(false);
  const [managedTeachersPopupOpen, setManagedTeachersPopupOpen] = useState(false);
  const [managerAssignDialogOpen, setManagerAssignDialogOpen] = useState(false);
  const [headTeachersPopupOpen, setHeadTeachersPopupOpen] = useState(false);
  const [stopTeachingTarget, setStopTeachingTarget] = useState<{
    teacherId: string;
    teacherName: string;
  } | null>(null);
  const [stopTeachingReason, setStopTeachingReason] = useState("");
  const [activeTab, selectTab] = useClassDetailTab();

  const [selectedYear, selectedMonthValue] = selectedMonth.split("-");
  const classDetailQueryKey = useMemo(() => staffOpsKeys.classDetail(id), [id]);
  const missedAlertsQueryKey = useMemo(
    () => ["staff-ops", "class", id, "missed-teaching-alerts"] as const,
    [id],
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
    hasSaleCsHeadAccess(profile.staffInfo?.roles);
  const isCustomerCare =
    profile?.roleType === "staff" &&
    (profile.staffInfo?.roles ?? []).includes("customer_care");
  const isTraining =
    profile?.roleType === "staff" &&
    hasTrainingAccess(profile.staffInfo?.roles);
  const shouldUseAdminClassDetailPage = isAssistant || isAccountant;
  /** Dải meta trạng thái/gói/trợ cấp/sĩ số/… — chỉ cho admin, kế toán, CSKH (trợ lí dùng AdminClassDetailPage). */
  const showClassOperationalMeta =
    isAdmin || isAccountant || isCustomerCare;
  const canAccessClassWorkspace =
    !shouldUseAdminClassDetailPage &&
    (isAdmin || isTeacher || isCustomerCare || isTraining);
  const actorStaffId = profile?.staffInfo?.id ?? "";
  const adminAccess = resolveAdminShellAccess(profile);
  /** #274: Trưởng ban Đào tạo sửa tên, khoá học, sĩ số (PATCH basic-info). */
  const classWriteAccess = resolveClassWriteAccess({
    isAdmin,
    staffRoles: profile?.staffInfo?.roles,
    staffId: actorStaffId || null,
  });
  const canEditClassInfo =
    !isAdmin && (profile?.staffInfo?.roles ?? []).includes(TRAINING_HEAD_ROLE);
  /**
   * #277: Trưởng ban Đào tạo xem mọi lớp, chỉnh gia sư + lương gia sư và giao /
   * gỡ Quản lý lớp trên mọi lớp. Lịch / buổi / điểm danh vẫn chỉ lớp mình quản
   * lý (BE chặn 403).
   */
  const isTrainingHead = isTraining && canEditClassInfo;
  /** Trưởng ban Đào tạo mở hồ sơ gia sư như admin (`/staff/staffs/:id`, #270). */
  const resolveHeadTeacherHref = useCallback(
    (teacherId: string) => `/staff/staffs/${encodeURIComponent(teacherId)}`,
    [],
  );
  const resolveCaretakerHref = useCallback(
    (student: ClassStudent) =>
      resolveClassStudentCaretakerHref({
        routeBase: "/staff",
        caretaker: student.customerCareStaff,
        access: adminAccess,
        viewerStaffId: actorStaffId || null,
      }),
    [actorStaffId, adminAccess],
  );

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

  /**
   * Trưởng ban Đào tạo chỉ dùng workspace này ở lớp mình dạy / quản lý; lớp
   * khác chuyển sang trang admin (xem cuối component) nên không tải buổi học,
   * khảo sát, cảnh báo ở đây để khỏi gọi trùng.
   */
  const trainingHeadUsesWorkspace =
    !isTrainingHead ||
    (Boolean(classDetail) &&
      Boolean(actorStaffId) &&
      ((classDetail?.teachers ?? []).some((teacher) => teacher.id === actorStaffId) ||
        classDetail?.trainingManager?.id === actorStaffId));
  const loadsWorkspaceData = canAccessClassWorkspace && trainingHeadUsesWorkspace;

  const { data: missedTeachingAlerts = [] } = useQuery<MissedTeachingAlert[]>({
    queryKey: missedAlertsQueryKey,
    queryFn: () => staffOpsApi.getMissedTeachingAlertsByClassId(id, { days: 31 }),
    enabled: !!id && loadsWorkspaceData,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const {
    data: sessions = [],
    isLoading: isSessionsLoading,
    isFetching: isSessionsFetching,
    isError: isSessionsError,
  } = useQuery<SessionItem[]>({
    queryKey: staffOpsKeys.classSessions(id, selectedYear, selectedMonthValue),
    queryFn: () =>
      staffOpsApi.getSessionsByClassId(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id && loadsWorkspaceData && activeTab === "buoi-hoc",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const {
    data: surveys = [],
    isLoading: isSurveysLoading,
    isFetching: isSurveysFetching,
    isError: isSurveysError,
  } = useQuery({
    queryKey: staffOpsKeys.classSurveys(id, selectedYear, selectedMonthValue),
    queryFn: () =>
      staffOpsApi.getClassSurveys(id, {
        month: selectedMonthValue,
        year: selectedYear,
      }),
    enabled: !!id && loadsWorkspaceData && activeTab === "buoi-hoc",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const { data: availableSurveys = [], status: availableSurveysStatus } = useQuery({
    queryKey: ["surveys", "open-picker"],
    queryFn: () => surveysApi.getOpenSurveys(),
    enabled: loadsWorkspaceData && activeTab === "buoi-hoc",
    staleTime: 60_000,
  });

  const scheduleItems = Array.isArray(classDetail?.schedule)
    ? classDetail.schedule.filter((item) => item?.from && item?.to && !item?.deletedAt)
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
    tuitionPerBlock: student.customTuitionPerBlock ?? null,
  }));

  const teacherAssignedToClass =
    Boolean(actorStaffId) &&
    (classDetail?.teachers ?? []).some((teacher) => teacher.id === actorStaffId);
  // #277: Trưởng ban kiêm gia sư mở lớp mình không dạy → không có quyền gia sư ở lớp đó.
  const hasTeacherSelfServiceAccess =
    isTeacher && Boolean(actorStaffId) && (!isTrainingHead || teacherAssignedToClass);
  const isTeacherWorkspaceActor = isAdmin || hasTeacherSelfServiceAccess;
  const isCustomerCareView = isCustomerCare && !isTeacherWorkspaceActor;
  const isTrainingView = isTraining && !isTeacherWorkspaceActor && !isCustomerCare;
  /** Ban Đào Tạo là quản lý của lớp này: được chỉnh gia sư + lương gia sư (trừ dòng của mình). */
  const isManagingTrainer =
    isTraining &&
    Boolean(actorStaffId) &&
    classDetail?.trainingManager?.id === actorStaffId;
  const canManageClassTeachers =
    (isManagingTrainer || isTrainingHead) && classDetail?.status !== "ended";
  /** #277: giao / gỡ Quản lý lớp — Admin hoặc Trưởng ban Đào tạo (% chỉ Admin). */
  const canAssignClassManager = isAdmin || isTrainingHead;
  /** Thấy lương mọi gia sư của lớp: Admin, Quản lý lớp, Trưởng ban Đào tạo. */
  const seesAllTeacherCompensation = isAdmin || isManagingTrainer || isTrainingHead;
  /** Admin on staff shell + CSKH (assigned students only; others empty via BE redact). */
  const showStudentBalanceColumn = isAdmin || isCustomerCareView;
  /** #275: Quản lý lớp làm mọi việc của gia sư trên mọi buổi của lớp (BE chặn lớp khác). */
  const canWorkOnAllClassSessions = isAdmin || isManagingTrainer;
  const canOpenReadonlyClassForms = isTrainingView && !isManagingTrainer;
  const usesTeacherScope =
    !isAdmin && (teacherAssignedToClass || hasTeacherSelfServiceAccess);
  const teacherCount = classDetail?.teachers?.length ?? 0;
  const canManageSchedule = isTeacherWorkspaceActor || isManagingTrainer;
  const canManageSessions = isTeacherWorkspaceActor || isManagingTrainer;
  // Gia sư thấy cả buổi của gia sư khác trong lớp nhưng chỉ ở dạng nhận xét (BE đã bỏ mọi số tiền).
  // Hợp quyền (#275): kiêm Quản lý lớp thì không khoá về buổi của mình.
  const isReviewOnlySession = (session: SessionItem) =>
    usesTeacherScope &&
    !isManagingTrainer &&
    Boolean(actorStaffId) &&
    session.teacherId !== actorStaffId;
  /** Hệ số / Dạy thử: Admin, hoặc gia sư trên buổi do mình dạy — Quản lý lớp không đổi buổi của gia sư khác. */
  const canToggleTrialForSession = (session: SessionItem) =>
    isAdmin || (Boolean(actorStaffId) && session.teacherId === actorStaffId);
  /** 15/11: role trưởng xoá buổi chưa thanh toán / ghi cọc (backend chặn buổi đã khoá). */
  const canDeleteSessionsAsHeadRole =
    !isAdmin && canDeleteSessionsAsHead(profile?.staffInfo?.roles);
  const ownSessionCount = usesTeacherScope
    ? sessions.filter((session) => session.teacherId === actorStaffId).length
    : sessions.length;
  const historyCountLabel =
    usesTeacherScope && ownSessionCount !== sessions.length
      ? `Tổng số buổi: ${sessions.length + surveys.length} · bạn dạy ${ownSessionCount}`
      : `Tổng số buổi: ${sessions.length + surveys.length}`;
  const teacherScopedEmptyText = "Không có buổi học hay khảo sát trong tháng này.";
  const canCreateSession =
    canManageSessions &&
    activeClassStudents.length > 0 &&
    (isManagingTrainer
      ? teacherCount > 0
      : hasTeacherSelfServiceAccess
        ? true
        : teacherCount === 1);
  /** Quản lý lớp chọn gia sư khi tạo buổi (BE kiểm gia sư thuộc lớp). */
  const sessionTeacherMode = isManagingTrainer ? "select" : "readOnly";
  const canManageSurveys = canManageSessions && popupTeachers.length > 0;
  const defaultTeacherId = isManagingTrainer
    ? teacherAssignedToClass
      ? actorStaffId
      : teacherCount === 1
        ? classDetail?.teachers?.[0]?.id ?? ""
        : ""
    : hasTeacherSelfServiceAccess
      ? actorStaffId
      : teacherCount === 1
        ? classDetail?.teachers?.[0]?.id ?? ""
        : "";
  const defaultScheduleTeacherId = hasTeacherSelfServiceAccess && !isManagingTrainer
    ? actorStaffId
    : teacherCount === 1
      ? classDetail?.teachers?.[0]?.id ?? ""
      : "";
  const canManageMakeupSchedule =
    isAdmin || hasTeacherSelfServiceAccess || isManagingTrainer;
  const canCreateMakeupSchedule =
    (canWorkOnAllClassSessions && teacherCount > 0) ||
    (hasTeacherSelfServiceAccess && teacherAssignedToClass);
  // #276: Quản lý lớp đồng bộ lại toàn bộ lịch + link Meet của lớp mình.
  const canResyncSchedule =
    canWorkOnAllClassSessions ||
    (hasTeacherSelfServiceAccess &&
      scheduleItems.some((item) => item.teacherId === actorStaffId));
  const canResyncMakeupSchedule =
    canWorkOnAllClassSessions || hasTeacherSelfServiceAccess;
  const makeupTeacherMode =
    hasTeacherSelfServiceAccess && !canWorkOnAllClassSessions ? "readOnly" : "select";
  const defaultMakeupTeacherId = teacherAssignedToClass
    ? actorStaffId
    : teacherCount === 1
      ? classDetail?.teachers?.[0]?.id ?? ""
      : "";
  const canManageOwnUnlinkedMakeupEvent = (event: MakeupScheduleEventRecord) =>
    canWorkOnAllClassSessions ||
    (Boolean(actorStaffId) &&
      event.teacherId === actorStaffId &&
      !event.linkedSessionId);
  const makeupScheduleDisabledMessage =
    canWorkOnAllClassSessions && teacherCount === 0
      ? "Lớp chưa có gia sư phụ trách nên chưa thể tạo buổi bù."
      : !canWorkOnAllClassSessions &&
          !hasTeacherSelfServiceAccess &&
          !canOpenReadonlyClassForms
        ? "Tài khoản hiện tại chỉ có quyền xem lịch dạy bù của lớp."
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
      queryClient.invalidateQueries({ queryKey: ["staff-ops", "sessions", "class", id] }),
      queryClient.invalidateQueries({ queryKey: missedAlertsQueryKey }),
    ]);
  }, [id, missedAlertsQueryKey, queryClient]);

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
    mutationFn: (payload: {
      schedule: ClassScheduleItem[];
      removedEntryIds?: string[];
      expectedUpdatedAt?: string;
    }) => staffOpsApi.updateClassSchedule(id, payload),
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
      staffOpsApi.createSession(
        id,
        toStaffCreateSessionPayload(payload, {
          includeTeacherId: canWorkOnAllClassSessions,
        }),
      ),
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
    (payload: {
      schedule: ClassScheduleItem[];
      removedEntryIds?: string[];
      expectedUpdatedAt?: string;
    }) => updateScheduleMutation.mutateAsync(payload),
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
      await queryClient.invalidateQueries({ queryKey: ["staff-ops", "surveys", "class", id] });
      // Nộp xong là gỡ chặn khảo sát sắp hạn ngay, không đợi staleTime của popup.
      await queryClient.invalidateQueries({ queryKey: ["surveys", "my-warnings"] });
    },
    [id, queryClient],
  );

  const handleUpdateSurvey = useCallback(
    async (surveyId: string, payload: UpdateClassSurveyPayload) => {
      await staffOpsApi.updateClassSurvey(id, surveyId, payload);
      await queryClient.invalidateQueries({ queryKey: ["staff-ops", "surveys", "class", id] });
    },
    [id, queryClient],
  );

  const handleDeleteSurvey = useCallback(
    async (surveyId: string) => {
      await staffOpsApi.deleteClassSurvey(id, surveyId);
      await queryClient.invalidateQueries({ queryKey: ["staff-ops", "surveys", "class", id] });
    },
    [id, queryClient],
  );

  const invalidateClassTeacherQueries = useCallback(async () => {
    await Promise.all([
      invalidateClassOpsQueries(),
      queryClient.invalidateQueries({ queryKey: trainingTutorKeys.all }),
      invalidateCalendarScopedQueries(queryClient),
    ]);
  }, [invalidateClassOpsQueries, queryClient]);

  const stopTeachingMutation = useMutation({
    mutationFn: (payload: { teacherId: string; reason?: string }) =>
      staffOpsApi.stopClassTeacher(id, payload.teacherId, { reason: payload.reason }),
    onSuccess: (result) => {
      toast.success("Đã chuyển gia sư sang nghỉ dạy lớp này.");
      toastWarnings(result.calendarSyncWarnings);
      setStopTeachingTarget(null);
    },
    onError: (err: unknown) => {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data?.message ??
        (err as Error)?.message ??
        "Không thể chuyển gia sư sang nghỉ dạy.";
      toast.error(msg);
    },
    // Refresh cả khi lỗi: request có thể fail sau khi DB đã đổi.
    onSettled: invalidateClassTeacherQueries,
  });

  const handleStopTeaching = (teacherId: string) => {
    const teacherName =
      classDetail?.teachers?.find((teacher) => teacher.id === teacherId)?.fullName?.trim() ||
      "gia sư";
    setStopTeachingReason("");
    setStopTeachingTarget({ teacherId, teacherName });
  };

  const handleConfirmStopTeaching = () => {
    if (!stopTeachingTarget) return;
    const reason = stopTeachingReason.trim();
    stopTeachingMutation.mutate({
      teacherId: stopTeachingTarget.teacherId,
      reason: reason || undefined,
    });
  };

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

  /**
   * Trưởng ban Đào tạo ở lớp mình không dạy / không quản lý: dùng y trang chi
   * tiết lớp của admin (cờ quyền khớp backend, #277). Lớp mình dạy / quản lý
   * giữ workspace này để còn tạo buổi, sửa lịch, điểm danh.
   */
  if (classDetail && !trainingHeadUsesWorkspace) {
    return <AdminClassDetailPage />;
  }

  if (!id || !canAccessClassWorkspace || isError || !classDetail) {
    const message = !id
      ? "Thiếu mã lớp học."
      : !canAccessClassWorkspace
        ? "Tài khoản hiện tại không có quyền mở chi tiết lớp trong staff shell."
        : isCustomerCareView
          ? "Không tìm thấy lớp học này trong danh sách học sinh bạn đang chăm sóc."
          : isTrainingView
            ? isTrainingHead
              ? "Không tìm thấy lớp học này."
              : "Không tìm thấy lớp học này trong danh sách lớp bạn đang quản lý."
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

      <ClassDetailHero
        classId={id}
        title={classDetail.name?.trim() || "Lớp học"}
        badges={
          <>
            {showClassOperationalMeta ? (
              <>
                <ClassStatusBadge
                  running={classDetail.status === "running"}
                  label={STATUS_LABELS[classDetail.status]}
                />
                <span className={classHeroChipClassName}>
                  {classDetail.course?.name ?? "—"}
                </span>
              </>
            ) : null}
            <span className="inline-flex rounded-full border border-primary/20 px-2 py-0.5 text-[11px] font-medium text-text-secondary">
              {isCustomerCareView
                ? "Customer Care View"
                : isTrainingView
                  ? "Training Manager View"
                  : isAdmin
                    ? "Staff Workspace"
                    : "Teacher Workspace"}
            </span>
          </>
        }
        actions={
          canEditClassInfo ? (
            <button
              type="button"
              onClick={() => setBasicInfoPopupOpen(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border-default bg-bg-surface text-text-muted transition hover:bg-bg-tertiary hover:text-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary"
              aria-label="Chỉnh sửa thông tin lớp"
              title="Chỉnh sửa thông tin lớp"
            >
              <svg className="size-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          ) : undefined
        }
      />

      {canEditClassInfo ? (
        <EditClassBasicInfoPopup
          open={basicInfoPopupOpen}
          onClose={() => setBasicInfoPopupOpen(false)}
          classDetail={classDetail}
          access={classWriteAccess}
          onSaved={() => queryClient.invalidateQueries({ queryKey: classDetailQueryKey })}
        />
      ) : null}

      <EditClassSchedulePopup
        open={schedulePopupOpen}
        onClose={() => setSchedulePopupOpen(false)}
        classDetail={classDetail}
        teachers={popupTeachers}
        allowTeacherSelection={isManagingTrainer}
        defaultTeacherId={defaultScheduleTeacherId}
        readOnly={canOpenReadonlyClassForms}
        allowEffectiveFromEdit={isAdmin}
        onSubmitSchedule={handleScheduleSubmit}
      />

      {managerAssignDialogOpen && canAssignClassManager ? (
        <ClassTrainingManagerAssignDialog
          classDetail={classDetail}
          onClose={() => setManagerAssignDialogOpen(false)}
          onChanged={invalidateClassTeacherQueries}
        />
      ) : null}

      {/* Trưởng ban Đào tạo: cùng form «Gia sư & quản lý» của admin (#277). */}
      <EditClassTeachersPopup
        open={headTeachersPopupOpen && isTrainingHead}
        onClose={() => setHeadTeachersPopupOpen(false)}
        classDetail={classDetail}
        variant="trainingHead"
        actorStaffId={actorStaffId || null}
        onSaved={invalidateClassTeacherQueries}
      />

      {managedTeachersPopupOpen && canManageClassTeachers && !isTrainingHead ? (
        <ManagedClassTeachersPopup
          classDetail={classDetail}
          actorStaffId={actorStaffId}
          onClose={() => setManagedTeachersPopupOpen(false)}
          onChanged={invalidateClassTeacherQueries}
        />
      ) : null}

      <ConfirmDialog
        open={stopTeachingTarget !== null}
        onOpenChange={(open) => {
          if (!open) setStopTeachingTarget(null);
        }}
        title={`Cho ${stopTeachingTarget?.teacherName ?? "gia sư"} nghỉ dạy lớp này?`}
        description="Lịch tương lai liên quan sẽ bị xoá. Trợ cấp các buổi đã phát sinh giữ nguyên."
        confirmLabel="Nghỉ dạy"
        variant="destructive"
        onConfirm={handleConfirmStopTeaching}
        confirmPending={stopTeachingMutation.isPending}
      >
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="staff-stop-teaching-reason"
            className="text-xs font-medium text-text-secondary"
          >
            Lý do (không bắt buộc)
          </label>
          <textarea
            id="staff-stop-teaching-reason"
            value={stopTeachingReason}
            onChange={(event) => setStopTeachingReason(event.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border-default bg-bg-surface px-3 py-2 text-sm text-text-primary outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/30"
          />
        </div>
      </ConfirmDialog>

      {addSessionPopupOpen ? (
        <AddSessionPopup
          open={addSessionPopupOpen}
          classId={id}
          className={classDetail.name}
          defaultTeacherId={defaultTeacherId}
          teachers={popupTeachers}
          students={popupStudents}
          noAttendance={classDetail.noAttendance}
          fetchNextOrdinal={staffOpsApi.getNextSessionOrdinal}
          ordinalQueryScope="staff"
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
            teacherCustomScaleByTeacherId: Object.fromEntries(
              (classDetail.teachers ?? []).map((t) => [t.id, t.customScaleAmount ?? null]),
            ),
          }}
          teacherMode={sessionTeacherMode}
          allowFinancialFields={false}
          showAllowancePreview={isAdmin || teacherAssignedToClass}
          allowTrialTeachingToggle={!isManagingTrainer || isAdmin}
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
            trainingManager={classDetail.trainingManager}
            trainingManagerRatePercent={classDetail.trainingManagerRatePercent}
            defaultAllowancePerStudent={classDetail.allowancePerSessionPerStudent}
            defaultScaleAmount={classDetail.scaleAmount}
            showTeacherCompensation={seesAllTeacherCompensation || teacherAssignedToClass}
            compensationTeacherId={seesAllTeacherCompensation ? null : actorStaffId}
            className="flex-1"
            enableTeacherNavigation={isTrainingHead}
            getTeacherHref={resolveHeadTeacherHref}
            canStopTeaching={canManageClassTeachers}
            stopTeachingLockedTeacherId={actorStaffId || null}
            onStopTeaching={handleStopTeaching}
            stopTeachingPendingTeacherId={
              stopTeachingMutation.isPending
                ? (stopTeachingMutation.variables?.teacherId ?? null)
                : null
            }
            action={
              isTrainingHead ? (
                <button
                  type="button"
                  onClick={() => setHeadTeachersPopupOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                >
                  Chỉnh sửa
                </button>
              ) : canManageClassTeachers || canAssignClassManager ? (
                <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                  {canAssignClassManager ? (
                    <button
                      type="button"
                      onClick={() => setManagerAssignDialogOpen(true)}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                    >
                      Quản lý lớp
                    </button>
                  ) : null}
                  {canManageClassTeachers ? (
                    <button
                      type="button"
                      onClick={() => setManagedTeachersPopupOpen(true)}
                      className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary transition-colors hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                    >
                      Chỉnh sửa
                    </button>
                  ) : null}
                </div>
              ) : (
                <div className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-secondary sm:min-h-0 sm:w-auto">
                  Chỉ xem
                </div>
              )
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
              ) : canOpenReadonlyClassForms ? (
                <button
                  type="button"
                  onClick={() => setSchedulePopupOpen(true)}
                  className="inline-flex min-h-11 w-full items-center justify-center rounded-md border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-medium text-text-primary transition-colors duration-200 hover:bg-bg-tertiary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus sm:min-h-0 sm:w-auto"
                >
                  Xem
                </button>
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

        <ClassRosterCard
          activeCount={activeClassStudents.length}
          inactiveCount={inactiveClassStudents.length}
          inactiveContent={
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
          }
        >
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
                          <ClassStudentCaretakerCell
                            caretaker={student.customerCareStaff}
                            href={resolveCaretakerHref(student)}
                            layout="mobile"
                          />
                          {showStudentBalanceColumn ? (
                            <p className="mt-1 text-xs">
                              <ClassStudentWalletBalance
                                balance={student.accountBalance}
                              />
                            </p>
                          ) : null}
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
                    Người chăm sóc
                  </th>
                  {showStudentBalanceColumn ? (
                    <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                      Số dư
                    </th>
                  ) : null}
                  <th scope="col" className="px-3 py-2 text-xs font-medium text-text-primary">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {activeClassStudents.length === 0 ? (
                  <tr className="border-b border-border-default bg-bg-surface">
                    <td
                      className="px-3 py-4 text-center text-xs text-text-muted"
                      colSpan={3 + (showStudentBalanceColumn ? 1 : 0)}
                    >
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
                          <ClassStudentCaretakerCell
                            caretaker={student.customerCareStaff}
                            href={resolveCaretakerHref(student)}
                          />
                        </td>
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
          </div>
        </ClassRosterCard>

        <MakeupScheduleCard
          classId={id}
          teachers={popupTeachers}
          defaultTeacherId={defaultMakeupTeacherId}
          teacherMode={makeupTeacherMode}
          canCreate={canCreateMakeupSchedule}
          canEdit={canManageMakeupSchedule}
          canViewEventDetails={canOpenReadonlyClassForms}
          canDelete={canManageMakeupSchedule}
          canEditEvent={canManageOwnUnlinkedMakeupEvent}
          canDeleteEvent={canManageOwnUnlinkedMakeupEvent}
          canResync={canResyncMakeupSchedule}
          canResyncEvent={(event) =>
            canWorkOnAllClassSessions ||
            (Boolean(actorStaffId) && event.teacherId === actorStaffId)
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
          title="Lịch sử & Nội dung"
          className="w-full"
        >
          <div className="mb-3 flex flex-col gap-3">
            <ClassTabList
              tabs={CLASS_DETAIL_TABS}
              labels={CLASS_DETAIL_TAB_LABELS}
              activeTab={activeTab}
              onSelect={selectTab}
              idPrefix="staff-class-detail-tab"
              panelId="staff-class-detail-tabpanel"
              ariaLabel="Buổi học hoặc chuyên đề"
            />

            {activeTab === "buoi-hoc" ? (
              <div className="flex items-center justify-between rounded-lg border border-border-default bg-bg-secondary/55 px-2.5 py-2 sm:py-1.5">
                <MonthNav
                  value={selectedMonth}
                  onChange={setSelectedMonth}
                  monthPopupOpen={monthPopupOpen}
                  setMonthPopupOpen={setMonthPopupOpen}
                  countLabel={historyCountLabel}
                  actionButton={
                    canCreateSession || canManageSurveys ? (
                      <div className="flex w-full items-center gap-2 sm:w-auto">
                        {canCreateSession ? (
                          <button
                            type="button"
                            onClick={() => setAddSessionPopupOpen(true)}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg sm:min-h-9 sm:flex-none bg-primary px-3 py-1.5 text-xs font-semibold text-text-inverse shadow-sm transition-colors hover:bg-primary-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          >
                            <PlusIcon className="size-3.5 shrink-0" aria-hidden />
                            <span>Tạo buổi học</span>
                          </button>
                        ) : null}
                        {canManageSurveys ? (
                          <button
                            type="button"
                            onClick={() => setAddSurveyPopupOpen(true)}
                            className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg sm:min-h-9 sm:flex-none border border-border-default bg-bg-surface px-3 py-1.5 text-xs font-semibold text-text-primary shadow-sm transition-colors hover:bg-bg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-border-focus"
                          >
                            <PlusIcon className="size-3.5 shrink-0" aria-hidden />
                            <span>Tạo khảo sát</span>
                          </button>
                        ) : null}
                      </div>
                    ) : null
                  }
                />
              </div>
            ) : null}
          </div>

          <section
            id="staff-class-detail-tabpanel"
            role="tabpanel"
            aria-labelledby={`staff-class-detail-tab-${activeTab}`}
          >
            {activeTab === "buoi-hoc" ? (
              <>
                {(isAdmin || isAssistant || isCustomerCare) && (
                  <ClassSessionStatisticsButton classDetail={classDetail} scope="staff" />
                )}
                <QueryRefreshStrip
                  active={
                    (isSessionsFetching || isSurveysFetching) &&
                    !(isSessionsLoading || isSurveysLoading)
                  }
                  label="Đang tải lại dữ liệu…"
                  className="mb-3"
                />
                <ClassSurveyPanel
                  className={classDetail.name}
                  surveys={surveys}
                  availableSurveys={availableSurveys}
                  availableSurveysStatus={availableSurveysStatus}
                  teachers={popupTeachers}
                  students={popupStudents}
                  error={isSurveysError}
                  canManage={canManageSurveys}
                  canViewDetails={canOpenReadonlyClassForms}
                  createOpen={addSurveyPopupOpen}
                  onCreateOpenChange={setAddSurveyPopupOpen}
                  defaultTeacherId={defaultTeacherId}
                  onCreate={handleCreateSurvey}
                  onUpdate={handleUpdateSurvey}
                  onDelete={handleDeleteSurvey}
                  renderList={(surveyRows) =>
                    isSessionsLoading || isSurveysLoading ? (
                      <SessionHistoryTableSkeleton
                        rows={5}
                        entityMode="teacher"
                        variant="classDetail"
                        showActionsColumn={canManageSessions || canOpenReadonlyClassForms}
                      />
                    ) : (
                      <div
                        className={cn(
                          "transition-opacity",
                          (isSessionsFetching || isSurveysFetching) && "opacity-70",
                        )}
                      >
                        <SessionHistoryTable
                          sessions={sessions}
                          extraRows={surveyRows}
                          entityMode="teacher"
                          variant="classDetail"
                          statusMode="payment"
                          emptyText={teacherScopedEmptyText}
                          editorLayout="wide"
                          showActionsColumn={canManageSessions || canOpenReadonlyClassForms}
                          teachers={popupTeachers}
                          getClassStudents={getClassStudentsForEditor}
                          getClassDetailForEdit={getClassDetailForEdit}
                          allowTeacherSelection={false}
                          allowFinancialEdits={false}
                          allowPaymentStatusEdit={false}
                          allowDeleteSession={canDeleteSessionsAsHeadRole}
                          canDeleteSessionItem={canHeadDeleteSession}
                          readOnlySessionDetails={
                            canOpenReadonlyClassForms || !canManageSessions
                          }
                          allowTrialTeachingToggle
                          canToggleTrialForSession={canToggleTrialForSession}
                          showTrainingManagerAllowance={isTrainingView && isManagingTrainer}
                          isReviewOnlySession={isReviewOnlySession}
                          updateSessionFn={handleUpdateSession}
                        />
                      </div>
                    )
                  }
                />
                {isSessionsError ? (
                  <p className="mt-3 text-sm text-error">Không tải được lịch sử buổi học.</p>
                ) : null}
              </>
            ) : (
              <ClassModulesTab
                classId={id}
                canManageContent={isTeacherWorkspaceActor}
                practiceActionsBasePath={`/staff/classes/${id}`}
              />
            )}
          </section>
        </ClassCard>
      </div>
    </div>
  );
}
