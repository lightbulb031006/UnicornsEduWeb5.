import { resolveSessionChargeTuitionFee } from '../common/student-class-tuition.util';
import { computeLessonPlanHeadCommissionAmount } from '../payroll/lesson-plan-head-commission.util';
import { computeTrainingManagerSessionSnapshot } from '../training-manager/training-manager.utils';
import {
  computeSessionAllowanceAmountVnd,
  computeTeacherSessionCappedGrossVnd,
} from './session-allowance.util';

/**
 * Derived payroll lines read `attendance.tuition_fee` / session tuition total.
 * After retail tuition switches to per-block × snapshot blocks, these amounts
 * must follow the new charge (formulas themselves stay unchanged).
 */
describe('session charge derivatives follow the new retail tuition_fee', () => {
  const blockCount = 4;
  const tuitionFee = resolveSessionChargeTuitionFee({
    pricingMode: 'per_block',
    classTuitionPerSession: 180000,
    classTuitionPerBlock: 60000,
    blockCount,
  });

  it('uses the same block count as teacher-allowance snapshot (4 blocks × 60_000)', () => {
    expect(tuitionFee).toBe(240000);
  });

  it('computes training-manager allowance as % × tổng học phí buổi', () => {
    const snapshot = computeTrainingManagerSessionSnapshot({
      sessionTuitionTotal: tuitionFee ?? 0,
      trainingManagerStaffId: 'tm-1',
      trainingManagerRatePercent: 5,
    });
    expect(snapshot.trainingManagerAllowanceAmount).toBe(12000);
  });

  it('computes customer-care gross as tuition_fee × customer_care_coef', () => {
    const customerCareCoef = 0.1;
    expect((tuitionFee ?? 0) * customerCareCoef).toBe(24000);
  });

  it('computes assistant share as ROUND(tuition_fee × 0.03)', () => {
    expect(Math.round((tuitionFee ?? 0) * 0.03)).toBe(7200);
  });

  it('computes lesson-plan-head commission as ROUND(tuition_fee × % / 100)', () => {
    expect(computeLessonPlanHeadCommissionAmount(tuitionFee ?? 0, 2)).toBe(
      4800,
    );
  });
});

describe('session charge derivatives follow teacher allowance snapshot', () => {
  const snapshot = {
    pricingMode: 'per_block' as const,
    customAllowanceStored: 30_000,
    storedAsPerBlock: true,
    scaleAmount: 10_000,
    chargeableStudentCount: 2,
    blockCount: 4,
  };
  const allowanceAmount = computeSessionAllowanceAmountVnd(snapshot);

  it('does not multiply scale_amount by block count', () => {
    expect(allowanceAmount).toBe(250_000);
  });

  it('payroll caps using snapshot_block_count, not session clock', () => {
    expect(
      computeTeacherSessionCappedGrossVnd({
        allowanceAmount,
        coefficient: 1,
        pricingMode: 'per_block',
        maxAllowancePerBlock: 40_000,
        snapshotBlockCount: snapshot.blockCount,
      }),
    ).toBe(160_000);
  });

  it('training-manager still reads tuition_fee, not teacher allowance', () => {
    const tuitionFee = resolveSessionChargeTuitionFee({
      pricingMode: 'per_block',
      classTuitionPerBlock: 60000,
      blockCount: 4,
    });
    const tm = computeTrainingManagerSessionSnapshot({
      sessionTuitionTotal: tuitionFee ?? 0,
      trainingManagerStaffId: 'tm-1',
      trainingManagerRatePercent: 5,
    });
    expect(tm.trainingManagerAllowanceAmount).toBe(12000);
    expect(tm.trainingManagerAllowanceAmount).not.toBe(allowanceAmount);
  });
});
