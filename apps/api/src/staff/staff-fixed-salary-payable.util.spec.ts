import { PaymentStatus, StaffRole } from 'generated/enums';
import {
  mapFixedSalaryPayableToPreviewRecord,
  recalcFixedSalaryPayableAmounts,
} from './staff-fixed-salary-payable.util';

describe('staff-fixed-salary-payable.util', () => {
  it('recalculates net from frozen rates after a gross edit', () => {
    const result = recalcFixedSalaryPayableAmounts({
      grossAmount: 5_000_000,
      operatingRatePercent: 10,
      taxRatePercent: 10,
    });

    expect(result).toEqual({
      grossAmount: 5_000_000,
      operatingRatePercent: 10,
      taxRatePercent: 10,
      operatingDeductionAmount: 500_000,
      taxDeductionAmount: 450_000,
      netAmount: 4_050_000,
    });
  });

  it('maps a payable to a payment-preview row without mixing into other sources', () => {
    const record = mapFixedSalaryPayableToPreviewRecord(
      {
        id: 'payable-1',
        roleType: StaffRole.assistant,
        month: '2026-09',
        status: PaymentStatus.pending,
        note: 'Vào giữa tháng',
        grossAmount: 4_000_000,
        operatingRatePercent: 10,
        taxRatePercent: 5,
        operatingDeductionAmount: 400_000,
        taxDeductionAmount: 180_000,
        netAmount: 3_420_000,
      },
      'Trợ lí',
    );

    expect(record.sourceType).toBe('fixed_salary');
    expect(record.sourceLabel).toBe('Lương cứng');
    expect(record.role).toBe(StaffRole.assistant);
    expect(record.label).toBe('Vào giữa tháng');
    expect(record.netAmount).toBe(3_420_000);
    expect(record.operatingAmount).toBe(400_000);
  });
});
