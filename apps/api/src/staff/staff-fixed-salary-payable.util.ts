import { PaymentStatus, StaffRole } from 'generated/enums';
import {
  calculateDeductionAmounts,
  normalizePercent,
} from '../payroll/deduction-rates';

export const FIXED_SALARY_PAYMENT_SOURCE = 'fixed_salary' as const;
export const FIXED_SALARY_SOURCE_LABEL = 'Lương cứng';

export type FixedSalaryPayableAmounts = {
  grossAmount: number;
  operatingRatePercent: number;
  taxRatePercent: number;
  operatingDeductionAmount: number;
  taxDeductionAmount: number;
  netAmount: number;
};

export type FixedSalaryPayableRow = FixedSalaryPayableAmounts & {
  id: string;
  roleType: StaffRole;
  month: string;
  status: PaymentStatus;
  note: string | null;
};

export function recalcFixedSalaryPayableAmounts(params: {
  grossAmount: number;
  operatingRatePercent: number | string;
  taxRatePercent: number | string;
}): FixedSalaryPayableAmounts {
  const operatingRatePercent = normalizePercent(params.operatingRatePercent);
  const taxRatePercent = normalizePercent(params.taxRatePercent);
  const deducted = calculateDeductionAmounts({
    grossAmount: params.grossAmount,
    operatingRatePercent,
    taxRatePercent,
  });

  return {
    grossAmount: deducted.grossAmount,
    operatingRatePercent,
    taxRatePercent,
    operatingDeductionAmount: deducted.operatingDeductionAmount,
    taxDeductionAmount: deducted.taxDeductionAmount,
    netAmount: deducted.netAmount,
  };
}

export function mapFixedSalaryPayableToPreviewRecord(
  row: FixedSalaryPayableRow,
  roleLabel: string,
) {
  const note = row.note?.trim() || null;

  return {
    id: row.id,
    role: row.roleType,
    sourceType: FIXED_SALARY_PAYMENT_SOURCE,
    sourceLabel: FIXED_SALARY_SOURCE_LABEL,
    label: note || `Lương cứng ${roleLabel}`,
    secondaryLabel: row.month,
    date: null,
    currentStatus: row.status,
    grossAmount: row.grossAmount,
    operatingAmount: row.operatingDeductionAmount,
    operatingRatePercent: row.operatingRatePercent,
    taxRatePercent: row.taxRatePercent,
    taxAmount: row.taxDeductionAmount,
    netAmount: row.netAmount,
  };
}
