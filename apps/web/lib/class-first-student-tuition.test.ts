import { describe, expect, it } from "vitest";
import {
  hasClassTuitionForPricingMode,
  needsClassTuitionBeforeFirstStudent,
} from "./class-first-student-tuition";

const empty = {
  studentTuitionPerSession: null,
  studentTuitionPerBlock: null,
  tuitionPackageTotal: null,
  tuitionPackageSession: null,
};

describe("hasClassTuitionForPricingMode (#273)", () => {
  it("theo buổi: null = chưa điền, 0đ = đã điền", () => {
    expect(hasClassTuitionForPricingMode({ ...empty, pricingMode: "per_session" })).toBe(false);
    expect(
      hasClassTuitionForPricingMode({ ...empty, pricingMode: "per_session", studentTuitionPerSession: 0 }),
    ).toBe(true);
  });

  it("theo gói buổi: cần tổng gói + số buổi (gói 0đ = đã điền)", () => {
    expect(
      hasClassTuitionForPricingMode({
        ...empty,
        pricingMode: "per_session",
        tuitionPackageTotal: 3_600_000,
        tuitionPackageSession: 12,
      }),
    ).toBe(true);
    expect(
      hasClassTuitionForPricingMode({ ...empty, pricingMode: "per_session", tuitionPackageTotal: 3_600_000 }),
    ).toBe(false);
    expect(
      hasClassTuitionForPricingMode({ ...empty, pricingMode: "per_session", tuitionPackageTotal: 0 }),
    ).toBe(true);
  });

  it("theo 30 phút: học phí / 30 phút hoặc chuỗi theo buổi", () => {
    expect(hasClassTuitionForPricingMode({ ...empty, pricingMode: "per_block" })).toBe(false);
    expect(
      hasClassTuitionForPricingMode({ ...empty, pricingMode: "per_block", studentTuitionPerBlock: 0 }),
    ).toBe(true);
    expect(
      hasClassTuitionForPricingMode({ ...empty, pricingMode: "per_block", studentTuitionPerSession: 1 }),
    ).toBe(true);
  });

  it("trọn gói: chỉ tổng gói", () => {
    expect(
      hasClassTuitionForPricingMode({ ...empty, pricingMode: "one_time", studentTuitionPerSession: 1 }),
    ).toBe(false);
    expect(hasClassTuitionForPricingMode({ ...empty, pricingMode: "one_time", tuitionPackageTotal: 0 })).toBe(
      false,
    );
    expect(
      hasClassTuitionForPricingMode({ ...empty, pricingMode: "one_time", tuitionPackageTotal: 1_600_000 }),
    ).toBe(true);
  });
});

describe("needsClassTuitionBeforeFirstStudent (#273)", () => {
  it("chỉ áp khi lớp chưa có học sinh đang học", () => {
    const noTuition = { ...empty, pricingMode: "per_session" as const };
    expect(needsClassTuitionBeforeFirstStudent(noTuition, 0)).toBe(true);
    expect(needsClassTuitionBeforeFirstStudent(noTuition, 2)).toBe(false);
    expect(needsClassTuitionBeforeFirstStudent({ ...noTuition, studentTuitionPerSession: 0 }, 0)).toBe(false);
  });
});
