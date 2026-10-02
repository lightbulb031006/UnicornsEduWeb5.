import {
  computeDefaultSessionAllowanceAmountVnd,
  computeSessionAllowanceAmountVnd,
  computeTeacherSessionCappedGrossVnd,
  hasSessionAllowanceSnapshots,
  resolveLiveSessionAllowanceSnapshots,
  resolveSnapshotPerStudentAllowanceVnd,
  resolveSnapshotScaleAmountVnd,
  resolveTeacherSessionAllowanceCapVnd,
} from './session-allowance.util';
import { presentCustomAllowanceAsPerSession } from '../common/block-pricing.util';

describe('session-allowance.util', () => {
  it('resolves per-student allowance from custom then class default', () => {
    expect(
      resolveSnapshotPerStudentAllowanceVnd({
        customAllowance: 60_000,
        classDefaultPerStudent: 50_000,
      }),
    ).toBe(60_000);
    expect(
      resolveSnapshotPerStudentAllowanceVnd({
        customAllowance: null,
        classDefaultPerStudent: 50_000,
      }),
    ).toBe(50_000);
  });

  it('computes allowance from stored snapshots and chargeable count', () => {
    expect(
      computeDefaultSessionAllowanceAmountVnd({
        perStudentAllowance: 50_000,
        classDefaultPerStudent: null,
        scaleAmount: 100_000,
        chargeableStudentCount: 3,
      }),
    ).toBe(250_000);
    expect(
      computeDefaultSessionAllowanceAmountVnd({
        perStudentAllowance: 50_000,
        classDefaultPerStudent: null,
        scaleAmount: 100_000,
        chargeableStudentCount: 0,
      }),
    ).toBe(100_000);
  });

  it('detects whether session allowance snapshots exist', () => {
    expect(
      hasSessionAllowanceSnapshots({
        snapshotPerStudentAllowance: 0,
        snapshotScaleAmount: null,
      }),
    ).toBe(true);
    expect(
      hasSessionAllowanceSnapshots({
        snapshotPerStudentAllowance: null,
        snapshotScaleAmount: null,
      }),
    ).toBe(false);
  });

  it('normalizes snapshot scale amount', () => {
    expect(resolveSnapshotScaleAmountVnd(120_000)).toBe(120_000);
    expect(resolveSnapshotScaleAmountVnd(null)).toBe(0);
  });

  it('regression: per-session mode reconstructs custom allowance then uses the old formula', () => {
    const reconstructed = presentCustomAllowanceAsPerSession(30_000, 3, true);
    expect(reconstructed).toBe(90_000);
    expect(
      computeDefaultSessionAllowanceAmountVnd({
        perStudentAllowance: reconstructed,
        classDefaultPerStudent: 90_000,
        scaleAmount: 0,
        chargeableStudentCount: 2,
      }),
    ).toBe(180_000);
    expect(
      computeSessionAllowanceAmountVnd({
        pricingMode: 'per_session',
        perStudentAllowance: reconstructed,
        classDefaultPerStudent: 90_000,
        scaleAmount: 0,
        chargeableStudentCount: 2,
        blockCount: 3,
      }),
    ).toBe(180_000);
  });

  it('regression: live per_session snapshots match pre-block-formula results to the đồng', () => {
    const reconstructed = presentCustomAllowanceAsPerSession(30_000, 3, true);
    const live = resolveLiveSessionAllowanceSnapshots({
      pricingMode: 'per_session',
      customAllowanceStored: 30_000,
      classDefaultPerStudent: 90_000,
      classDefaultPerBlock: 30_000,
      scaleAmount: 50_000,
      reconstructionBlocks: 3,
      storedAsPerBlock: true,
      snapshotBlockCount: null,
      chargeableStudentCount: 2,
      presentCustomAsPerSession: reconstructed,
    });
    expect(live.snapshotPerStudentAllowance).toBe(90_000);
    expect(live.snapshotScaleAmount).toBe(50_000);
    expect(live.allowanceAmount).toBe(230_000);
    expect(
      computeDefaultSessionAllowanceAmountVnd({
        perStudentAllowance: 90_000,
        classDefaultPerStudent: 90_000,
        scaleAmount: 50_000,
        chargeableStudentCount: 2,
      }),
    ).toBe(230_000);
  });

  it('per_block: allowance = per-block rate × chargeable count × blocks + scale (scale not multiplied)', () => {
    expect(
      computeSessionAllowanceAmountVnd({
        pricingMode: 'per_block',
        customAllowanceStored: 30_000,
        classDefaultPerBlock: 25_000,
        storedAsPerBlock: true,
        scaleAmount: 50_000,
        chargeableStudentCount: 2,
        blockCount: 4,
      }),
    ).toBe(30_000 * 2 * 4 + 50_000);
  });

  it('per_block: inherited class default uses per-block rate × actual session blocks', () => {
    const live = resolveLiveSessionAllowanceSnapshots({
      pricingMode: 'per_block',
      customAllowanceStored: null,
      classDefaultPerStudent: 90_000,
      classDefaultPerBlock: 30_000,
      scaleAmount: 10_000,
      reconstructionBlocks: 3,
      storedAsPerBlock: true,
      snapshotBlockCount: 4,
      chargeableStudentCount: 2,
      presentCustomAsPerSession: null,
    });
    expect(live.snapshotPerStudentAllowance).toBe(120_000);
    expect(live.allowanceAmount).toBe(250_000);
    expect(
      computeDefaultSessionAllowanceAmountVnd({
        perStudentAllowance: live.snapshotPerStudentAllowance,
        classDefaultPerStudent: null,
        scaleAmount: live.snapshotScaleAmount,
        chargeableStudentCount: 2,
      }),
    ).toBe(live.allowanceAmount);
  });

  it('per_block floors to integer VND', () => {
    expect(
      computeSessionAllowanceAmountVnd({
        pricingMode: 'per_block',
        customAllowanceStored: 33_333,
        storedAsPerBlock: true,
        scaleAmount: 0,
        chargeableStudentCount: 1,
        blockCount: 3,
      }),
    ).toBe(99_999);
  });

  it('applies max_allowance_per_session for per_session and max_per_block × blocks for per_block', () => {
    expect(
      resolveTeacherSessionAllowanceCapVnd({
        pricingMode: 'per_session',
        maxAllowancePerSession: 200_000,
        maxAllowancePerBlock: 50_000,
        snapshotBlockCount: 4,
      }),
    ).toBe(200_000);
    expect(
      resolveTeacherSessionAllowanceCapVnd({
        pricingMode: 'per_block',
        maxAllowancePerSession: 200_000,
        maxAllowancePerBlock: 50_000,
        snapshotBlockCount: 4,
      }),
    ).toBe(200_000);
    expect(
      computeTeacherSessionCappedGrossVnd({
        allowanceAmount: 300_000,
        coefficient: 1,
        pricingMode: 'per_block',
        maxAllowancePerBlock: 50_000,
        snapshotBlockCount: 4,
      }),
    ).toBe(200_000);
    expect(
      computeTeacherSessionCappedGrossVnd({
        allowanceAmount: 300_000,
        coefficient: 1,
        pricingMode: 'per_session',
        maxAllowancePerSession: 200_000,
        maxAllowancePerBlock: 50_000,
        snapshotBlockCount: 4,
      }),
    ).toBe(200_000);
  });

  it('payroll cap for frozen per_block sessions without snapshot_block_count stays on max_allowance_per_session', () => {
    expect(
      resolveTeacherSessionAllowanceCapVnd({
        pricingMode: 'per_block',
        maxAllowancePerSession: 200_000,
        maxAllowancePerBlock: 50_000,
        snapshotBlockCount: null,
      }),
    ).toBe(200_000);
  });

  it('coefficient 0 (dạy thử) zeros gross before cap', () => {
    expect(
      computeTeacherSessionCappedGrossVnd({
        allowanceAmount: 250_000,
        coefficient: 0,
        pricingMode: 'per_block',
        maxAllowancePerBlock: 50_000,
        snapshotBlockCount: 4,
      }),
    ).toBe(0);
  });

  it('trợ cấp buổi học does not change when role-default fixed-salary operating % is configured', () => {
    const sessionInputs = {
      perStudentAllowance: 80_000,
      classDefaultPerStudent: 80_000,
      scaleAmount: 0,
      chargeableStudentCount: 4,
    };
    const allowanceBeforeConfig =
      computeDefaultSessionAllowanceAmountVnd(sessionInputs);
    const configuredFixedSalaryOperatingPercent = 15;
    const allowanceAfterConfig =
      computeDefaultSessionAllowanceAmountVnd(sessionInputs);

    expect(allowanceAfterConfig).toBe(allowanceBeforeConfig);
    expect(allowanceAfterConfig).toBe(320_000);
    expect(allowanceAfterConfig).not.toBe(
      Math.round(
        allowanceBeforeConfig * (1 - configuredFixedSalaryOperatingPercent / 100),
      ),
    );

    type SessionAllowanceInput = Parameters<
      typeof computeDefaultSessionAllowanceAmountVnd
    >[0];
    type ForbiddenKeys = Extract<
      keyof SessionAllowanceInput,
      'operatingRatePercent' | 'fixedSalaryOperatingRatePercent'
    >;
    type AssertNever<T extends never> = T;
    type _NoOperatingOnSessionAllowance = AssertNever<ForbiddenKeys>;
    const _typeCheck: _NoOperatingOnSessionAllowance = undefined as never;
    void _typeCheck;
  });
});
