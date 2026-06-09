import type {
  AssistantBulkPaymentStatusUpdatePayload,
  AssistantBulkPaymentStatusUpdateResult,
  AssistantCommissionPaymentStatus,
  AssistantCommissionScope,
  AssistantManagedCustomerCareListResponse,
  AssistantManagedStudentListResponse,
  AssistantSessionShareItem,
} from "@/dtos/assistant-commission.dto";
import { api } from "../client";

function normalizePaymentStatus(
  value: string | null | undefined,
): AssistantCommissionPaymentStatus {
  return value === "paid" ? "paid" : "pending";
}

export async function getAssistantManagedCustomerCare(
  assistantStaffId: string,
  params: {
    scope?: AssistantCommissionScope;
    month?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<AssistantManagedCustomerCareListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const res = await api.get<AssistantManagedCustomerCareListResponse>(
    `/assistant-commission/staff/${encodeURIComponent(assistantStaffId)}/managed-customer-care`,
    {
      params: {
        scope: params.scope ?? "pending",
        month: params.month,
        page,
        limit,
      },
    },
  );
  const payload = res.data;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? page,
      limit: payload?.meta?.limit ?? limit,
    },
  };
}

export async function getAssistantManagedStudents(
  assistantStaffId: string,
  customerCareStaffId: string,
  params: {
    scope?: AssistantCommissionScope;
    month?: string;
    page?: number;
    limit?: number;
  } = {},
): Promise<AssistantManagedStudentListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const res = await api.get<AssistantManagedStudentListResponse>(
    `/assistant-commission/staff/${encodeURIComponent(assistantStaffId)}/managed-customer-care/${encodeURIComponent(customerCareStaffId)}/students`,
    {
      params: {
        scope: params.scope ?? "pending",
        month: params.month,
        page,
        limit,
      },
    },
  );
  const payload = res.data;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? page,
      limit: payload?.meta?.limit ?? limit,
    },
  };
}

export async function getAssistantSessionShares(
  assistantStaffId: string,
  customerCareStaffId: string,
  studentId: string,
  params: {
    scope?: AssistantCommissionScope;
    month?: string;
  } = {},
): Promise<AssistantSessionShareItem[]> {
  const res = await api.get<AssistantSessionShareItem[]>(
    `/assistant-commission/staff/${encodeURIComponent(assistantStaffId)}/managed-customer-care/${encodeURIComponent(customerCareStaffId)}/students/${encodeURIComponent(studentId)}/session-shares`,
    {
      params: {
        scope: params.scope ?? "pending",
        month: params.month,
      },
    },
  );

  return (Array.isArray(res.data) ? res.data : []).map((item) => ({
    ...item,
    paymentStatus: normalizePaymentStatus(item.paymentStatus),
  }));
}

export async function bulkUpdateAssistantSharePaymentStatus(
  assistantStaffId: string,
  payload: AssistantBulkPaymentStatusUpdatePayload,
): Promise<AssistantBulkPaymentStatusUpdateResult> {
  const res = await api.patch<AssistantBulkPaymentStatusUpdateResult>(
    `/assistant-commission/staff/${encodeURIComponent(assistantStaffId)}/payment-status/bulk`,
    payload,
  );
  return res.data;
}
