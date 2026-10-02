import {
  AssignCourseLessonPlanMembersPayload,
  Course,
  CourseDetail,
  CourseDifficultyLevel,
  ClassEndEligibility,
  ClassListItem,
  ClassListResponse,
  ClassStatus,
  ClassStatusActionPayload,
  ClassTeacher,
  ClassTeacherPayload,
  CreateCourseDifficultyLevelPayload,
  CreateCoursePayload,
  LessonPlanStaffOption,
  UpdateCourseDifficultyLevelPayload,
  UpdateCoursePayload,
} from '@/dtos/class.dto';
import {
  ClassDetail,
  CreateClassPayload,
  UpdateClassBasicInfoPayload,
  UpdateClassPayload,
  UpdateClassPricingModePayload,
  UpdateClassSchedulePayload,
  UpdateClassStudentTuitionPayload,
  UpdateClassStudentsPayload,
  UpdateClassTeacherCompensationPayload,
  UpdateClassTeachersPayload,
} from '@/dtos/class.dto';
import type {
  ClassScheduleGoogleCalendarResyncSummary,
  ClassScopedMakeupScheduleEventPayload,
  ClassScopedMakeupScheduleEventUpdatePayload,
  GoogleCalendarResyncResponse,
  MakeupGoogleCalendarResyncSummary,
  MakeupScheduleEventRecord,
} from "@/dtos/class-schedule.dto";
import type {
  ClassSurveyMonthYearParams,
  ClassSurveyRecord,
  CreateClassSurveyPayload,
  UpdateClassSurveyPayload,
} from "@/dtos/class-survey.dto";
import { normalizeMakeupScheduleEvent, normalizeMakeupScheduleFeedResponse } from "./class-schedule.api";
import { api } from "../client";
import { contentApiPaths } from "@/lib/content-api-paths";
import type { ClassContentItemDto, ClassContentCreatePayload, ClassContentScheduleUpdatePayload } from "@/dtos/class-content.dto";
import type { ClassTheoryProgressDto } from "@/dtos/class-theory-progress.dto";
import type {
  ClassTimelineItemDto,
  ClassTimelinePageDto,
} from "@/dtos/class-timeline.dto";
import type { CourseLessonForClassDto } from "@/dtos/course-content.dto";

function normalizeOperatingDeductionRatePercent(
  teacher: Record<string, unknown>,
): number | null | undefined {
  const rawValue =
    teacher.operatingDeductionRatePercent ??
    teacher.taxRatePercent ??
    teacher.operating_deduction_rate_percent ??
    teacher.tax_rate_percent;

  if (rawValue == null) {
    return null;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  return numericValue;
}

function normalizeTrainingManagerRatePercent(
  record: Record<string, unknown>,
): number | null | undefined {
  const rawValue =
    record.trainingManagerRatePercent ??
    record.training_manager_rate_percent ??
    null;

  if (rawValue == null) {
    return null;
  }

  const numericValue = Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return undefined;
  }

  return numericValue;
}

function normalizeClassTeacher(teacher: unknown): ClassTeacher {
  const source = (teacher ?? {}) as Record<string, unknown>;
  const operatingDeductionRatePercent =
    normalizeOperatingDeductionRatePercent(source);

  return {
    ...(source as unknown as ClassTeacher),
    ...(operatingDeductionRatePercent !== undefined
      ? {
          operatingDeductionRatePercent,
        }
      : {}),
  };
}

function normalizeClassEndEligibility(
  source: Record<string, unknown>,
): ClassEndEligibility | undefined {
  const raw =
    source.endClassEligibility ?? source.end_class_eligibility ?? undefined;

  if (!raw || typeof raw !== "object") {
    return undefined;
  }

  const eligibility = raw as Record<string, unknown>;

  return {
    canEnd: Boolean(eligibility.canEnd ?? eligibility.can_end ?? false),
    sessionCount: Number(
      eligibility.sessionCount ?? eligibility.session_count ?? 0,
    ),
    unpaidSessionCount: Number(
      eligibility.unpaidSessionCount ?? eligibility.unpaid_session_count ?? 0,
    ),
    blockReason:
      typeof eligibility.blockReason === "string"
        ? eligibility.blockReason
        : typeof eligibility.block_reason === "string"
          ? eligibility.block_reason
          : null,
    canEndClass:
      eligibility.canEndClass == null && eligibility.can_end_class == null
        ? undefined
        : Boolean(eligibility.canEndClass ?? eligibility.can_end_class),
  };
}

