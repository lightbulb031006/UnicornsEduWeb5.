import { describe, expect, it } from "vitest";

import {
  computeTeacherSessionAllowanceGrossPreviewVnd,
  formatSessionAllowanceBreakdownVnd,
  resolveSessionAllowancePreviewInputs,
} from "./session-allowance.helpers";

describe("resolveSessionAllowancePreviewInputs", () => {
  it("uses session snapshot when available", () => {
    const result = resolveSessionAllowancePreviewInputs({
      session: {
        snapshotPerStudentAllowance: 50_000,
        snapshotScaleAmount: 100_000,
      },
      classDetail: {
        allowancePerSessionPerStudent: 80_000,
        scaleAmount: 200_000,
        teachers: [{ id: "teacher-1", customAllowance: 90_000 }],
      },
      teacherId: "teacher-1",
      chargeableStudentCount: 3,
    });

    expect(result?.source).toBe("snapshot");
    expect(result?.perStudent).toBe(50_000);
    expect(result?.scaleAmount).toBe(100_000);
    expect(result?.rawBase).toBe(250_000);
  });

  it("falls back to live class config", () => {
    const result = resolveSessionAllowancePreviewInputs({
      session: {
        snapshotPerStudentAllowance: null,
        snapshotScaleAmount: null,
      },
      classDetail: {
        allowancePerSessionPerStudent: 40_000,
        scaleAmount: 60_000,
        teachers: [{ id: "teacher-2", customAllowance: 55_000 }],
      },
      teacherId: "teacher-2",
      chargeableStudentCount: 2,
    });

    expect(result?.source).toBe("live");
    expect(result?.perStudent).toBe(55_000);
    expect(result?.scaleAmount).toBe(60_000);
    expect(result?.rawBase).toBe(170_000);
  });

  it("per_block: dùng đơn giá / 30 phút × số block thực tế của buổi", () => {
    const result = resolveSessionAllowancePreviewInputs({
      session: null,
      classDetail: {
        allowancePerSessionPerStudent: 90_000,
        allowancePerBlockPerStudent: 30_000,
        scaleAmount: 10_000,
        pricingMode: "per_block",
        teachers: [],
      },
      chargeableStudentCount: 2,
      blockCount: 4,
    });

    expect(result?.source).toBe("live");
    expect(result?.perStudent).toBe(120_000);
    expect(result?.rawBase).toBe(250_000);
  });

  it("per_session: bỏ qua hoàn toàn cột block", () => {
    const result = resolveSessionAllowancePreviewInputs({
      session: null,
      classDetail: {
        allowancePerSessionPerStudent: 90_000,
        allowancePerBlockPerStudent: 30_000,
        scaleAmount: 10_000,
        pricingMode: "per_session",
        teachers: [],
      },
      chargeableStudentCount: 2,
      blockCount: 4,
    });

    expect(result?.perStudent).toBe(90_000);
    expect(result?.rawBase).toBe(190_000);
  });
});

describe("formatSessionAllowanceBreakdownVnd", () => {
  it("renders readable formula", () => {
    const text = formatSessionAllowanceBreakdownVnd({
      perStudent: 50_000,
      chargeableStudentCount: 4,
      scaleAmount: 100_000,
      rawBase: 300_000,
    });

    expect(text).toMatch(/50\.000đ\/hs × 4 hs \+ 100\.000đ = 300\.000đ/);
  });
});

describe("computeTeacherSessionAllowanceGrossPreviewVnd", () => {
  it("per_block: trần là max_allowance_per_block × số block", () => {
    expect(
      computeTeacherSessionAllowanceGrossPreviewVnd({
        rawBase: 1_000_000,
        coefficient: 1,
        pricingMode: "per_block",
        maxAllowancePerBlock: 100_000,
        maxAllowancePerSession: 200_000,
        snapshotBlockCount: 4,
      }),
    ).toBe(400_000);
  });

  it("per_session: trần vẫn là max_allowance_per_session, không đụng cột block", () => {
    expect(
      computeTeacherSessionAllowanceGrossPreviewVnd({
        rawBase: 1_000_000,
        coefficient: 1,
        pricingMode: "per_session",
        maxAllowancePerBlock: 100_000,
        maxAllowancePerSession: 200_000,
        snapshotBlockCount: 4,
      }),
    ).toBe(200_000);
  });
});
