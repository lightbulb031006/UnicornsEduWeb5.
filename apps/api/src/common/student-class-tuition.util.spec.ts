import {
  hasCustomTuitionOverride,
  normalizeStudentClassCustomTuitionMoney,
  resolveEffectiveTuitionPerSession,
  resolveSessionChargeTuitionFee,
} from './student-class-tuition.util';

describe('student-class-tuition.util', () => {
  it('treats custom tuition 0 as unset for effective per-session resolution', () => {
    expect(
      resolveEffectiveTuitionPerSession({
        customTuitionPerSession: 0,
        classTuitionPerSession: 200000,
        effectivePackageTotal: null,
        effectivePackageSession: null,
      }),
    ).toBe(200000);
  });

  it('keeps positive custom per-session override', () => {
    expect(
      resolveEffectiveTuitionPerSession({
        customTuitionPerSession: 150000,
        classTuitionPerSession: 200000,
        effectivePackageTotal: null,
        effectivePackageSession: null,
      }),
    ).toBe(150000);
  });

  it('derives per-session from custom package before class per-session', () => {
    expect(
      resolveEffectiveTuitionPerSession({
        customTuitionPerSession: null,
        classTuitionPerSession: 124750,
        effectivePackageTotal: 525000,
        effectivePackageSession: 4,
        hasCustomPackageOverride: true,
      }),
    ).toBe(131250);
  });

  it('inherits class per-session when there is no custom package override', () => {
    expect(
      resolveEffectiveTuitionPerSession({
        customTuitionPerSession: null,
        classTuitionPerSession: 124750,
        effectivePackageTotal: 499000,
        effectivePackageSession: 4,
        hasCustomPackageOverride: false,
      }),
    ).toBe(124750);
  });

  it('charges retail students per-block × session blocks, using custom per-block override', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: 180000,
        customTuitionPerBlock: 70000,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        blockCount: 4,
      }),
    ).toBe(280000);
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: null,
        customTuitionPerBlock: null,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        blockCount: 4,
      }),
    ).toBe(240000);
  });

  it('per_session: class package still charges per session even when block columns differ', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_session',
        customTuitionPerSession: null,
        classTuitionPerSession: null,
        classTuitionPerBlock: 60000,
        effectivePackageTotal: 3600000,
        effectivePackageSession: 12,
        hasCustomPackageOverride: false,
        blockCount: 4,
      }),
    ).toBe(300000);
    expect(
      resolveSessionChargeTuitionFee({
        customTuitionPerSession: null,
        classTuitionPerSession: null,
        classTuitionPerBlock: 60000,
        effectivePackageTotal: 3600000,
        effectivePackageSession: 12,
        hasCustomPackageOverride: false,
        blockCount: 3,
      }),
    ).toBe(300000);
  });

  it('per_session: custom package still beats class per-session; block columns ignored', () => {
    const inputs = {
      customTuitionPerSession: null,
      customTuitionPerBlock: 41600,
      classTuitionPerSession: 124750,
      classTuitionPerBlock: 41600,
      effectivePackageTotal: 525000,
      effectivePackageSession: 4,
      hasCustomPackageOverride: true as const,
      blockCount: 4,
    };
    expect(
      resolveSessionChargeTuitionFee({
        ...inputs,
        pricingMode: 'per_session',
      }),
    ).toBe(131250);
    expect(resolveSessionChargeTuitionFee(inputs)).toBe(131250);
  });

  it('per_block: class per-block beats class package; 120 phút thu hơn 90 phút theo tỉ lệ block', () => {
    const classWithPackageAndBlockRate = {
      pricingMode: 'per_block' as const,
      customTuitionPerSession: null,
      customTuitionPerBlock: null,
      classTuitionPerSession: null,
      classTuitionPerBlock: 60000,
      effectivePackageTotal: 3600000,
      effectivePackageSession: 12,
      hasCustomPackageOverride: false,
    };
    expect(
      resolveSessionChargeTuitionFee({
        ...classWithPackageAndBlockRate,
        blockCount: 3,
      }),
    ).toBe(180000);
    expect(
      resolveSessionChargeTuitionFee({
        ...classWithPackageAndBlockRate,
        blockCount: 4,
      }),
    ).toBe(240000);
  });

  it('per_block: class per-block beats custom discounted package', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: null,
        classTuitionPerSession: 124750,
        classTuitionPerBlock: 41600,
        effectivePackageTotal: 525000,
        effectivePackageSession: 4,
        hasCustomPackageOverride: true,
        blockCount: 4,
      }),
    ).toBe(166400);
  });

  it('per_block: student custom per-block beats class per-block and every package', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: 180000,
        customTuitionPerBlock: 70000,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        effectivePackageTotal: 3600000,
        effectivePackageSession: 12,
        hasCustomPackageOverride: true,
        blockCount: 3,
      }),
    ).toBe(210000);
  });

  it('per_block: custom per-session does not skip class per-block', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: 180000,
        customTuitionPerBlock: null,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        blockCount: 4,
      }),
    ).toBe(240000);
  });

  it('per_block: no per-block rate falls back to package per session', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: null,
        customTuitionPerBlock: null,
        classTuitionPerSession: null,
        classTuitionPerBlock: null,
        effectivePackageTotal: 3600000,
        effectivePackageSession: 12,
        hasCustomPackageOverride: false,
        blockCount: 4,
      }),
    ).toBe(300000);
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: null,
        customTuitionPerBlock: null,
        classTuitionPerSession: null,
        classTuitionPerBlock: null,
        effectivePackageTotal: 525000,
        effectivePackageSession: 4,
        hasCustomPackageOverride: true,
        blockCount: 4,
      }),
    ).toBe(131250);
  });

  it('charges class retail per-block even when class also has package fields', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        customTuitionPerSession: null,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        effectivePackageTotal: 3600000,
        effectivePackageSession: 12,
        hasCustomPackageOverride: false,
        blockCount: 4,
      }),
    ).toBe(240000);
  });

  it('falls back to per-session retail when per-block or block count is missing', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        classTuitionPerSession: 180000,
        classTuitionPerBlock: null,
        blockCount: 4,
      }),
    ).toBe(180000);
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_block',
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        blockCount: null,
      }),
    ).toBe(180000);
  });

  it('regression: per-session mode ignores populated block columns', () => {
    expect(
      resolveSessionChargeTuitionFee({
        pricingMode: 'per_session',
        customTuitionPerSession: null,
        customTuitionPerBlock: 70000,
        classTuitionPerSession: 180000,
        classTuitionPerBlock: 60000,
        effectivePackageTotal: 3600000,
        effectivePackageSession: 12,
        hasCustomPackageOverride: false,
        blockCount: 4,
      }),
    ).toBe(180000);
    expect(
      resolveEffectiveTuitionPerSession({
        customTuitionPerSession: null,
        classTuitionPerSession: 180000,
        effectivePackageTotal: 3600000,
        effectivePackageSession: 12,
        hasCustomPackageOverride: false,
      }),
    ).toBe(180000);
  });

  it('regression: omitted pricingMode matches explicit per_session and the pre-block retail formula', () => {
    const legacyInputs = {
      customTuitionPerSession: 150000,
      customTuitionPerBlock: 70000,
      classTuitionPerSession: 180000,
      classTuitionPerBlock: 60000,
      effectivePackageTotal: 3600000,
      effectivePackageSession: 12,
      hasCustomPackageOverride: false,
      blockCount: 4,
    };
    const legacyFee = resolveEffectiveTuitionPerSession({
      customTuitionPerSession: legacyInputs.customTuitionPerSession,
      classTuitionPerSession: legacyInputs.classTuitionPerSession,
      effectivePackageTotal: legacyInputs.effectivePackageTotal,
      effectivePackageSession: legacyInputs.effectivePackageSession,
      hasCustomPackageOverride: false,
    });
    expect(legacyFee).toBe(150000);
    expect(resolveSessionChargeTuitionFee(legacyInputs)).toBe(legacyFee);
    expect(
      resolveSessionChargeTuitionFee({
        ...legacyInputs,
        pricingMode: 'per_session',
      }),
    ).toBe(legacyFee);
    expect(
      resolveSessionChargeTuitionFee({
        ...legacyInputs,
        pricingMode: 'per_block',
      }),
    ).toBe(280000);
  });

  it('maps stored custom 0 to null for override detection', () => {
    expect(normalizeStudentClassCustomTuitionMoney(0)).toBeNull();
    expect(
      hasCustomTuitionOverride({
        customTuitionPerSession: 0,
        customTuitionPackageTotal: null,
        customTuitionPackageSession: null,
      }),
    ).toBe(false);
  });
});
