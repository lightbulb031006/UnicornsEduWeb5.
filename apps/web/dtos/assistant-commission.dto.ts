import type { StudentStatus } from "./student.dto";

export type AssistantCommissionScope = "pending" | "all" | "month";

export type AssistantCommissionPaymentStatus = "pending" | "paid";

export interface AssistantCommissionListMeta {
  total: number;
  page: number;
  limit: number;
}

export interface AssistantManagedCustomerCareItem {
  customerCareStaffId: string;
  fullName: string;
  totalShareAmount: number;
  pendingShareAmount: number;
  paidShareAmount: number;
  debtStudentCount: number;
  totalDebtAmount: number;
}

export interface AssistantManagedCustomerCareListResponse {
  data: AssistantManagedCustomerCareItem[];
  meta: AssistantCommissionListMeta;
}

export interface AssistantManagedStudentItem {
  studentId: string;
  fullName: string;
  totalShareAmount: number;
  pendingShareAmount: number;
  paidShareAmount: number;
}

export interface AssistantManagedStudentListResponse {
  data: AssistantManagedStudentItem[];
  meta: AssistantCommissionListMeta;
}

export interface AssistantSessionShareItem {
  attendanceId: string;
  sessionId: string;
  date: string;
  className: string | null;
  tuitionFee: number;
  shareRatePercent: number;
  shareAmount: number;
  attendanceStatus: StudentStatus | "present" | "excused" | "absent";
  paymentStatus: AssistantCommissionPaymentStatus;
  customerCareStaffName: string;
}

export interface AssistantBulkPaymentStatusUpdatePayload {
  attendanceIds: string[];
  paymentStatus: AssistantCommissionPaymentStatus;
}

export interface AssistantBulkPaymentStatusUpdateResult {
  assistantStaffId: string;
  requestedCount: number;
  updatedCount: number;
}
