export type StaffRoleType =
  | "teacher"
  | "assistant"
  | "accountant"
  | "accountant_income"
  | "accountant_expense"
  | "customer_care"
  | "lesson_plan"
  | "lesson_plan_head"
  | "communication"
  | "technical"
  | "training"
  | "sale";

export interface TaxDeductionSettingsQuery {
  asOfDate?: string;
  roleType?: StaffRoleType;
  staffId?: string;
}

export interface RoleTaxDeductionRate {
  id: string;
  roleType: StaffRoleType;
  ratePercent: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface StaffTaxDeductionOverride {
  id: string;
  staffId: string;
  staffName: string | null;
  roleType: StaffRoleType;
  ratePercent: number;
  effectiveFrom: string;
  createdAt: string;
}

export interface TaxDeductionSettingsResponse {
  asOfDate: string;
  roleDefaults: {
    current: RoleTaxDeductionRate[];
    history: RoleTaxDeductionRate[];
  };
  staffOverrides: {
    current: StaffTaxDeductionOverride[];
    history: StaffTaxDeductionOverride[];
  };
}

export interface CreateRoleTaxDeductionRatePayload {
  roleType: StaffRoleType;
  ratePercent: number;
  effectiveFrom: string;
}

export interface UpdateRoleTaxDeductionRatePayload {
  ratePercent: number;
  effectiveFrom: string;
}

export interface CreateStaffTaxDeductionOverridePayload {
  staffId: string;
  roleType: StaffRoleType;
  ratePercent: number;
  effectiveFrom: string;
}

export interface BulkUpsertStaffTaxDeductionOverrideItemPayload {
  overrideId?: string;
  roleType: StaffRoleType;
  ratePercent: number;
  effectiveFrom: string;
}

export interface BulkUpsertStaffTaxDeductionOverridesPayload {
  staffId: string;
  items: BulkUpsertStaffTaxDeductionOverrideItemPayload[];
}

export interface BulkUpsertStaffTaxDeductionOverridesResponse {
  staffId: string;
  updatedCount: number;
  overrides: StaffTaxDeductionOverride[];
}

export interface UpdateStaffTaxDeductionOverridePayload {
  ratePercent: number;
  effectiveFrom: string;
}
