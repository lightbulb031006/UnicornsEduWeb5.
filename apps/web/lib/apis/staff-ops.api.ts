import type { ClassDetail, ClassListResponse } from "@/dtos/class.dto";
import type {
  ClassScopedMakeupScheduleEventPayload,
  ClassScopedMakeupScheduleEventUpdatePayload,
  MakeupScheduleEventRecord,
} from "@/dtos/class-schedule.dto";
import type {
  ClassSurveyMonthYearParams,
  ClassSurveyRecord,
  CreateClassSurveyPayload,
  UpdateClassSurveyPayload,
} from "@/dtos/class-survey.dto";
import type { SessionItem } from "@/dtos/session.dto";
import type {
  StaffOpsCreateClassPayload,
  StaffOpsCreateSessionPayload,
  StaffOpsSessionMonthYearParams,
  StaffOpsUpdateClassSchedulePayload,
  StaffOpsUpdateSessionPayload,
} from "@/dtos/staff-ops.dto";
import {
  normalizeMakeupScheduleEvent,
  normalizeMakeupScheduleFeedResponse,
} from "./class-schedule.api";
import { normalizeClassSurvey } from "./class.api";
import { api } from "../client";

export async function getClasses(params: {
  page: number;
  limit: number;
  search?: string;
  status?: string;
  type?: string;
}): Promise<ClassListResponse> {
  const response = await api.get("/staff-ops/classes", {
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
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? params.page,
      limit: payload?.meta?.limit ?? params.limit,
    },
  };
}

export async function getClassById(id: string): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.get(`/staff-ops/classes/${safeId}`);
  return response.data as ClassDetail;
}

export async function getClassSurveys(
  classId: string,
  params: ClassSurveyMonthYearParams,
): Promise<ClassSurveyRecord[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get(`/staff-ops/classes/${safeId}/surveys`, {
    params,
  });
  return Array.isArray(response.data)
    ? response.data.map((item) => normalizeClassSurvey(item))
    : [];
}

export async function createClassSurvey(
  classId: string,
  data: CreateClassSurveyPayload,
): Promise<ClassSurveyRecord> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post(`/staff-ops/classes/${safeId}/surveys`, data);
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
    `/staff-ops/classes/${safeClassId}/surveys/${safeSurveyId}`,
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
  await api.delete(`/staff-ops/classes/${safeClassId}/surveys/${safeSurveyId}`);
}

export async function createClass(
  data: StaffOpsCreateClassPayload,
): Promise<ClassDetail> {
  const response = await api.post("/staff-ops/classes", data);
  return response.data as ClassDetail;
}

export async function updateClassSchedule(
  id: string,
  data: StaffOpsUpdateClassSchedulePayload,
): Promise<ClassDetail> {
  const safeId = encodeURIComponent(id);
  const response = await api.patch(`/staff-ops/classes/${safeId}/schedule`, data);
  return response.data as ClassDetail;
}

export async function getSessionsByClassId(
  classId: string,
  params: StaffOpsSessionMonthYearParams,
): Promise<SessionItem[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get(`/staff-ops/classes/${safeId}/sessions`, {
    params,
  });
  return Array.isArray(response.data) ? (response.data as SessionItem[]) : [];
}

export async function createSession(
  classId: string,
  data: StaffOpsCreateSessionPayload,
): Promise<SessionItem> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post(`/staff-ops/classes/${safeId}/sessions`, data);
  return response.data as SessionItem;
}

export async function updateSession(
  id: string,
  data: StaffOpsUpdateSessionPayload,
): Promise<SessionItem> {
  const safeId = encodeURIComponent(id);
  const response = await api.put(`/staff-ops/sessions/${safeId}`, data);
  return response.data as SessionItem;
}

export async function getClassMakeupEvents(
  classId: string,
  params: { startDate: string; endDate: string; page?: number; limit?: number },
): Promise<{ data: MakeupScheduleEventRecord[]; total: number }> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get<{ data?: unknown[]; total?: number }>(
    `/staff-ops/classes/${safeId}/makeup-events`,
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
    `/staff-ops/classes/${safeId}/makeup-events`,
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
    `/staff-ops/classes/${safeClassId}/makeup-events/${safeEventId}`,
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
  await api.delete(`/staff-ops/classes/${safeClassId}/makeup-events/${safeEventId}`);
}
