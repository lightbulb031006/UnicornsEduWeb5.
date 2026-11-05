import {
  SessionBulkPaymentStatusUpdatePayload,
  SessionBulkPaymentStatusUpdateResult,
  SessionCreatePayload,
  SessionItem,
  SessionNextOrdinalResponse,
  CreateMissedTeachingExplanationPayload,
  MissedTeachingAlert,
  MissedTeachingExplanationRecord,
  SessionMonthYearParams,
  UpdateMissedTeachingExplanationPayload,
  SessionUnpaidSummaryItem,
  SessionUnpaidSummaryParams,
  SessionUpdatePayload,
} from "@/dtos/session.dto";
import { api } from "../client";

export async function getSessionsByClassId(
  classId: string,
  params: SessionMonthYearParams,
): Promise<SessionItem[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get(`/sessions/class/${safeId}`, {
    params,
  });
  const payload = response.data;
  return Array.isArray(payload) ? payload : [];
}

/** Số thứ tự buổi nếu tạo buổi mới tại ngày/giờ cho trước. */
export async function getNextSessionOrdinal(
  classId: string,
  params: { date: string; startTime?: string },
): Promise<SessionNextOrdinalResponse> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get<SessionNextOrdinalResponse>(
    `/sessions/class/${safeId}/next-ordinal`,
    { params },
  );
  return response.data;
}

export async function getSessionsByStaffId(
  staffId: string,
  params: SessionMonthYearParams,
): Promise<SessionItem[]> {
  const safeId = encodeURIComponent(staffId);
  const response = await api.get(`/sessions/staff/${safeId}`, {
    params,
  });
  const payload = response.data;
  return Array.isArray(payload) ? payload : [];
}

export async function getUnpaidSessionsByStaffId(
  staffId: string,
  params?: SessionUnpaidSummaryParams,
): Promise<SessionUnpaidSummaryItem[]> {
  const safeId = encodeURIComponent(staffId);
  const response = await api.get(`/sessions/staff/${safeId}/unpaid`, {
    params,
  });
  const payload = response.data;
  return Array.isArray(payload) ? payload : [];
}

export async function getMissedTeachingAlertsByClassId(
  classId: string,
  params?: { days?: number },
): Promise<MissedTeachingAlert[]> {
  const safeId = encodeURIComponent(classId);
  const response = await api.get(`/sessions/class/${safeId}/missed-teaching-alerts`, {
    params,
  });
  const payload = response.data;
  return Array.isArray(payload) ? (payload as MissedTeachingAlert[]) : [];
}

export async function getMissedTeachingAlertsByStaffId(
  staffId: string,
  params?: { days?: number },
): Promise<MissedTeachingAlert[]> {
  const safeId = encodeURIComponent(staffId);
  const response = await api.get(`/sessions/staff/${safeId}/missed-teaching-alerts`, {
    params,
  });
  const payload = response.data;
  return Array.isArray(payload) ? (payload as MissedTeachingAlert[]) : [];
}

export async function createMissedTeachingExplanation(
  classId: string,
  data: CreateMissedTeachingExplanationPayload,
): Promise<MissedTeachingExplanationRecord> {
  const safeId = encodeURIComponent(classId);
  const response = await api.post(
    `/sessions/class/${safeId}/missed-teaching-explanations`,
    data,
  );
  return response.data as MissedTeachingExplanationRecord;
}

export async function updateMissedTeachingExplanation(
  explanationId: string,
  data: UpdateMissedTeachingExplanationPayload,
): Promise<MissedTeachingExplanationRecord> {
  const safeId = encodeURIComponent(explanationId);
  const response = await api.patch(
    `/sessions/missed-teaching-explanations/${safeId}`,
    data,
  );
  return response.data as MissedTeachingExplanationRecord;
}

export async function createSession(
  data: SessionCreatePayload,
): Promise<SessionItem> {
  const response = await api.post("/sessions", data);
  return response.data as SessionItem;
}

export async function updateSession(
  id: string,
  data: SessionUpdatePayload,
): Promise<SessionItem> {
  const safeId = encodeURIComponent(id);
  const response = await api.put(`/sessions/${safeId}`, data);
  return response.data as SessionItem;
}

export async function bulkUpdateSessionPaymentStatus(
  data: SessionBulkPaymentStatusUpdatePayload,
): Promise<SessionBulkPaymentStatusUpdateResult> {
  const response = await api.patch("/sessions/payment-status/bulk", data);
  return response.data as SessionBulkPaymentStatusUpdateResult;
}

export async function deleteSession(id: string): Promise<void> {
  const safeId = encodeURIComponent(id);
  await api.delete(`/sessions/${safeId}`);
}
