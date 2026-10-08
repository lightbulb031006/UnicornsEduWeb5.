import { describe, expect, it } from "vitest";

import {
  computeTeacherSessionAllowanceGrossPreviewVnd,
  formatSessionAllowanceBreakdownVnd,
  resolveSessionAllowancePreviewInputs,
  resolveTeacherScaleAmountVnd,
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

  it("live: dùng scale riêng của gia sư dạy buổi, 0 = không có scale", () => {
    const classDetail = {
      allowancePerSessionPerStudent: 40_000,
      scaleAmount: 60_000,
      teachers: [
        { id: "teacher-zero", customScaleAmount: 0 },
        { id: "teacher-custom", customScaleAmount: 25_000 },
        { id: "teacher-inherit", customScaleAmount: null },
      ],
    };
    const preview = (teacherId: string) =>
      resolveSessionAllowancePreviewInputs({
        session: null,
        classDetail,
        teacherId,
        chargeableStudentCount: 2,
      });

    expect(preview("teacher-zero")?.scaleAmount).toBe(0);
    expect(preview("teacher-zero")?.rawBase).toBe(80_000);
    expect(preview("teacher-custom")?.scaleAmount).toBe(25_000);
    expect(preview("teacher-inherit")?.scaleAmount).toBe(60_000);
  });

  it("per_block: scale riêng vẫn phẳng, không nhân block", () => {
    const result = resolveSessionAllowancePreviewInputs({
      session: null,
      classDetail: {
        allowancePerSessionPerStudent: 90_000,
        allowancePerBlockPerStudent: 30_000,
        scaleAmount: 10_000,
        pricingMode: "per_block",
        teachers: [{ id: "teacher-1", customScaleAmount: 20_000 }],
      },
      teacherId: "teacher-1",
      chargeableStudentCount: 2,
      blockCount: 4,
    });

    expect(result?.scaleAmount).toBe(20_000);
    expect(result?.rawBase).toBe(260_000);
  });
});

describe("resolveTeacherScaleAmountVnd", () => {
  it("giữ 0 làm override, null/undefined theo lớp", () => {
    expect(
      resolveTeacherScaleAmountVnd({ customScaleAmount: 0, classScaleAmount: 50_000 }),
    ).toBe(0);
    expect(
      resolveTeacherScaleAmountVnd({ customScaleAmount: null, classScaleAmount: 50_000 }),
    ).toBe(50_000);
    expect(resolveTeacherScaleAmountVnd({ classScaleAmount: null })).toBe(0);
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
