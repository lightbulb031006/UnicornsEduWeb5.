import type { StaffStatus } from "./staff.dto";

export type StudentStatus = "active" | "inactive";
export type StudentGender = "male" | "female";

export const STUDENT_CUSTOMER_SOURCES = [
  "tiktok",
  "fanpage_hoc_tin",
  "fanpage_luyen_tin",
  "referral",
  "personal",
  "returning_customer",
  "other",
] as const;

export type StudentCustomerSource = (typeof STUDENT_CUSTOMER_SOURCES)[number];

export const STUDENT_CUSTOMER_SOURCE_LABELS: Record<StudentCustomerSource, string> = {
  tiktok: "Tiktok",
  fanpage_hoc_tin: "Fanpage Học Toán Cùng Chuyên Toán",
  fanpage_luyen_tin: "Fanpage Luyện Toán THPT",
  referral: "Giới thiệu từ người quen của khách",
  personal: "Nguồn riêng của bản thân",
  returning_customer: "Khách cũ",
  other: "Khác",
};

export const STUDENT_DROP_OUT_REASON_MAX_LENGTH = 500;

export const STUDENT_CUSTOMER_SOURCE_OPTIONS = STUDENT_CUSTOMER_SOURCES.map((value) => ({
  value,
  label: STUDENT_CUSTOMER_SOURCE_LABELS[value],
}));
export type StudentWalletTransactionType =
  | "topup"
  | "loan"
  | "repayment"
  | "extend";

export interface StudentListMeta {
  total: number;
  page: number;
  limit: number;
}

export interface StudentClassItem {
  status?: "active" | "inactive" | null;
  class: {
    id: string;
    name: string;
    status?: "running" | "ended" | null;
  };
  customTuitionPerSession?: number | null;
  customTuitionPerBlock?: number | null;
  customTuitionPackageTotal?: number | null;
  customTuitionPackageSession?: number | null;
  effectiveTuitionPerSession?: number | null;
  effectiveTuitionPackageTotal?: number | null;
  effectiveTuitionPackageSession?: number | null;
  tuitionPackageSource?: "custom" | "class" | "unset";
  totalAttendedSession?: number | null;
}

/** Item from GET /student list */
export interface StudentListItem {
  id: string;
  fullName: string;
  email?: string | null;
  parentEmail?: string | null;
  parentReceiptEmailEnabled?: boolean;
  accountBalance?: number | null;
  recentTopUpTotalLast21Days?: number;
  recentTopUpMeetsThreshold?: boolean;
  school?: string | null;
  province?: string | null;
  status?: StudentStatus;
  gender?: StudentGender;
  createdAt?: string;
  updatedAt?: string;
  studentClasses?: StudentClassItem[];
}

export interface StudentListResponse {
  data: StudentListItem[];
  meta: StudentListMeta;
}

/** Detail from GET /student/:id */
export interface StudentDetail extends StudentListItem {
  userId?: string | null;
  avatarUrl?: string | null;
  avatarPath?: string | null;
  birthYear?: number | null;
  parentName?: string | null;
  parentPhone?: string | null;
  goal?: string | null;
  dropOutDate?: string | null;
  /** Lý do nghỉ học; giữ lại khi học sinh học lại. */
  dropOutReason?: string | null;
  customerSource?: StudentCustomerSource | null;
  customerSourceNote?: string | null;
  customerCare?: {
    staff: {
      id: string;
      fullName: string;
      roles: string[];
      status: StaffStatus;
    };
    profitPercent: number | null;
  } | null;
}

export interface StudentAssignableUser {
  id: string;
  email: string;
  accountHandle: string;
  province?: string | null;
  roleType: string;
  status: string;
  fullName?: string | null;
  hasStudentProfile: boolean;
  studentId?: string | null;
  hasStaffProfile: boolean;
  staffId?: string | null;
  isEligible: boolean;
  ineligibleReason?: string | null;
}

export interface StudentWalletTransaction {
  id: string;
  type: StudentWalletTransactionType;
  amount: number;
  note?: string | null;
  date?: string;
  createdAt: string;
}

