import { describe, expect, it } from "vitest";
import type { ClassTeacher } from "@/dtos/class.dto";
import { resolveOwnPayLockedClassDefaults } from "./class-teacher-own-pay";

const teacher = (overrides: Partial<ClassTeacher>): ClassTeacher => ({
  id: "manager-1",
  fullName: "Quản lý",
  assignmentStatus: "active",
  customAllowance: null,
  customScaleAmount: null,
  ...overrides,
});

describe("resolveOwnPayLockedClassDefaults (#276)", () => {
  it("khoá cả 3 mức khi Quản lý lớp đang dạy và kế thừa mức lớp", () => {
    expect(resolveOwnPayLockedClassDefaults([teacher({})], "manager-1")).toEqual({
      allowance: true,
      maxAllowance: true,
      scale: true,
    });
  });

  it("chỉ khoá trần khi Quản lý lớp có trợ cấp và scale riêng", () => {
    expect(
      resolveOwnPayLockedClassDefaults(
        [teacher({ customAllowance: 100000, customScaleAmount: 0 })],
        "manager-1",
      ),
    ).toEqual({ allowance: false, maxAllowance: true, scale: false });
  });

  it("không khoá gì khi Quản lý lớp không dạy hoặc đã nghỉ dạy lớp", () => {
    const none = { allowance: false, maxAllowance: false, scale: false };
    expect(resolveOwnPayLockedClassDefaults([teacher({ id: "t-2" })], "manager-1")).toEqual(none);
    expect(
      resolveOwnPayLockedClassDefaults([teacher({ assignmentStatus: "inactive" })], "manager-1"),
    ).toEqual(none);
    expect(resolveOwnPayLockedClassDefaults([teacher({})], null)).toEqual(none);
  });
});
