import { describe, expect, it } from "vitest";
import {
  REGULATION_AUDIENCE_LABELS,
  REGULATION_AUDIENCE_OPTIONS,
} from "./regulation.constants";
import { ROLE_LABELS } from "./staff.constants";

describe("bỏ role Kế toán chung (#266)", () => {
  it("không còn accountant trong danh sách role để chọn", () => {
    expect(Object.keys(ROLE_LABELS)).not.toContain("accountant");
    expect(Object.values(ROLE_LABELS)).not.toContain("Kế toán");
  });

  it("vẫn giữ Kế toán thu và Kế toán chi", () => {
    expect(ROLE_LABELS.accountant_income).toBe("Kế toán thu");
    expect(ROLE_LABELS.accountant_expense).toBe("Kế toán chi");
  });

  it("không còn đối tượng quy định staff_accountant", () => {
    expect(Object.keys(REGULATION_AUDIENCE_LABELS)).not.toContain(
      "staff_accountant",
    );
    const values = REGULATION_AUDIENCE_OPTIONS.map((option) => option.value);
    expect(values).not.toContain("staff_accountant");
    expect(values).toEqual(
      expect.arrayContaining([
        "staff_accountant_income",
        "staff_accountant_expense",
      ]),
    );
  });
});

describe("tên gọi Ban Chuyên môn / Trưởng ban Đào tạo (#280)", () => {
  it("nhãn role mới, enum giữ nguyên", () => {
    expect(ROLE_LABELS.lesson_plan).toBe("Ban Chuyên môn");
    expect(ROLE_LABELS.lesson_plan_head).toBe("Trưởng ban Chuyên môn");
    expect(ROLE_LABELS.training_head).toBe("Trưởng ban Đào tạo");
  });

  it("không còn tên cũ", () => {
    const labels = Object.values(ROLE_LABELS);
    for (const old of [
      "Chuyên môn",
      "Trưởng chuyên môn",
      "Trưởng giáo án",
      "Trưởng ban đào tạo",
    ]) {
      expect(labels).not.toContain(old);
    }
  });

  it("đối tượng quy định dùng nhãn role mới", () => {
    expect(REGULATION_AUDIENCE_LABELS.staff_lesson_plan).toBe("Ban Chuyên môn");
    expect(REGULATION_AUDIENCE_LABELS.staff_lesson_plan_head).toBe(
      "Trưởng ban Chuyên môn",
    );
    expect(REGULATION_AUDIENCE_LABELS.staff_training_head).toBe(
      "Trưởng ban Đào tạo",
    );
  });
});