export interface StudentExamScheduleItem {
  id: string;
  examDate: string;
  note?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type StudentSelfClassItem = StudentClassItem;

/** Phản hồi POST /users/me/student-wallet-sepay-topup-order */
export interface StudentSePayTopUpOrderResponse {
  id?: string;
  status?: string;
  amount: number;
  amountRequested?: number;
  amountReceived?: number | null;
  transferNote: string;
  parentEmail?: string | null;
  orderCode: string;
  qrCode?: string | null;
  qrCodeUrl?: string | null;
  orderId?: string | null;
  vaNumber?: string | null;
  bankName?: string | null;
  accountNumber?: string | null;
  accountHolderName?: string | null;
  expiredAt?: string | null;
}

export interface StudentSePayStaticQrResponse {
  studentId: string;
  classIds: string[];
  transferNote: string;
  qrCodeUrl: string;
  bankName?: string | null;
  accountNumber: string;
  accountHolderName?: string | null;
}

export type StudentWalletDirectTopUpRequestStatus =
  | "pending"
  | "approved"
  | "expired";

export interface CreateStudentWalletDirectTopUpRequestPayload {
  amount: number;
  reason: string;
}

export interface StudentWalletDirectTopUpRequestResponse {
  id: string;
  studentId: string;
  studentName: string;
  amount: number;
  reason: string;
  status: StudentWalletDirectTopUpRequestStatus;
  requestedByUserEmail?: string | null;
  requestedByRoleType?: string | null;
  expiresAt: string;
  createdAt: string;
  approvedAt?: string | null;
}

export type StudentWalletDirectTopUpRequestListStatus =
  | StudentWalletDirectTopUpRequestStatus
  | "all";

export interface StudentWalletDirectTopUpRequestListResponse {
  data: StudentWalletDirectTopUpRequestResponse[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface StudentWalletDirectTopUpApprovalResult {
  message: string;
  status: StudentWalletDirectTopUpRequestStatus;
  balanceAfter?: number | null;
}

export interface StudentSelfDetail {
  id: string;
  fullName: string;
  email?: string | null;
  parentEmail?: string | null;
  parentReceiptEmailEnabled?: boolean;
  accountBalance?: number | null;
  school?: string | null;
  province?: string | null;
  status?: StudentStatus;
  gender?: StudentGender;
  createdAt?: string;
  updatedAt?: string;
  birthYear?: number | null;
  parentName?: string | null;
  parentPhone?: string | null;
  goal?: string | null;
  studentClasses?: StudentSelfClassItem[];
}

export interface UpdateStudentPayload {
  full_name?: string;
  email?: string;
  parent_email?: string;
  parent_receipt_email_enabled?: boolean;
  school?: string;
  province?: string;
  birth_year?: number;
  parent_name?: string;
  parent_phone?: string;
  status?: StudentStatus;
  gender?: StudentGender;
  goal?: string;
  drop_out_date?: string;
  drop_out_reason?: string;
  customer_care_staff_id?: string | null;
  customer_care_profit_percent?: number | null;
  customer_source?: StudentCustomerSource;
  customer_source_note?: string | null;
}

export interface CreateStudentPayload {
  full_name: string;
  email?: string;
  parent_email?: string;
  parent_receipt_email_enabled?: boolean;
  school?: string;
  province?: string;
  birth_year?: number;
  parent_name?: string;
  parent_phone?: string;
  status?: StudentStatus;
  gender?: StudentGender;
  goal?: string;
  drop_out_date?: string;
  user_id: string;
  customer_source: StudentCustomerSource;
  customer_source_note?: string;
}

export interface UpdateStudentAccountBalancePayload {
  student_id: string;
  amount: number;
  reason: string;
}

export interface UpdateStudentClassesPayload {
  class_ids: string[];
}

export interface UpdateStudentExamSchedulesPayload {
  items: Array<{
    id?: string;
    examDate: string;
    note?: string | null;
  }>;
}
