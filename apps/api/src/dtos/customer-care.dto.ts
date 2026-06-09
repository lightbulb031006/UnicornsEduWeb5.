import { PaymentStatus, StudentStatus } from 'generated/enums';

export interface CustomerCareStudentClassDto {
  id: string;
  name: string;
}

export interface CustomerCareStudentDto {
  id: string;
  fullName: string;
  accountBalance: number;
  province: string | null;
  status: StudentStatus | null;
  classes: CustomerCareStudentClassDto[];
  recentTopUpTotalLast21Days: number;
  recentTopUpMeetsThreshold: boolean;
}

export interface CustomerCareStudentListMetaDto {
  total: number;
  page: number;
  limit: number;
}

export interface CustomerCareStudentListDto {
  data: CustomerCareStudentDto[];
  meta: CustomerCareStudentListMetaDto;
}

export interface CustomerCareTopUpHistoryItemDto {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  note: string | null;
  date: string;
  createdAt: string;
}

export interface CustomerCareTopUpHistoryListDto {
  data: CustomerCareTopUpHistoryItemDto[];
  meta: CustomerCareStudentListMetaDto;
}

export type CustomerCareCommissionScope = 'pending' | 'month';

export interface CustomerCareCommissionListQueryDto {
  scope?: CustomerCareCommissionScope;
  month?: string;
  days?: number;
}

export interface CustomerCareCommissionDto {
  studentId: string;
  fullName: string;
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
}

export interface CustomerCareSessionCommissionDto {
  attendanceId: string;
  sessionId: string;
  date: string;
  className: string | null;
  tuitionFee: number;
  customerCareCoef: number;
  commission: number;
  paymentStatus: PaymentStatus;
}

export interface CustomerCareBulkPaymentStatusUpdateDto {
  attendanceIds: string[];
  paymentStatus: PaymentStatus;
}

export interface CustomerCareBulkPaymentStatusUpdateResultDto {
  staffId: string;
  requestedCount: number;
  updatedCount: number;
}