function normalizeClassRecord<T extends ClassListItem>(record: T): T {
  const source = record as T & Record<string, unknown>;
  const endClassEligibility = normalizeClassEndEligibility(source);
  const trainingManagerRatePercent =
    normalizeTrainingManagerRatePercent(source);
  const withTeachers = Array.isArray(record.teachers)
    ? {
        ...record,
        teachers: record.teachers.map((teacher) => normalizeClassTeacher(teacher)),
      }
    : record;

  return {
    ...withTeachers,
    ...(endClassEligibility ? { endClassEligibility } : {}),
    ...(trainingManagerRatePercent !== undefined
      ? { trainingManagerRatePercent }
      : {}),
  };
}

function normalizeClassTeacherPayload(
  teacher: ClassTeacherPayload,
): ClassTeacherPayload {
  const operatingDeductionRatePercent = teacher.operating_deduction_rate_percent;

  if (operatingDeductionRatePercent == null) {
    return teacher;
  }

  return {
    ...teacher,
    operating_deduction_rate_percent: operatingDeductionRatePercent,
  };
}

function normalizeTeachersPayload<T extends { teachers?: ClassTeacherPayload[] }>(
  payload: T,
): T {
  if (!Array.isArray(payload.teachers)) {
    return payload;
  }

  return {
    ...payload,
    teachers: payload.teachers.map((teacher) =>
      normalizeClassTeacherPayload(teacher),
    ),
  };
}

export function normalizeClassSurvey(survey: unknown): ClassSurveyRecord {
  const source = (survey ?? {}) as Record<string, unknown>;
  const rawReportDate = source.reportDate ?? source.report_date;
  const rawStudents = Array.isArray(source.students) ? source.students : [];

  return {
    id: String(source.id ?? ""),
    classId: source.classId == null ? null : String(source.classId),
    surveyId: source.surveyId == null ? null : String(source.surveyId),
    survey:
      source.survey && typeof source.survey === "object"
        ? (source.survey as ClassSurveyRecord["survey"])
        : null,
    testNumber:
      source.testNumber == null && source.test_number == null
        ? null
        : Number(source.testNumber ?? source.test_number),
    teacherId: source.teacherId == null ? null : String(source.teacherId),
    reportDate:
      typeof rawReportDate === "string" ? rawReportDate.slice(0, 10) : "",
    content: typeof source.content === "string" ? source.content : null,
    knowledgeAssessment:
      typeof source.knowledgeAssessment === "string"
        ? source.knowledgeAssessment
        : null,
    createdAt:
      typeof source.createdAt === "string"
        ? source.createdAt
        : typeof source.created_at === "string"
          ? source.created_at
          : null,
    teacher:
      source.teacher && typeof source.teacher === "object"
        ? (source.teacher as ClassSurveyRecord["teacher"])
        : null,
    students: rawStudents.map((item) => {
      const student = (item ?? {}) as Record<string, unknown>;
      return {
        studentId: String(student.studentId ?? ""),
        fullName:
          typeof student.fullName === "string" ? student.fullName : "",
        comment: typeof student.comment === "string" ? student.comment : null,
      };
    }),
  };
}

export async function getClasses(params: {
  page: number;
  limit: number;
  search?: string;
  status?: "" | ClassStatus;
  courseId?: string;
}): Promise<ClassListResponse> {
  const response = await api.get("/class", {
    params: {
      page: params.page,
      limit: params.limit,
      ...(params.search ? { search: params.search } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.courseId
        ? { courseId: params.courseId }
        : {}),
    },
  });

  const payload = response.data as ClassListResponse;
  return {
    data: Array.isArray(payload?.data)
      ? payload.data.map((item) => normalizeClassRecord(item))
      : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? params.page,
      limit: payload?.meta?.limit ?? params.limit,
    },
  };
}

export async function getCourses(
  includeInactive = false,
): Promise<Course[]> {
  const response = await api.get<Course[]>("/courses", {
    params: includeInactive ? { includeInactive: "true" } : undefined,
  });
  return Array.isArray(response.data) ? response.data : [];
}

export async function createCourse(
  data: CreateCoursePayload,
): Promise<Course> {
  const response = await api.post<Course>("/courses", data);
  return response.data;
}

