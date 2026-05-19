import {
  ClassListItem,
  ClassListResponse,
  ClassStatus,
  ClassTeacher,
  ClassTeacherPayload,
  ClassType,
} from '@/dtos/class.dto';
import {
  ClassDetail,
  CreateClassPayload,
  UpdateClassBasicInfoPayload,
  UpdateClassPayload,
  UpdateClassSchedulePayload,
  UpdateClassStudentsPayload,
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

function normalizeClassTeacher(teacher: unknown): ClassTeacher {
  const source = (teacher ?? {}) as Record<string, unknown>;
  const operatingDeductionRatePercent =
    normalizeOperatingDeductionRatePercent(source);

  return {
    ...(source as unknown as ClassTeacher),
    ...(operatingDeductionRatePercent !== undefined
      ? {
          operatingDeductionRatePercent,
          taxRatePercent: operatingDeductionRatePercent,
        }
      : {}),
  };
}

function normalizeClassRecord<T extends ClassListItem>(record: T): T {
  if (!Array.isArray(record.teachers)) {
    return record;
  }

  return {
    ...record,
    teachers: record.teachers.map((teacher) => normalizeClassTeacher(teacher)),
  };
}

function normalizeClassTeacherPayload(
  teacher: ClassTeacherPayload,
): ClassTeacherPayload {
  const operatingDeductionRatePercent =
    teacher.operating_deduction_rate_percent ?? teacher.tax_rate_percent;

  if (operatingDeductionRatePercent == null) {
    return teacher;
  }

  return {
    ...teacher,
    operating_deduction_rate_percent: operatingDeductionRatePercent,
    tax_rate_percent: operatingDeductionRatePercent,
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

  return {
    id: String(source.id ?? ""),
    classId: source.classId == null ? null : String(source.classId),
    testNumber: Number(source.testNumber ?? source.test_number ?? 0),
    teacherId: source.teacherId == null ? null : String(source.teacherId),
    reportDate:
      typeof rawReportDate === "string" ? rawReportDate.slice(0, 10) : "",
    content: typeof source.content === "string" ? source.content : "",
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
  };
}

export async function getClasses(params: {
  page: number;
  limit: number;
  search?: string;
  status?: "" | ClassStatus;
  type?: "" | ClassType;
}): Promise<ClassListResponse> {
  const response = await api.get("/class", {
    params: {
      page: params.page,
      limit: params.limit,
      ...(params.search ? { search: params.search } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.type ? { type: params.type } : {}),
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

export async function updateClassSchedule(
  id: string,
  data: UpdateClassSchedulePayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(`/class/${safeId}/schedule`, data);
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
