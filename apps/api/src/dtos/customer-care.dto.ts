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
  /** Phân số 0.00-0.99; FE hiển thị `Math.round(profitPercent * 100)}%`. */
  profitPercent: number | null;
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

export interface CustomerCareTopUpHistoryListMetaDto extends CustomerCareStudentListMetaDto {
  totalAmount: number;
}

export interface CustomerCareTopUpHistoryListDto {
  data: CustomerCareTopUpHistoryItemDto[];
  meta: CustomerCareTopUpHistoryListMetaDto;
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
  /** @deprecated Use monthCommission when month query is provided. */
  totalCommission: number;
  pendingCommission: number;
  paidCommission: number;
  monthCommission?: number;
}

export interface CustomerCareCommissionSummaryDto {
  studentCount: number;
  totalPending: number;
  totalMonthCommission: number;
}

export interface CustomerCareCommissionListDto {
  data: CustomerCareCommissionDto[];
  summary: CustomerCareCommissionSummaryDto;
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

export interface CustomerCareBulkProfitPercentUpdateDto {
  studentIds: string[];
  /** Phân số 0.00-0.99 (FE convert từ input số nguyên 0-99). */
  profitPercent: number;
}

export interface CustomerCareBulkProfitPercentUpdateResultDto {
  staffId: string;
  requestedCount: number;
  updatedCount: number;
}

export interface CustomerCareStudentSummaryDto {
  /** Tháng đang tính, dạng `YYYY-MM`. */
  monthKey: string;
  /** Số học sinh `status = active` đang được gán cho CSKH này. */
  activeStudentsCount: number;
  /** Số học sinh gán cho CSKH này có `dropOutDate` rơi trong tháng đang tính. */
  droppedStudentsThisMonth: number;
  /** Tổng học phí đã học (attendance present/excused) trong tháng, của mọi học sinh gán cho CSKH này. */
  revenueThisMonth: number;
}