export async function updateCourse(
  id: string,
  data: UpdateCoursePayload,
): Promise<Course> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch<Course>(
    `/courses/${safeId}`,
    data,
  );
  return response.data;
}

export async function deleteCourse(id: string): Promise<void> {
  const safeId = encodeURIComponent(id);
  await api.delete(`/courses/${safeId}`);
}

export async function getCourseById(id: string): Promise<CourseDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.get<CourseDetail>(`/courses/${safeId}`);
  return response.data;
}

export async function searchLessonPlanStaff(params: {
  search?: string;
  limit?: number;
}): Promise<LessonPlanStaffOption[]> {
  const response = await api.get<LessonPlanStaffOption[]>(
    "/courses/lesson-plan-staff",
    {
      params: {
        ...(params.search?.trim() ? { search: params.search.trim() } : {}),
        ...(typeof params.limit === "number" ? { limit: params.limit } : {}),
      },
    },
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function getCourseDifficultyLevels(
  courseId: string,
  includeInactive = false,
): Promise<CourseDifficultyLevel[]> {
  const safeId = encodeURIComponent(courseId);
  const response = await api.get<CourseDifficultyLevel[]>(
    `/courses/${safeId}/difficulty-levels`,
    { params: includeInactive ? { includeInactive: "true" } : undefined },
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function createCourseDifficultyLevel(
  courseId: string,
  data: CreateCourseDifficultyLevelPayload,
): Promise<CourseDifficultyLevel> {
  const safeId = encodeURIComponent(courseId);
  const response = await api.post<CourseDifficultyLevel>(
    `/courses/${safeId}/difficulty-levels`,
    data,
  );
  return response.data;
}

export async function updateCourseDifficultyLevel(
  courseId: string,
  levelId: string,
  data: UpdateCourseDifficultyLevelPayload,
): Promise<CourseDifficultyLevel> {
  const safeCourseId = encodeURIComponent(courseId);
  const safeLevelId = encodeURIComponent(levelId);
  const response = await api.patch<CourseDifficultyLevel>(
    `/courses/${safeCourseId}/difficulty-levels/${safeLevelId}`,
    data,
  );
  return response.data;
}

export async function reorderCourseDifficultyLevels(
  courseId: string,
  levels: { id: string; sort_order: number }[],
): Promise<CourseDifficultyLevel[]> {
  const safeId = encodeURIComponent(courseId);
  const response = await api.patch<CourseDifficultyLevel[]>(
    `/courses/${safeId}/difficulty-levels/reorder`,
    { levels },
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function deleteCourseDifficultyLevel(
  courseId: string,
  levelId: string,
): Promise<void> {
  const safeCourseId = encodeURIComponent(courseId);
  const safeLevelId = encodeURIComponent(levelId);
  await api.delete(`/courses/${safeCourseId}/difficulty-levels/${safeLevelId}`);
}

export async function assignCourseLessonPlanMembers(
  courseId: string,
  data: AssignCourseLessonPlanMembersPayload,
): Promise<CourseDetail["lessonPlanMembers"]> {
  const safeId = encodeURIComponent(courseId);
  const response = await api.put(
    `/courses/${safeId}/lesson-plan-members`,
    data,
  );
  return response.data;
}

export async function getClassContent(classId: string): Promise<ClassContentItemDto[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get<ClassContentItemDto[]>(`/class/${safeId}/content`);
  return response.data;
}

export async function createClassContent(
  classId: string,
  payload: ClassContentCreatePayload,
): Promise<ClassContentItemDto> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post<ClassContentItemDto>(`/class/${safeId}/content`, payload);
  return response.data;
}

export async function reorderClassContent(
  classId: string,
  orderedIds: string[],
): Promise<ClassContentItemDto[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post<ClassContentItemDto[]>(`/class/${safeId}/content/reorder`, {
    orderedIds,
  });
  return response.data;
}

export async function updateClassContentSchedule(
  classId: string,
  itemId: string,
  payload: ClassContentScheduleUpdatePayload,
): Promise<ClassContentItemDto> {
  const safeClassId = encodeURIComponent(classId);
  const safeItemId = encodeURIComponent(itemId);
  const response = await api.patch<ClassContentItemDto>(
    `/class/${safeClassId}/content/${safeItemId}`,
    payload,
  );
  return response.data;
}

export async function getClassTheoryProgress(
  classId: string,
  itemId: string,
): Promise<ClassTheoryProgressDto> {
  const safeClassId = encodeURIComponent(classId);
  const safeItemId = encodeURIComponent(itemId);
  const response = await api.get<ClassTheoryProgressDto>(
    `/class/${safeClassId}/content/${safeItemId}/theory-progress`,
  );
  return response.data;
}

export async function deleteClassContentItem(
  classId: string,
  itemId: string,
): Promise<ClassContentItemDto[]> {
  const safeClassId = encodeURIComponent(classId);
  const safeItemId = encodeURIComponent(itemId);
  const response = await api.delete<ClassContentItemDto[]>(
    `/class/${safeClassId}/content/${safeItemId}`,
  );
  return response.data;
}

export async function restoreClassContentItem(
  classId: string,
  itemId: string,
): Promise<ClassContentItemDto[]> {
  const safeClassId = encodeURIComponent(classId);
  const safeItemId = encodeURIComponent(itemId);
  const response = await api.post<ClassContentItemDto[]>(
    `/class/${safeClassId}/content/${safeItemId}/restore`,
  );
  return response.data;
}

export async function getStudentClassContent(classId: string): Promise<ClassContentItemDto[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get<ClassContentItemDto[]>(`/class/${safeId}/content/student`);
  return response.data;
}

export async function getClassTimeline(classId: string): Promise<ClassTimelineItemDto[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get<ClassTimelineItemDto[]>(`/class/${safeId}/timeline`);
  return Array.isArray(response.data) ? response.data : [];
}

export async function reorderClassTimeline(
  classId: string,
  orderedIds: string[],
): Promise<ClassTimelineItemDto[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post<ClassTimelineItemDto[]>(
    `/class/${safeId}/timeline/reorder`,
    { orderedIds },
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function getStudentClassTimeline(
  classId: string,
  params?: { cursor?: string; limit?: number },
): Promise<ClassTimelinePageDto> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get<ClassTimelinePageDto>(
    `/class/${safeId}/timeline/student`,
    { params },
  );
  return {
    items: Array.isArray(response.data?.items) ? response.data.items : [],
    nextCursor: response.data?.nextCursor ?? null,
  };
}

export async function getCourseLessonsForClass(classId: string): Promise<CourseLessonForClassDto[]> {
  const response = await api.get<CourseLessonForClassDto[]>(
    contentApiPaths.classCourseLessons(classId),
  );
  return response.data;
}

export async function getClassLesson(
  classId: string,
  lessonId: string,
): Promise<CourseLesson> {
  const safeClassId = encodeURIComponent(classId);
  const safeLessonId = encodeURIComponent(lessonId);
  const response = await api.get<CourseLesson>(
    `/class/${safeClassId}/lessons/${safeLessonId}`,
  );
  return response.data;
}

export async function updateClassLesson(
  classId: string,
  lessonId: string,
  data: UpdateCourseLessonPayload,
): Promise<CourseLesson> {
  const safeClassId = encodeURIComponent(classId);
  const safeLessonId = encodeURIComponent(lessonId);
  const response = await api.patch<CourseLesson>(
    `/class/${safeClassId}/lessons/${safeLessonId}`,
    data,
  );
  return response.data;
}

export async function getClassById(id: string): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.get(`/class/${safeId}`);
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function getClassSurveys(
  classId: string,
  params: ClassSurveyMonthYearParams,
): Promise<ClassSurveyRecord[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get(`/class/${safeId}/surveys`, { params });
  return Array.isArray(response.data)
    ? response.data.map((item) => normalizeClassSurvey(item))
    : [];
}

export async function createClassSurvey(
  classId: string,
  data: CreateClassSurveyPayload,
): Promise<ClassSurveyRecord> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post(`/class/${safeId}/surveys`, data);
  return normalizeClassSurvey(response.data);
}

export async function updateClassSurvey(
  classId: string,
  surveyId: string,
  data: UpdateClassSurveyPayload,
): Promise<ClassSurveyRecord> {
  const safeClassId = encodeURIComponent(classId);
  const safeSurveyId = encodeURIComponent(surveyId);
  const response = await api.patch(
    `/class/${safeClassId}/surveys/${safeSurveyId}`,
    data,
  );
  return normalizeClassSurvey(response.data);
}

export async function deleteClassSurvey(
  classId: string,
  surveyId: string,
): Promise<void> {
  const safeClassId = encodeURIComponent(classId);
  const safeSurveyId = encodeURIComponent(surveyId);
  await api.delete(`/class/${safeClassId}/surveys/${safeSurveyId}`);
}

export async function createClass(data: CreateClassPayload): Promise<ClassDetail> {
  const response = await api.post('/class', normalizeTeachersPayload(data));
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function deleteClassById(id: string) {
  const safeId = encodeURIComponent(id);
  const response = await api.delete(`/class/${safeId}`);
  return response.data;
}

export async function endClass(
  id: string,
  data: ClassStatusActionPayload = {},
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.post(`/class/${safeId}/end`, data);
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function stopClassTeacher(
  classId: string,
  teacherId: string,
  data: ClassStatusActionPayload = {},
): Promise<ClassDetail> {
  const safeClassId = encodeURIComponent(classId);
  const safeTeacherId = encodeURIComponent(teacherId);
  const response = await api.post(
    `/class/${safeClassId}/teachers/${safeTeacherId}/stop-teaching`,
    data,
  );
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function updateClass(data: UpdateClassPayload): Promise<ClassDetail> {
  const response = await api.patch("/class", normalizeTeachersPayload(data));
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function updateClassBasicInfo(
  id: string,
  data: UpdateClassBasicInfoPayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(`/class/${safeId}/basic-info`, data);
  return response.data;
}

export async function updateClassPricingMode(
  id: string,
  data: UpdateClassPricingModePayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(`/class/${safeId}/pricing-mode`, data);
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function updateClassTeachers(
  id: string,
  data: UpdateClassTeachersPayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(
    `/class/${safeId}/teachers`,
    normalizeTeachersPayload(data),
  );
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function updateClassTeacherCompensation(
  id: string,
  data: UpdateClassTeacherCompensationPayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(
    `/class/${safeId}/teacher-compensation`,
    data,
  );
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function updateClassSchedule(
  id: string,
  data: UpdateClassSchedulePayload,
): Promise<{ class: ClassDetail; warnings: string[] }> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch<{ class: ClassDetail; warnings: string[] }>(`/class/${safeId}/schedule`, data);
  return response.data;
}

export async function resyncClassScheduleGoogleCalendar(
  id: string,
): Promise<
  GoogleCalendarResyncResponse<ClassScheduleGoogleCalendarResyncSummary>
> {
  const safeId = encodeURIComponent(id);
  const response = await api.post<
    GoogleCalendarResyncResponse<ClassScheduleGoogleCalendarResyncSummary>
  >(`/class/${safeId}/schedule/google-calendar/resync`);
  return response.data;
}

export async function updateClassStudents(
  id: string,
  data: UpdateClassStudentsPayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(`/class/${safeId}/students`, data);
  return response.data;
}

export async function updateClassStudentTuition(
  id: string,
  data: UpdateClassStudentTuitionPayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(`/class/${safeId}/student-tuition`, data);
  return normalizeClassRecord(response.data as ClassDetail);
}

export async function getClassMakeupEvents(
  classId: string,
  params: { startDate: string; endDate: string; page?: number; limit?: number },
): Promise<{ data: MakeupScheduleEventRecord[]; total: number }> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get<{ data?: unknown[]; total?: number }>(
    `/class/${safeId}/makeup-events`,
    { params },
  );
  return normalizeMakeupScheduleFeedResponse(response.data);
}

export async function createClassMakeupEvent(
  classId: string,
  data: ClassScopedMakeupScheduleEventPayload,
): Promise<MakeupScheduleEventRecord> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post<{ data?: unknown }>(
    `/class/${safeId}/makeup-events`,
    data,
  );
  return normalizeMakeupScheduleEvent((response.data?.data ?? response.data) as Record<string, unknown>);
}

export async function updateClassMakeupEvent(
  classId: string,
  eventId: string,
  data: ClassScopedMakeupScheduleEventUpdatePayload,
): Promise<MakeupScheduleEventRecord> {
  const safeClassId = encodeURIComponent(classId);
  const safeEventId = encodeURIComponent(eventId);
  const response = await api.patch<{ data?: unknown }>(
    `/class/${safeClassId}/makeup-events/${safeEventId}`,
    data,
  );
  return normalizeMakeupScheduleEvent((response.data?.data ?? response.data) as Record<string, unknown>);
}

export async function deleteClassMakeupEvent(
  classId: string,
  eventId: string,
): Promise<void> {
  const safeClassId = encodeURIComponent(classId);
  const safeEventId = encodeURIComponent(eventId);
  await api.delete(`/class/${safeClassId}/makeup-events/${safeEventId}`);
}

export async function resyncClassMakeupGoogleCalendar(
  classId: string,
  eventId: string,
): Promise<GoogleCalendarResyncResponse<MakeupGoogleCalendarResyncSummary>> {
  const safeClassId = encodeURIComponent(classId);
  const safeEventId = encodeURIComponent(eventId);
  const response = await api.post<
    GoogleCalendarResyncResponse<MakeupGoogleCalendarResyncSummary>
  >(`/class/${safeClassId}/makeup-events/${safeEventId}/google-calendar/resync`);
  return response.data;
}

// ─────────────────────────────────────────────────────────────
// Knowledge Tree (Module / Lesson)
// ─────────────────────────────────────────────────────────────

import type {
  CourseModule,
  CreateCourseModulePayload,
  UpdateCourseModulePayload,
  CourseLesson,
  CreateCourseLessonPayload,
  UpdateCourseLessonPayload,
  QuestionLink,
  QuestionLinkSummary,
  CreateQuestionLinkPayload,
  UpdateQuestionLinkPayload,
  LessonQuizQuestion,
  ExamLibraryListResult,
  ExamLibraryFilters,
} from "@/dtos/course-content.dto";

export async function getModules(courseId: string): Promise<CourseModule[]> {
  const response = await api.get<CourseModule[]>(
    contentApiPaths.courseModules(courseId),
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function getModule(
  courseId: string,
  moduleId: string,
): Promise<CourseModule> {
  const response = await api.get<CourseModule>(
    contentApiPaths.courseModule(courseId, moduleId),
  );
  return response.data;
}

export async function createModule(
  courseId: string,
  data: CreateCourseModulePayload,
): Promise<CourseModule> {
  const response = await api.post<CourseModule>(
    contentApiPaths.courseModules(courseId),
    data,
  );
  return response.data;
}

export async function updateModule(
  courseId: string,
  moduleId: string,
  data: UpdateCourseModulePayload,
): Promise<CourseModule> {
  const response = await api.patch<CourseModule>(
    contentApiPaths.courseModule(courseId, moduleId),
    data,
  );
  return response.data;
}

export async function deleteModule(
  courseId: string,
  moduleId: string,
): Promise<void> {
  await api.delete(contentApiPaths.courseModule(courseId, moduleId));
}

export async function reorderModules(
  courseId: string,
  moduleIds: string[],
): Promise<void> {
  await api.post(contentApiPaths.courseModulesReorder(courseId), {
    moduleIds,
  });
}

export async function getLessonsByModule(
  courseId: string,
  moduleId: string,
): Promise<CourseLesson[]> {
  const response = await api.get<CourseLesson[]>(
    contentApiPaths.courseModuleLessons(courseId, moduleId),
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function getCourseLesson(
  courseId: string,
  moduleId: string,
  lessonId: string,
): Promise<CourseLesson> {
  const response = await api.get<CourseLesson>(
    contentApiPaths.courseModuleLesson(courseId, moduleId, lessonId),
  );
  return response.data;
}

export async function createCourseLesson(
  courseId: string,
  moduleId: string,
  data: CreateCourseLessonPayload,
): Promise<CourseLesson> {
  const response = await api.post<CourseLesson>(
    contentApiPaths.courseModuleLessons(courseId, moduleId),
    data,
  );
  return response.data;
}

export async function updateCourseLesson(
  courseId: string,
  moduleId: string,
  lessonId: string,
  data: UpdateCourseLessonPayload,
): Promise<CourseLesson> {
  const response = await api.patch<CourseLesson>(
    contentApiPaths.courseModuleLesson(courseId, moduleId, lessonId),
    data,
  );
  return response.data;
}

export async function deleteCourseLesson(
  courseId: string,
  moduleId: string,
  lessonId: string,
): Promise<void> {
  await api.delete(
    contentApiPaths.courseModuleLesson(courseId, moduleId, lessonId),
  );
}

export async function reorderCourseLessons(
  courseId: string,
  moduleId: string,
  lessonIds: string[],
): Promise<void> {
  await api.post(
    contentApiPaths.courseModuleLessonsReorder(courseId, moduleId),
    { lessonIds },
  );
}

export async function getPracticeLessonQuestions(
  lessonId: string,
): Promise<QuestionLink[]> {
  const response = await api.get<QuestionLink[]>(
    contentApiPaths.lessonQuestions(lessonId),
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function addPracticeLessonQuestion(
  lessonId: string,
  data: CreateQuestionLinkPayload,
): Promise<QuestionLink> {
  const response = await api.post<QuestionLink>(
    contentApiPaths.lessonQuestions(lessonId),
    data,
  );
  return response.data;
}

export async function updatePracticeLessonQuestion(
  lessonId: string,
  linkId: string,
  data: UpdateQuestionLinkPayload,
): Promise<QuestionLink> {
  const response = await api.patch<QuestionLink>(
    contentApiPaths.lessonQuestion(lessonId, linkId),
    data,
  );
  return response.data;
}

export async function removePracticeLessonQuestion(
  lessonId: string,
  linkId: string,
): Promise<void> {
  await api.delete(contentApiPaths.lessonQuestion(lessonId, linkId));
}

export async function reorderPracticeLessonQuestions(
  lessonId: string,
  linkIds: string[],
): Promise<void> {
  await api.post(contentApiPaths.lessonQuestionsReorder(lessonId), { linkIds });
}

export async function getPracticeLessonQuestionSummary(
  lessonId: string,
): Promise<QuestionLinkSummary> {
  const response = await api.get<QuestionLinkSummary>(
    contentApiPaths.lessonQuestionsSummary(lessonId),
  );
  return response.data;
}

export async function isPracticeLessonAssigned(
  lessonId: string,
): Promise<boolean> {
  const response = await api.get<{ assigned: boolean }>(
    contentApiPaths.lessonQuestionsIsAssigned(lessonId),
  );
  return response.data.assigned;
}

export async function getLessonQuizzes(
  lessonId: string,
): Promise<LessonQuizQuestion[]> {
  const response = await api.get<LessonQuizQuestion[]>(
    contentApiPaths.lessonQuizzes(lessonId),
  );
  return Array.isArray(response.data) ? response.data : [];
}

export async function linkQuizQuestions(
  lessonId: string,
  questionIds: string[],
): Promise<void> {
  await api.post(contentApiPaths.lessonQuizzes(lessonId), {
    questionIds,
  });
}

export async function unlinkQuizQuestion(
  lessonId: string,
  questionId: string,
): Promise<void> {
  await api.delete(contentApiPaths.lessonQuiz(lessonId, questionId));
}

export async function getExamLibrary(
  courseId: string,
  params?: ExamLibraryFilters,
): Promise<ExamLibraryListResult> {
  const safeId = encodeURIComponent(courseId);
  const response = await api.get(`/course/${safeId}/exam-library`, { params });
  return response.data;
}

export async function createExamLesson(
  courseId: string,
  data: CreateCourseLessonPayload,
): Promise<CourseLesson> {
  const safeId = encodeURIComponent(courseId);
  const response = await api.post<CourseLesson>(
    `/course/${safeId}/exam-library`,
    data,
  );
  return response.data;
}

export async function updateExamLesson(
  courseId: string,
  lessonId: string,
  data: UpdateCourseLessonPayload,
): Promise<CourseLesson> {
  const safeCourseId = encodeURIComponent(courseId);
  const safeLessonId = encodeURIComponent(lessonId);
  const response = await api.patch<CourseLesson>(
    `/course/${safeCourseId}/exam-library/${safeLessonId}`,
    data,
  );
  return response.data;
}

export async function deleteExamLesson(
  courseId: string,
  lessonId: string,
): Promise<void> {
  const safeCourseId = encodeURIComponent(courseId);
  const safeLessonId = encodeURIComponent(lessonId);
  await api.delete(`/course/${safeCourseId}/exam-library/${safeLessonId}`);
}

export async function reorderExamLessons(
  courseId: string,
  lessonIds: string[],
): Promise<void> {
  const safeId = encodeURIComponent(courseId);
  await api.post(`/course/${safeId}/exam-library/reorder`, { lessonIds });
}
