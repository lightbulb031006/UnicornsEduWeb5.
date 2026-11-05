import type { StaffOption, StaffStatus } from "./staff.dto";
import type { StaffRole } from "./user.dto";

export type ExtraAllowanceStatus = "paid" | "pending";
export type ExtraAllowanceRoleType = StaffRole;
export type ExtraAllowanceUpsertMode = "create" | "edit";

export interface ExtraAllowanceListMeta {
  total: number;
  page: number;
  limit: number;
}

export interface ExtraAllowanceStaffSummary {
  id: string;
  fullName: string;
  status: StaffStatus;
  roles: string[];
}

/** Học sinh (khách hàng) của Trợ cấp sale; null khi học sinh đã bị xoá. */
export interface ExtraAllowanceStudentSummary {
  id: string;
  fullName: string;
}

export interface ExtraAllowanceBaseFields {
  staffId?: string;
  month?: string | null;
  amount?: number | null;
  status?: ExtraAllowanceStatus | null;
  note?: string | null;
  roleType?: ExtraAllowanceRoleType | null;
  staffRoles?: ExtraAllowanceRoleType[] | null;
  staff?: ExtraAllowanceStaffSummary | null;
  studentId?: string | null;
  student?: ExtraAllowanceStudentSummary | null;
}

export interface ExtraAllowanceListItem extends ExtraAllowanceBaseFields {
  id: string;
  createdAt?: string;
  updatedAt?: string;
}

export type ExtraAllowanceDetailResponse = ExtraAllowanceListItem;

export type SelfManagedExtraAllowanceRoleType = Extract<
  ExtraAllowanceRoleType,
  "communication" | "technical" | "training" | "sale"
>;

/** POST /users/me/staff-extra-allowances — self-service for communication/technical/training/sale */
export interface CreateMyStaffExtraAllowancePayload {
  roleType: SelfManagedExtraAllowanceRoleType;
  month: string;
  amount?: number;
  note?: string;
  /** Bắt buộc với sale. */
  studentId?: string;
}

/** PATCH /users/me/staff-extra-allowances — self-service, chỉ khoản chưa thanh toán */
export interface UpdateMyStaffExtraAllowancePayload {
  id: string;
  roleType: SelfManagedExtraAllowanceRoleType;
  month?: string;
  amount?: number;
  note?: string;
  studentId?: string;
}

/** GET /users/me/sale-student-options, GET /extra-allowance/student-options */
export interface SaleStudentOption {
  id: string;
  fullName: string;
  birthYear: number | null;
  school: string | null;
  /** `inactive` = học sinh nghỉ học. */
  status: string;
}

export interface CreateExtraAllowancePayload {
  staffId: string;
  month: string;
  amount?: number;
  status?: ExtraAllowanceStatus;
  note?: string;
  roleType: ExtraAllowanceRoleType;
  /** Bắt buộc với sale. */
  studentId?: string;
}

export interface UpdateExtraAllowancePayload {
  id: string;
  staffId?: string;
  month?: string;
  amount?: number;
  status?: ExtraAllowanceStatus;
  note?: string | null;
  roleType?: ExtraAllowanceRoleType;
  studentId?: string;
}

export interface BulkUpdateExtraAllowanceStatusPayload {
  allowanceIds: string[];
  status: ExtraAllowanceStatus;
}

export interface BulkUpdateExtraAllowanceStatusResult {
  requestedCount: number;
  updatedCount: number;
}

export interface ExtraAllowanceListResponse {
  data: ExtraAllowanceListItem[];
  meta: ExtraAllowanceListMeta;
}

export interface SearchExtraAllowanceParams {
  page: number;
  limit: number;
  search?: string;
  year?: string;
  month?: string;
  roleType?: ExtraAllowanceRoleType;
  staffId?: string;
  status?: ExtraAllowanceStatus;
}

export type ExtraAllowanceFormStaffOption = StaffOption;
