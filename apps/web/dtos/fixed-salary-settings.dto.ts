export const FIXED_SALARY_STAFF_ROLES = [
  "admin",
  "lesson_plan",
  "lesson_plan_head",
  "accountant",
  "accountant_income",
  "accountant_expense",
  "communication",
  "technical",
  "customer_care",
  "training",
  "assistant",
] as const;

export type FixedSalaryStaffRole = (typeof FIXED_SALARY_STAFF_ROLES)[number];

/** Closed-month payables may still be `teacher` from months before that role left fixed salary. */
export type ClosedFixedSalaryRole = FixedSalaryStaffRole | "teacher";

export function isFixedSalaryStaffRole(
  role: string,
): role is FixedSalaryStaffRole {
  return (FIXED_SALARY_STAFF_ROLES as readonly string[]).includes(role);
}

export interface RoleFixedSalaryDefault {
  roleType: FixedSalaryStaffRole;
  id: string | null;
  amount: number | null;
  updatedAt: string | null;
}

export interface RoleFixedSalaryDefaultsResponse {
  roles: RoleFixedSalaryDefault[];
}

export interface UpsertRoleFixedSalaryDefaultItemPayload {
  roleType: FixedSalaryStaffRole;
  amount: number | null;
}

export interface UpsertRoleFixedSalaryDefaultsPayload {
  items: UpsertRoleFixedSalaryDefaultItemPayload[];
}

export interface RoleFixedSalaryOperatingRateDefault {
  roleType: FixedSalaryStaffRole;
  id: string | null;
  operatingRatePercent: number | null;
  updatedAt: string | null;
}

export interface RoleFixedSalaryOperatingRatesResponse {
  roles: RoleFixedSalaryOperatingRateDefault[];
}

export interface UpsertRoleFixedSalaryOperatingRateItemPayload {
  roleType: FixedSalaryStaffRole;
  operatingRatePercent: number | null;
}

export interface UpsertRoleFixedSalaryOperatingRatesPayload {
  items: UpsertRoleFixedSalaryOperatingRateItemPayload[];
}

export type FixedSalaryAxisSource =
  | "override"
  | "role_default"
  | "unconfigured";

export interface ResolvedFixedSalaryAxis {
  applied: number | null;
  source: FixedSalaryAxisSource;
  hasOverride: boolean;
  overrideValue: number | null;
  roleDefaultValue: number | null;
}

export interface StaffFixedSalaryRoleRow {
  roleType: FixedSalaryStaffRole;
  amount: ResolvedFixedSalaryAxis;
  operatingRate: ResolvedFixedSalaryAxis;
}

export interface StaffFixedSalaryOverrideStaff {
  staffId: string;
  fullName: string;
  roles: StaffFixedSalaryRoleRow[];
}

export interface StaffFixedSalaryOverridesResponse {
  staff: StaffFixedSalaryOverrideStaff[];
}

export interface StaffFixedSalaryOverridesQuery {
  search?: string;
  staffId?: string;
  limit?: number;
}

export interface StaffRoleFixedSalaryOverrideItem {
  roleType: FixedSalaryStaffRole;
  amount?: number | null;
  operatingRatePercent?: number | null;
}

export interface UpsertStaffFixedSalaryAmountPayload {
  staffId: string;
  roleType: FixedSalaryStaffRole;
  amount: number | null;
}

export interface UpsertStaffFixedSalaryOperatingRatePayload {
  staffId: string;
  roleType: FixedSalaryStaffRole;
  operatingRatePercent: number | null;
}

export type FixedSalaryPayableStatus = "pending" | "paid";

export interface StaffFixedSalaryPayable {
  id: string;
  staffId: string;
  staffFullName: string;
  roleType: ClosedFixedSalaryRole;
  month: string;
  status: FixedSalaryPayableStatus;
  grossAmount: number;
  operatingRatePercent: number;
  taxRatePercent: number;
  operatingDeductionAmount: number;
  taxDeductionAmount: number;
  netAmount: number;
  createdAt: string;
}

export interface StaffFixedSalaryPayablesResponse {
  month: string;
  items: StaffFixedSalaryPayable[];
}

export interface CloseFixedSalaryMonthResponse {
  month: string;
  createdCount: number;
  skippedCount: number;
  items: StaffFixedSalaryPayable[];
}
