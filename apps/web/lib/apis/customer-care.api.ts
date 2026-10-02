import type {
  CustomerCareBulkPaymentStatusUpdatePayload,
  CustomerCareBulkPaymentStatusUpdateResult,
  CustomerCareBulkProfitPercentUpdatePayload,
  CustomerCareBulkProfitPercentUpdateResult,
  CustomerCareCommissionListParams,
  CustomerCarePaymentStatus,
  CustomerCareStudentListResponse,
  CustomerCareCommissionItem,
  CustomerCareSessionCommissionItem,
  CustomerCareStudentSummary,
  CustomerCareTopUpHistoryListResponse,
} from "@/dtos/customer-care.dto";
import { api } from "../client";

function normalizeCustomerCarePaymentStatus(
  value: string | null | undefined,
): CustomerCarePaymentStatus {
  return value === "paid" ? "paid" : "pending";
}

export async function getCustomerCareStudents(
  staffId: string,
  params: { page?: number; limit?: number } = {},
): Promise<CustomerCareStudentListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const res = await api.get<CustomerCareStudentListResponse>(
    `/customer-care/staff/${encodeURIComponent(staffId)}/students`,
    { params: { page, limit } },
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

export async function getCustomerCareStudentSummary(
  staffId: string,
  params: { month?: string } = {},
): Promise<CustomerCareStudentSummary> {
  const res = await api.get<CustomerCareStudentSummary>(
    `/customer-care/staff/${encodeURIComponent(staffId)}/summary`,
    { params },
  );
  const payload = res.data;
  return {
    monthKey: payload?.monthKey ?? "",
    activeStudentsCount: payload?.activeStudentsCount ?? 0,
    droppedStudentsThisMonth: payload?.droppedStudentsThisMonth ?? 0,
    revenueThisMonth: payload?.revenueThisMonth ?? 0,
  };
}

export async function getCustomerCareTopUpHistory(
  staffId: string,
  params: { page?: number; limit?: number } = {},
): Promise<CustomerCareTopUpHistoryListResponse> {
  const page = params.page ?? 1;
  const limit = params.limit ?? 20;
  const res = await api.get<CustomerCareTopUpHistoryListResponse>(
    `/customer-care/staff/${encodeURIComponent(staffId)}/topup-history`,
    { params: { page, limit } },
  );
  const payload = res.data;
  return {
    data: Array.isArray(payload?.data) ? payload.data : [],
    meta: {
      total: payload?.meta?.total ?? 0,
      page: payload?.meta?.page ?? page,
      limit: payload?.meta?.limit ?? limit,
      totalAmount: payload?.meta?.totalAmount ?? 0,
    },
  };
}

export async function getCustomerCareCommissions(
  staffId: string,
  params: CustomerCareCommissionListParams = {},
): Promise<import("@/dtos/customer-care.dto").CustomerCareCommissionListResponse> {
  const res = await api.get<
    | import("@/dtos/customer-care.dto").CustomerCareCommissionListResponse
    | CustomerCareCommissionItem[]
  >(`/customer-care/staff/${encodeURIComponent(staffId)}/commissions`, {
    params,
  });
  const payload = res.data;
  if (Array.isArray(payload)) {
    const data = payload.map((item) => ({
      ...item,
      monthCommission: item.monthCommission ?? item.totalCommission ?? 0,
      pendingCommission: item.pendingCommission ?? 0,
      paidCommission: item.paidCommission ?? 0,
    }));
    const summary = data.reduce(
      (acc, row) => ({
        studentCount: acc.studentCount + 1,
        totalPending: acc.totalPending + row.pendingCommission,
        totalMonthCommission: acc.totalMonthCommission + row.monthCommission,
      }),
      { studentCount: 0, totalPending: 0, totalMonthCommission: 0 },
    );
    return { data, summary };
  }
  return {
    data: (payload?.data ?? []).map((item) => ({
      ...item,
      monthCommission: item.monthCommission ?? item.totalCommission ?? 0,
      pendingCommission: item.pendingCommission ?? 0,
      paidCommission: item.paidCommission ?? 0,
    })),
    summary: payload?.summary ?? {
      studentCount: 0,
      totalPending: 0,
      totalMonthCommission: 0,
    },
  };
}

export async function getCustomerCareSessionCommissions(
  staffId: string,
  studentId: string,
  params: CustomerCareCommissionListParams = {},
): Promise<CustomerCareSessionCommissionItem[]> {
  const res = await api.get<CustomerCareSessionCommissionItem[]>(
    `/customer-care/staff/${encodeURIComponent(staffId)}/students/${encodeURIComponent(studentId)}/session-commissions`,
    {
      params: params.month
        ? { month: params.month }
        : params,
    },
  );
  return (res.data ?? []).map((item) => ({
    ...item,
    paymentStatus: normalizeCustomerCarePaymentStatus(item.paymentStatus),
  }));
}

export async function bulkUpdateCustomerCarePaymentStatus(
  staffId: string,
  payload: CustomerCareBulkPaymentStatusUpdatePayload,
): Promise<CustomerCareBulkPaymentStatusUpdateResult> {
  const res = await api.patch<CustomerCareBulkPaymentStatusUpdateResult>(
    `/customer-care/staff/${encodeURIComponent(staffId)}/payment-status/bulk`,
    payload,
  );
  return res.data;
}

export async function bulkUpdateCustomerCareProfitPercent(
  staffId: string,
  payload: CustomerCareBulkProfitPercentUpdatePayload,
): Promise<CustomerCareBulkProfitPercentUpdateResult> {
  const res = await api.patch<CustomerCareBulkProfitPercentUpdateResult>(
    `/customer-care/staff/${encodeURIComponent(staffId)}/profit-percent/bulk`,
    payload,
  );
  return res.data;
}
